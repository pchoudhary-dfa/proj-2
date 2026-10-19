<?php
/**
 * Test POST /iam/users using the DFA CMS API client (dfa_cms_api_app).
 *
 * CMS client: requires_user_auth=0 — no JWT; svc.cms_api is auto-injected.
 * Role EXTERNAL_CMS_CLIENT must grant POST /iam/users (CREATE on sys_user_role).
 *
 *
 * Environment:
 *   DFA_API_BASE_URL=http://localhost:8000          (optional)
 *   DFA_API_KEY=dfa_cms_api_app                     (optional)
 *   DFA_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   DFA_PRIVATE_KEY_PATH=/path/to/private.pem
 *
 * One of DFA_PRIVATE_KEY_PEM / DFA_PRIVATE_KEY_PATH is required. The private key is
 * never committed; get it from the team secret store. Public key and placement:
 * docs/APP_CLIENT_AUTH.md — section "DFA CMS API (dfa_cms_api_app)".
 */

declare(strict_types=1);

/**
 * Build the canonical string signed by CMS API clients.
 *
 * Format: "<HTTP_METHOD>\n<PATH_WITH_QUERY>\n<UNIX_TIMESTAMP>"
 * See docs/APP_CLIENT_AUTH.md §3.1.
 */
function dfa_build_string_to_sign(string $method, string $pathWithQuery, int $timestamp): string
{
    return strtoupper($method) . "\n" . $pathWithQuery . "\n" . $timestamp;
}

/**
 * Sign a request string with an Ed25519 PKCS#8 PEM private key.
 *
 * Tries, in order: PHP sodium extension, PHP openssl extension, OpenSSL CLI.
 *
 * @return base64-encoded Ed25519 signature
 *
 * @throws RuntimeException When no signing backend succeeds
 */
function dfa_sign_ed25519(string $stringToSign, string $privateKeyPem): string
{
    $privateKeyPem = str_replace("\r\n", "\n", trim($privateKeyPem)) . "\n";

    if (extension_loaded('sodium')) {
        $der = base64_decode(
            preg_replace('/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/', '', $privateKeyPem),
            true
        );
        if ($der !== false && strlen($der) >= 32) {
            $seed = substr($der, -32);
            $keypair = sodium_crypto_sign_seed_keypair($seed);
            $secretKey = sodium_crypto_sign_secretkey($keypair);
            return base64_encode(sodium_crypto_sign_detached($stringToSign, $secretKey));
        }
    }

    $privateKey = openssl_pkey_get_private($privateKeyPem);
    if ($privateKey !== false) {
        $signature = '';
        if (openssl_sign($stringToSign, $signature, $privateKey)) {
            return base64_encode($signature);
        }
    }

    $cliSig = dfa_sign_ed25519_openssl_cli($stringToSign, $privateKeyPem);
    if ($cliSig !== null) {
        return $cliSig;
    }

    throw new RuntimeException(
        'Ed25519 signing failed. Enable the PHP sodium extension (recommended), or ensure '
        . 'openssl CLI is on PATH (OpenSSL 3+). Windows PHP builds often cannot sign Ed25519 via openssl_sign().'
    );
}

/**
 * Fallback signer using `openssl pkeyutl` when PHP extensions cannot sign Ed25519.
 *
 * @return base64-encoded signature, or null when CLI is unavailable or signing fails
 */
function dfa_sign_ed25519_openssl_cli(string $stringToSign, string $privateKeyPem): ?string
{
    if (!function_exists('shell_exec')) {
        return null;
    }

    $opensslBin = getenv('OPENSSL_BIN') ?: 'openssl';
    $keyFile = tempnam(sys_get_temp_dir(), 'dfa_key_');
    $msgFile = tempnam(sys_get_temp_dir(), 'dfa_msg_');
    if ($keyFile === false || $msgFile === false) {
        return null;
    }

    try {
        file_put_contents($keyFile, $privateKeyPem);
        file_put_contents($msgFile, $stringToSign);

        $cmd = sprintf(
            '%s pkeyutl -sign -inkey %s -rawin -in %s 2>&1',
            escapeshellcmd($opensslBin),
            escapeshellarg($keyFile),
            escapeshellarg($msgFile)
        );

        $output = shell_exec($cmd);
        if (!is_string($output) || $output === '' || str_contains($output, 'Error') || str_contains($output, 'not recognized')) {
            return null;
        }

        return base64_encode($output);
    } finally {
        @unlink($keyFile);
        @unlink($msgFile);
    }
}

/**
 * Send a signed POST /iam/users request to create one or more users.
 *
 * Adds X-Api-Key, X-Api-Timestamp, and X-Api-Signature headers per APP_CLIENT auth.
 * The JSON body must be an array of user objects (bulk create endpoint).
 *
 * @param list<array<string, mixed>> $jsonBody User payload array for POST /iam/users
 *
 * @return array{
 *     0: int,
 *     1: string,
 *     2: string|null,
 *     3: array{url: string, string_to_sign: string, x_api_signature: string}
 * } [httpCode, responseBody, curlError, debug]
 */
function dfa_create_user_request(
    string $baseUrl,
    string $method,
    string $pathWithQuery,
    mixed $jsonBody,
    string $apiKey,
    string $privateKeyPem
): array {
    $timestamp = time();
    $stringToSign = dfa_build_string_to_sign($method, $pathWithQuery, $timestamp);
    $signature = dfa_sign_ed25519($stringToSign, $privateKeyPem);

    $headers = [
        'X-Api-Key: ' . $apiKey,
        'X-Api-Timestamp: ' . $timestamp,
        'X-Api-Signature: ' . $signature,
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    $body = $jsonBody === null ? '' : json_encode($jsonBody, JSON_THROW_ON_ERROR);
    $url = rtrim($baseUrl, '/') . $pathWithQuery;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => $body !== '' ? $body : null,
        CURLOPT_TIMEOUT => 30,
    ]);

    $responseBody = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch) ?: null;
    curl_close($ch);

    if ($responseBody === false) {
        $responseBody = '';
    }

    return [$httpCode, $responseBody, $curlError, [
        'url' => $url,
        'string_to_sign' => $stringToSign,
        'x_api_signature' => $signature,
    ]];
}

/**
 * Resolve the Ed25519 private key PEM from the environment.
 *
 * Precedence: DFA_PRIVATE_KEY_PATH file → DFA_PRIVATE_KEY_PEM env.
 * Returns null when neither is set.
 */
function dfa_load_private_key_pem(string|false|null $envValue): ?string
{
    $pem = ($envValue !== false && $envValue !== null) ? $envValue : '';
    $pem = str_replace('\\n', "\n", $pem);

    $path = getenv('DFA_PRIVATE_KEY_PATH');
    if ($path !== false && $path !== '' && is_readable($path)) {
        $pem = (string) file_get_contents($path);
    }

    $pem = trim($pem);
    return $pem === '' ? null : $pem . "\n";
}

/**
 * Print HTTP status, signing debug info, and parsed JSON response to stdout.
 *
 * @param array{0: int, 1: string, 2: string|null, 3: array<string, string>} $result
 *        Output from dfa_create_user_request()
 */
function dfa_print_result(array $result): void
{
    [$httpCode, $body, $curlError, $debug] = $result;

    echo "URL: {$debug['url']}\n";
    echo "string_to_sign:\n{$debug['string_to_sign']}\n";
    echo "X-Api-Signature: {$debug['x_api_signature']}\n";
    echo "HTTP {$httpCode}\n";

    if ($curlError !== null) {
        echo "cURL error: {$curlError}\n";
    }

    $decoded = json_decode($body, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        echo json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    } else {
        echo $body . "\n";
    }
}

$baseUrl = getenv('DFA_API_BASE_URL') ?: 'http://localhost:8000';
$apiKey = getenv('DFA_API_KEY') ?: 'dfa_cms_api_app';

$privateKeyPem = dfa_load_private_key_pem(getenv('DFA_PRIVATE_KEY_PEM'));
if ($privateKeyPem === null) {
    fwrite(STDERR, "Set DFA_PRIVATE_KEY_PEM or DFA_PRIVATE_KEY_PATH to the dfa_cms_api_app Ed25519 private key.\n");
    exit(2);
}

$suffix = (string) time();
$path = '/iam/users';

$payload = [
    [
        'first_name' => 'CMS',
        'last_name' => 'TestUser',
        'username' => 'cms_test_' . $suffix,
        'email' => 'cms_test_' . $suffix . '@example.com',
        'status' => 1,
    ],
];

echo "=== CMS API — POST {$path} ===\n";
$result = dfa_create_user_request($baseUrl, 'POST', $path, $payload, $apiKey, $privateKeyPem);
dfa_print_result($result);

exit($result[0] >= 200 && $result[0] < 300 ? 0 : 1);
