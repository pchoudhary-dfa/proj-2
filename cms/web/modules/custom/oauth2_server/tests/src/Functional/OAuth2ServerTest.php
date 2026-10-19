<?php

namespace Drupal\Tests\oauth2_server\Functional;

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Site\Settings;
use Drupal\Core\Url;
use Drupal\Tests\BrowserTestBase;
use Drupal\oauth2_server\Utility;
use GuzzleHttp\Exception\ClientException;
use OAuth2\Encryption\Jwt;
use Psr\Http\Message\ResponseInterface;

/**
 * The OAuth2 Server admin test case.
 *
 * @group oauth2_server
 */
class OAuth2ServerTest extends BrowserTestBase {

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stable9';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['oauth2_server', 'oauth2_server_test'];

  /**
   * The client key of the test client.
   *
   * @var string
   */
  protected $clientId = 'test_client';

  /**
   * The client secret of the test client.
   *
   * @var string
   */
  protected $clientSecret = 'test_secret';

  /**
   * The redirect uri used on multiple locations.
   *
   * @var string
   */
  protected $redirectUri;

  /**
   * The public key X.509 certificate used for all tests with encryption.
   *
   * @var string
   */
  protected $publicKey = '-----BEGIN CERTIFICATE-----
MIIDMDCCApmgAwIBAgIBADANBgkqhkiG9w0BAQQFADB0MS0wKwYDVQQDEyRodHRw
czovL21hcmtldHBsYWNlLmludGVybmFsLmMtZy5pby8xCzAJBgNVBAYTAkFVMRMw
EQYDVQQIEwpTb21lLVN0YXRlMSEwHwYDVQQKExhJbnRlcm5ldCBXaWRnaXRzIFB0
eSBMdGQwHhcNMTQwMTIxMTYyMzAyWhcNMTQwMTIzMTYyMzAyWjB0MS0wKwYDVQQD
EyRodHRwczovL21hcmtldHBsYWNlLmludGVybmFsLmMtZy5pby8xCzAJBgNVBAYT
AkFVMRMwEQYDVQQIEwpTb21lLVN0YXRlMSEwHwYDVQQKExhJbnRlcm5ldCBXaWRn
aXRzIFB0eSBMdGQwgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBANVMpjmyWlaD
6N1x1O4cf5PB6fXjq4dx1zKh/znG/zMJhkaT0TNJDD+3zfpJYFFxZGrbde+dYinL
jDK+ROvq7+h+93r0eWrld+R/kNWgILJtWwXQACPDd0pVtdOiSSd90QSEfRZyyYCl
n8RvVIPdPbGiPtDQGDwV5Dc5WcupdJNBAgMBAAGjgdEwgc4wHQYDVR0OBBYEFO4C
ZtCI7/REm9UO+PFpbAAsHHOUMIGeBgNVHSMEgZYwgZOAFO4CZtCI7/REm9UO+PFp
bAAsHHOUoXikdjB0MS0wKwYDVQQDEyRodHRwczovL21hcmtldHBsYWNlLmludGVy
bmFsLmMtZy5pby8xCzAJBgNVBAYTAkFVMRMwEQYDVQQIEwpTb21lLVN0YXRlMSEw
HwYDVQQKExhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGSCAQAwDAYDVR0TBAUwAwEB
/zANBgkqhkiG9w0BAQQFAAOBgQCSCeFzNdUeFh0yNVatOdQpm2du1v7A4NXpdWL5
tXJQpv3Vgohc9f2GrVr1np270aJ3rzmSrWugZRHx0A3zhuYTNsapacvIOqmffPHd
0IZVnRgXnHPqwnWqMWuNtb8DglEEjKarjnOos/RbGvbirWsAJObxnt9kfI5wUOoA
0mYehA==
-----END CERTIFICATE-----';

  /**
   * The private key used for all tests with encryption.
   *
   * @var string
   */
  protected $privateKey = '-----BEGIN RSA PRIVATE KEY-----
MIICXgIBAAKBgQDVTKY5slpWg+jdcdTuHH+Twen146uHcdcyof85xv8zCYZGk9Ez
SQw/t836SWBRcWRq23XvnWIpy4wyvkTr6u/ofvd69Hlq5Xfkf5DVoCCybVsF0AAj
w3dKVbXTokknfdEEhH0WcsmApZ/Eb1SD3T2xoj7Q0Bg8FeQ3OVnLqXSTQQIDAQAB
AoGAa/aEHKgd+bSC5bN8Z5mdKZj5ZzB53fDNUB+XJBOJkLe9c3PWa/MJdCcA5zLE
wfR3M28p3sL2sNkKeZS9JfyguU0QQzMhrnJZMSwPzrcUEVcRI/3vCvgnWr/4UFBW
JQpdWGvmk9MNg83y/ddnIBHEQRI9POz/dt/4L58Vq5YUy8ECQQDuWHV2nMmvuAiW
/s+D+S8arhfUyupNEVhNvpqMxK/25s4rUHGadIWm2TPStWEyxQGE4Om4bcw8KOLw
iAeKQ/qFAkEA5RlDJHz0CEgW4+bM+rOIi+tLB2C+TLzKH0eDGpeImAdsk4Z53Lxm
22iZm3DtkEqrrl+bYiaQVFovtbd5wmS4jQJBALFlcXfo1kxNA0evO7CUZLTM4rvk
k2LtB/ZFaS5grj9sJgMjCorVMyyt+N5ZVZC+BJVr+Ujln98e51nzRPlqAykCQQC/
9rT94/2O2ujjOcdT4g9uPk/19KhAIIi0QPWn2IVJ7h6aVrnRrcP54OGlD7DfkNHe
IJpQWcPiClejygMqUb8ZAkEA6SFArj46gwFaERr+D8wMizfZdxhzEuMMG3angAuV
1VPFI7qyv4rtDVATTk8RXeXUcP7l3JaQbqh+Jf0d1eSUpg==
-----END RSA PRIVATE KEY-----';

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();

    $this->redirectUri = $this->buildUrl('/user', ['absolute' => TRUE]);

    // Set the keys so that the module can see them.
    $keys = [
      'public_key' => $this->publicKey,
      'private_key' => $this->privateKey,
    ];
    \Drupal::state()->set('oauth2_server.keys', $keys);
    \Drupal::state()->set('oauth2_server.last_generated', \Drupal::time()->getRequestTime());

    /** @var \Drupal\oauth2_server\ServerInterface $server */
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->create([
      'server_id' => 'test_server',
      'name' => 'Test Server',
      'settings' => [
        'default_scope' => 'test_server_basic',
        'enforce_state' => TRUE,
        'allow_implicit' => TRUE,
        'use_openid_connect' => TRUE,
        'use_crypto_tokens' => FALSE,
        'log_session_opened' => TRUE,
        'store_encrypted_token_string' => FALSE,
        'grant_types' => [
          'authorization_code' => 'authorization_code',
          'client_credentials' => 'client_credentials',
          'urn:ietf:params:oauth:grant-type:jwt-bearer' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          'refresh_token' => 'refresh_token',
          'password' => 'password',
        ],
        'always_issue_new_refresh_token' => TRUE,
        'advanced_settings' => [
          'require_exact_redirect_uri' => TRUE,
          'access_lifetime' => 3600,
          'id_lifetime' => 3600,
          'refresh_token_lifetime' => 1209600,
        ],
      ],
      'status' => TRUE,
    ]);
    $server->save();

    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $this->container->get('entity_type.manager')->getStorage('oauth2_server_client')->create([
      'client_id' => $this->clientId,
      'server_id' => $server->id(),
      'name' => 'Test client',
      'unhashed_client_secret' => $this->clientSecret,
      'public_key' => $this->publicKey,
      'redirect_uri' => 'https://google.com' . "\n" . $this->redirectUri,
      'automatic_authorization' => TRUE,
    ]);
    $client->save();

    $scopes = [
      'basic' => 'Basic',
      'admin' => 'Admin',
      'forbidden' => 'Forbidden',
      'phone' => 'phone',
      // Already generated by the server for the OpenID Connect:
      // 'openid', 'email', 'offline_access', 'profile' => 'Profile'.
    ];
    foreach ($scopes as $scope_name => $scope_label) {
      $scope = $this->container->get('entity_type.manager')->getStorage('oauth2_server_scope')->create([
        'scope_id' => $scope_name,
        'server_id' => $server->id(),
        'description' => $scope_label,
      ]);
      $scope->save();
    }
  }

  /**
   * Tests the authorization part of the flow.
   */
  public function testAuthorization() {
    // Create a user, log the user in, and retry the request.
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    $response = $this->authorizationCodeRequest('code');

    // Test the redirect_uri and authorization code.
    $redirect_url_parts = explode('?', $response->getHeader('location')[0]);
    $authorize_redirect = FALSE;
    if ($response->getStatusCode() == 302 && $redirect_url_parts[0] == $this->redirectUri) {
      $authorize_redirect = TRUE;
    }
    $this->assertTrue($authorize_redirect, 'User was properly redirected to the "redirect_uri".');

    $redirect_url_params = $this->getRedirectParams($response);
    $valid_code = (bool) $redirect_url_params['code'];
    $this->assertTrue($valid_code, 'The server returned an authorization code');
    $valid_token = $redirect_url_params['state'] == Crypt::hmacBase64($this->clientId, Settings::getHashSalt());
    $this->assertTrue($valid_token, 'The server returned a valid state');
  }

  /**
   * Tests the implicit flow.
   */
  public function testImplicitFlow() {
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    $response = $this->authorizationCodeRequest('token');

    $this->assertEquals(302, $response->getStatusCode(), 'The implicit flow request completed successfully');
    $parameters = $this->getRedirectParams($response, '#');
    $this->assertTokenResponse($parameters, FALSE);

    // We have received an access token. Verify it.
    // See http://drupal.org/node/1958718.
    if (!empty($parameters['access_token'])) {
      $verification_url = $this->buildUrl(new Url('oauth2_server.tokens', ['oauth2_server_token' => $parameters['access_token']]));
      $response = $this->httpGetRequest($verification_url);

      $verification_response = json_decode($response->getBody());
      $this->assertEquals(200, $response->getStatusCode(), 'The provided access token was successfully verified.');
      $this->assertEquals(urldecode($parameters['scope']), $verification_response->scope, 'The provided scope matches the scope of the verified access token.');
    }
  }

  /**
   * Tests the "Authorization code" grant type.
   */
  public function testAuthorizationCodeGrantType() {
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    // Perform authorization and get the code.
    $response = $this->authorizationCodeRequest('code');
    $redirect_url_params = $this->getRedirectParams($response);
    $authorization_code = $redirect_url_params['code'];

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'authorization_code',
      'code' => $authorization_code,
      'redirect_uri' => $this->redirectUri,
    ];
    $response = $this->httpPostRequest($token_url, $data);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');

    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload);
  }

  /**
   * Tests the "Client credentials" grant type.
   */
  public function testClientCredentialsGrantType() {
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'client_credentials',
    ];
    $response = $this->httpPostRequest($token_url, $data);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload, FALSE);
  }

  /**
   * Tests the "JWT bearer" grant type.
   */
  public function testJwtBearerGrantType() {
    $request_time = \Drupal::time()->getRequestTime();
    $sub_property = \Drupal::config('oauth2_server.oauth')
      ->get('user_sub_property');

    $jwt_util = new Jwt();
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $jwt_data = [
      'iss' => $this->clientId,
      'exp' => $request_time + 1000,
      'iat' => $request_time,
      'sub' => $user->{$sub_property}->value,
      'aud' => $token_url,
      'jti' => '123456',
    ];
    $data = [
      'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'assertion' => $jwt_util->encode($jwt_data, $this->privateKey, 'RS256'),
    ];
    $response = $this->httpPostRequest($token_url, $data, FALSE);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload, FALSE);
  }

  /**
   * Tests the "User credentials" grant type.
   */
  public function testPasswordGrantType() {
    $response = $this->passwordGrantRequest();
    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload);
  }

  /**
   * Tests the "Refresh token" grant type.
   */
  public function testRefreshTokenGrantType() {
    // Do a password grant first, in order to get the refresh token.
    $response = $this->passwordGrantRequest();
    $payload = json_decode($response->getBody());
    $refresh_token = $payload->refresh_token;

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'refresh_token',
      'refresh_token' => $refresh_token,
    ];
    $response = $this->httpPostRequest($token_url, $data);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    // The response will include a new refresh_token because
    // always_issue_new_refresh_token is TRUE.
    $this->assertTokenResponse($payload);
  }

  /**
   * Tests scopes.
   */
  public function testScopes() {
    // The default scope returned by oauth2_server_default_scope().
    $response = $this->passwordGrantRequest();
    $payload = json_decode($response->getBody());
    $this->assertEquals('admin basic', $payload->scope, 'The correct default scope was returned.');

    // A non-existent scope.
    try {
      $this->passwordGrantRequest('invalid_scope');
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(400, $e->getResponse()->getStatusCode(), 'Invalid scope correctly detected.');
      }
    }

    // A scope forbidden by oauth2_server_scope_access.
    // @see oauth2_server_test_entity_query_alter()
    try {
      $this->passwordGrantRequest('forbidden');
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(400, $e->getResponse()->getStatusCode(), 'Inaccessible scope correctly detected.');
      }
    }

    // A specific requested scope.
    $response = $this->passwordGrantRequest('admin');
    $payload = json_decode($response->getBody());
    $this->assertEquals('admin', $payload->scope, 'The correct scope was returned.');
  }

  /**
   * Tests the OpenID Connect authorization code flow.
   */
  public function testOpenIdConnectAuthorizationCodeFlow() {
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    // Perform authorization without the offline_access scope.
    // No refresh_token should be returned from the /token endpoint.
    $response = $this->authorizationCodeRequest('code', 'openid');
    $redirect_url_params = $this->getRedirectParams($response);
    $authorization_code = $redirect_url_params['code'];

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'authorization_code',
      'code' => $authorization_code,
      'redirect_uri' => $this->redirectUri,
    ];
    $response = $this->httpPostRequest($token_url, $data);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload, FALSE);
    if (!empty($payload->id_token)) {
      $this->assertIdToken($payload->id_token);
    }
    else {
      $this->assertTrue(FALSE, 'The token request returned an id_token.');
    }

    // Perform authorization witho the offline_access scope.
    // A refresh_token should be returned from the /token endpoint.
    $response = $this->authorizationCodeRequest('code', 'openid offline_access');
    $redirect_url_params = $this->getRedirectParams($response);
    $authorization_code = $redirect_url_params['code'];

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'authorization_code',
      'code' => $authorization_code,
      'redirect_uri' => $this->redirectUri,
    ];
    $response = $this->httpPostRequest($token_url, $data);

    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    $this->assertTokenResponse($payload);
    if (!empty($payload->id_token)) {
      $this->assertIdToken($payload->id_token);
    }
    else {
      $this->assertTrue(FALSE, 'The token request returned an id_token.');
    }
  }

  /**
   * Tests the OpenID Connect implicit flow.
   */
  public function testOpenIdConnectImplicitFlow() {
    $account = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($account);
    $response = $this->authorizationCodeRequest('id_token', 'openid email');
    $this->assertEquals(302, $response->getStatusCode(), 'The "id_token" implicit flow request completed successfully');
    $parameters = $this->getRedirectParams($response, '#');
    if (!empty($parameters['id_token'])) {
      $this->assertIdToken($parameters['id_token'], FALSE, $account);
    }
    else {
      $this->assertTrue(FALSE, 'The token request returned an id_token.');
    }

    $response = $this->authorizationCodeRequest('token id_token', 'openid email profile phone');
    $this->assertEquals(302, $response->getStatusCode(), 'The "token id_token" implicit flow request completed successfully');
    $parameters = $this->getRedirectParams($response, '#');
    $this->assertTokenResponse($parameters, FALSE);
    if (!empty($parameters['id_token'])) {
      $this->assertIdToken($parameters['id_token'], TRUE);
    }
    else {
      $this->assertTrue(FALSE, 'The token request returned an id_token.');
    }

    $account->timezone = 'Europe/London';
    $account->save();

    // Request OpenID Connect user information (claims).
    $query = [
      'access_token' => $parameters['access_token'],
    ];
    $info_url = $this->buildUrl(new Url('oauth2_server.userinfo'), ['query' => $query]);
    $response = $this->httpGetRequest($info_url);
    $payload = json_decode($response->getBody());

    $sub_property = \Drupal::config('oauth2_server.oauth')->get('user_sub_property');
    $expected_claims = [
      'sub' => $account->{$sub_property}->value,
      'email' => $account->mail->value,
      'email_verified' => TRUE,
      'phone_number' => '123456',
      'phone_number_verified' => FALSE,
      'preferred_username' => $account->name->value,
      'name' => $account->label(),
      'zoneinfo' => $account->timezone->value,
    ];

    foreach ($expected_claims as $claim => $expected_value) {
      $this->assertEquals($expected_value, $payload->$claim, 'The UserInfo endpoint returned a valid "' . $claim . '" claim');
    }
  }

  /**
   * Tests that the OpenID Connect 'sub' property affects user info 'sub' claim.
   */
  public function testOpenIdConnectNonDefaultSub() {
    $this->config('oauth2_server.oauth')->set('user_sub_property', 'name')->save();
    $response = $this->passwordGrantRequest('openid');
    $payload = json_decode($response->getBody());
    $access_token = $payload->access_token;

    $query = [
      'access_token' => $access_token,
    ];
    $info_url = $this->buildUrl(new Url('oauth2_server.userinfo'), ['query' => $query]);
    $response = $this->httpGetRequest($info_url);
    $payload = json_decode($response->getBody(), TRUE);
    $this->assertEquals($this->loggedInUser->name->value, $payload['sub'], 'The UserInfo "sub" is now the user\'s name.');
  }

  /**
   * Tests that the OpenID Connect 'sub' property affects ID token 'sub' claim.
   */
  public function testOpenIdConnectNonDefaultSubInIdToken() {
    $this->config('oauth2_server.oauth')->set('user_sub_property', 'name')->save();

    // This is the authorization code grant type flow.
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    $response = $this->authorizationCodeRequest('code', 'openid offline_access');
    $parameters = $this->getRedirectParams($response);
    $authorization_code = $parameters['code'];

    // Get tokens using the authorization code.
    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'authorization_code',
      'code' => $authorization_code,
      'redirect_uri' => $this->redirectUri,
    ];
    $response = $this->httpPostRequest($token_url, $data);
    $payload = json_decode($response->getBody());

    $parts = explode('.', $payload->id_token);
    $claims = json_decode(Utility::base64urlDecode($parts[1]), TRUE);
    $this->assertEquals($this->loggedInUser->name->value, $claims['sub'], 'The ID token "sub" is now the user\'s name.');
  }

  /**
   * Tests crypto tokens.
   */
  public function testCryptoTokens() {
    // Enable crypto tokens.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->settings['use_crypto_tokens'] = TRUE;
    $server->save();

    $response = $this->passwordGrantRequest();
    $this->assertEquals(200, $response->getStatusCode(), 'The token request completed successfully');
    $payload = json_decode($response->getBody());
    // The refresh token is contained inside the crypto token.
    $this->assertTokenResponse($payload, FALSE);

    $verified = FALSE;
    if (substr_count($payload->access_token, '.') == 2) {
      // Verify the JTW Access token following the instructions from
      // http://bshaffer.github.io/oauth2-server-php-docs/overview/jwt-access-tokens
      // phpcs:ignore Drupal.Arrays.Array.LongLineDeclaration
      [$header, $token_payload, $signature] = explode('.', $payload->access_token);
      // The signature is "url safe base64 encoded".
      $signature = base64_decode(strtr($signature, '-_,', '+/'));
      $payload_to_verify = mb_convert_encoding($header . '.' . $token_payload, 'ISO-8859-1', 'UTF-8');
      $verified = (bool) openssl_verify($payload_to_verify, $signature, $this->publicKey, 'sha256');
    }
    $this->assertTrue($verified, 'The JWT Access Token is valid.');
  }

  /**
   * Tests resource requests.
   */
  public function testResourceRequests() {
    $response = $this->passwordGrantRequest('admin');
    $payload = json_decode($response->getBody());
    $access_token = $payload->access_token;

    // Check resource access with no access token.
    $resource_url = $this->buildUrl(new Url('oauth2_server_test.resource', ['oauth2_server_scope' => 'admin']));
    try {
      $this->httpGetRequest($resource_url);
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(401, $e->getResponse()->getStatusCode(), 'Missing access token correctly detected.');
      }
    }

    // Check resource access with an insufficient scope.
    $query = [
      'access_token' => $access_token,
    ];
    $resource_url = $this->buildUrl(new Url('oauth2_server_test.resource', ['oauth2_server_scope' => 'forbidden'], ['query' => $query]));
    try {
      $this->httpGetRequest($resource_url);
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(403, $e->getResponse()->getStatusCode(), 'Insufficient scope correctly detected.');
      }
    }

    // @fixme Check resource access with the access token in the url.
    // $query = [
    // 'access_token' => $access_token,
    // ];
    // $resource_url = $this->buildUrl(
    // new Url(
    // 'oauth2_server_test.resource',
    // ['oauth2_server_scope' => 'admin'],
    // ['query' => $query]
    // )
    // );
    // $response = $this->httpGetRequest($resource_url);
    // $this->assertEquals(
    // 200,
    // $response->getStatusCode(),
    // 'Access token in the URL correctly detected.'
    // );
    // @fixme Check resource access with the access token in the header.
    // $resource_url = $this->buildUrl(
    // new Url(
    // 'oauth2_server_test.resource',
    // ['oauth2_server_scope' => 'admin']
    // )
    // );
    // $options = [
    // 'headers' => [
    // 'Authorization' =>  'Bearer ' . $access_token,
    // ],
    // ];
    // $response = $this->httpGetRequest($resource_url, $options);
    // $this->assertEquals(
    // 200,
    // $response->getStatusCode(),
    // 'Access token in the header correctly detected.'
    // );
  }

  /**
   * Test that access is denied when using a token for a blocked user.
   */
  public function testBlockedUserTokenFails() {
    // Get a normal access token for a normal user.
    $response = $this->passwordGrantRequest('admin');
    $payload = json_decode($response->getBody());
    $access_token = $payload->access_token;

    // @fixme Check resource access while the user is active.
    $resource_url = $this->buildUrl(new Url('oauth2_server_test.resource', ['oauth2_server_scope' => 'admin']));
    $options = [
      'headers' => [
        'Authorization' => 'Bearer ' . $access_token,
      ],
    ];
    // $response = $this->httpGetRequest($resource_url, $options);
    // $this->assertEquals(
    // 200,
    // $response->getStatusCode(),
    // 'An active user is correctly authenticated.'
    // );
    // Block the user.
    $this->loggedInUser->status = 0;
    $this->loggedInUser->save();

    // Check resource access while the user is blocked.
    try {
      $this->httpGetRequest($resource_url, $options);
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(403, $e->getResponse()->getStatusCode(), 'A blocked user is denied access with 403 Forbidden.');
      }
    }
  }

  /**
   * Tests the authorization part of the flow on a disabled server.
   */
  public function testDisabledAuthorization() {
    // Disable server.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->setStatus(FALSE)->save();

    // Create a user, log the user in, and try the request.
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    try {
      $response = $this->authorizationCodeRequest('code');
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(404, $e->getResponse()->getStatusCode(), 'The authorization page returns 404 Not Found when the server is disabled.');
      }
    }
  }

  /**
   * Tests the implicit flow on a disabled server.
   */
  public function testDisabledImplicitFlow() {
    // Disable server.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->setStatus(FALSE)->save();

    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    try {
      $response = $this->authorizationCodeRequest('token');
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(404, $e->getResponse()->getStatusCode(), 'The implicit flow returns 404 Not Found when the server is disabled.');
      }
    }
  }

  /**
   * Tests the "Client credentials" grant type on a disabled server.
   */
  public function testDisabledClientCredentialsGrantType() {
    // Disable server.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->setStatus(FALSE)->save();

    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);
    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'client_credentials',
    ];

    try {
      $response = $this->httpPostRequest($token_url, $data);
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(404, $e->getResponse()->getStatusCode(), 'The client credentials request returns 404 Not Found when the server is disabled.');
      }
    }
  }

  /**
   * Tests the "JWT bearer" grant type on a disabled server.
   */
  public function testDisabledJwtBearerGrantType() {
    // Disable server.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->setStatus(FALSE)->save();

    $request_time = \Drupal::time()->getRequestTime();
    $sub_property = \Drupal::config('oauth2_server.oauth')
      ->get('user_sub_property');

    $jwt_util = new Jwt();
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $jwt_data = [
      'iss' => $this->clientId,
      'exp' => $request_time + 1000,
      'iat' => $request_time,
      'sub' => $user->{$sub_property}->value,
      'aud' => $token_url,
      'jti' => '123456',
    ];
    $data = [
      'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'assertion' => $jwt_util->encode($jwt_data, $this->privateKey, 'RS256'),
    ];

    try {
      $response = $this->httpPostRequest($token_url, $data, FALSE);
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(404, $e->getResponse()->getStatusCode(), 'The JWT bearer auth request returns 404 Not Found when the server is disabled.');
      }
    }
  }

  /**
   * Tests the "User credentials" grant type on a disabled server.
   */
  public function testDisabledPasswordGrantType() {
    // Disable server.
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->load('test_server');
    $server->setStatus(FALSE)->save();

    try {
      $response = $this->passwordGrantRequest();
    }
    catch (ClientException $e) {
      if ($e->hasResponse()) {
        $this->assertEquals(404, $e->getResponse()->getStatusCode(), 'The user credentials request returns 404 Not Found when the server is disabled.');
      }
    }
  }

  /**
   * Assert that the given token response has the expected values.
   *
   * @param array|object $payload
   *   The response payload (either an object decoded from a json string or the
   *   prepared query string as array).
   * @param bool $has_refresh_token
   *   A boolean indicating whether this response should have a refresh token.
   */
  protected function assertTokenResponse($payload, $has_refresh_token = TRUE) {
    // Make sure we have an array.
    $payload = (array) $payload;

    $this->assertArrayHasKey('access_token', $payload, 'The "access token" value is present in the return values');
    $this->assertArrayHasKey('expires_in', $payload, 'The "expires_in" value is present in the return values');
    $this->assertArrayHasKey('token_type', $payload, 'The "token_type" value is present in the return values');
    $this->assertArrayHasKey('scope', $payload, 'The "scope" value is present in the return values');
    if ($has_refresh_token) {
      $this->assertArrayHasKey('refresh_token', $payload, 'The "refresh_token" value is present in the return values');
    }
  }

  /**
   * Assert that the given id_token response has the expected values.
   *
   * @param string $id_token
   *   The id_token.
   * @param bool $has_at_hash
   *   Whether the token is supposed to contain the at_hash claim.
   * @param \Drupal\user\Entity\User|null $account
   *   The account of the authenticated user, if the id_token is supposed
   *   to contain user claims.
   */
  protected function assertIdToken($id_token, $has_at_hash = FALSE, $account = NULL) {
    $parts = explode('.', $id_token);
    [$headerb64, $claims64, $signatureb64] = $parts;
    $claims = json_decode(Utility::base64urlDecode($claims64), TRUE);
    $signature = Utility::base64urlDecode($signatureb64);

    $payload = mb_convert_encoding($headerb64 . '.' . $claims64, 'ISO-8859-1', 'UTF-8');
    $verified = (bool) openssl_verify($payload, $signature, $this->publicKey, 'sha256');
    $this->assertTrue($verified, 'The id_token has a valid signature.');

    $this->assertArrayHasKey('iss', $claims, 'The id_token contains an "iss" claim.');
    $this->assertArrayHasKey('sub', $claims, 'The id_token contains a "sub" claim.');
    $this->assertArrayHasKey('aud', $claims, 'The id_token contains an "aud" claim.');
    $this->assertArrayHasKey('iat', $claims, 'The id_token contains an "iat" claim.');
    $this->assertArrayHasKey('exp', $claims, 'The id_token contains an "exp" claim.');
    $this->assertArrayHasKey('auth_time', $claims, 'The id_token contains an "auth_time" claim.');
    $this->assertArrayHasKey('nonce', $claims, 'The id_token contains a "nonce" claim');
    if ($has_at_hash) {
      $this->assertArrayHasKey('at_hash', $claims, 'The id_token contains an "at_hash" claim.');
    }
    if ($account) {
      $this->assertArrayHasKey('email', $claims, 'The id_token contains an "email" claim.');
      $this->assertArrayHasKey('email_verified', $claims, 'The id_token contains an "email_verified" claim.');
    }

    $this->assertEquals($this->clientId, $claims['aud'], 'The id_token "aud" claim contains the expected client_id.');
    $this->assertEquals('test', $claims['nonce'], 'The id_token "nonce" claim contains the expected nonce.');
    if ($account) {
      $this->assertEquals($account->mail->getValue()[0]['value'], $claims['email']);
    }
  }

  /**
   * Performs an authorization request and returns it.
   *
   * Used to test authorization, the implicit flow, and the authorization_code
   * grant type.
   *
   * @param string $response_type
   *   The response type string.
   * @param string|null $scope
   *   The scope string.
   *
   * @return \Psr\Http\Message\ResponseInterface
   *   A response object.
   *
   * @throws \GuzzleHttp\Exception\GuzzleException
   */
  protected function authorizationCodeRequest($response_type, $scope = NULL) {
    $query = [
      'response_type' => $response_type,
      'client_id' => $this->clientId,
      'state' => Crypt::hmacBase64($this->clientId, Settings::getHashSalt()),
      'redirect_uri' => $this->redirectUri,
      // OpenID Connect requests require a nonce. Others ignore it.
      'nonce' => 'test',
    ];
    if ($scope) {
      $query['scope'] = $scope;
    }

    $url = new Url('oauth2_server.authorize');
    $cookieJar = $this->getSessionCookies();
    $options = [
      'allow_redirects' => FALSE,
      'cookies' => $cookieJar,
      'query' => $query,

    ];
    return $this->getHttpClient()->request(
      'GET',
      $url->setAbsolute()->toString(),
      $options
    );
  }

  /**
   * Performs a password grant request and returns it.
   *
   * Used to test the grant itself, as well as a helper for other tests
   * (since it's a fast way of getting an access token).
   *
   * @param string|null $scope
   *   An optional scope to request.
   *
   * @return \Psr\Http\Message\ResponseInterface
   *   The return value of $this->httpRequest().
   *
   * @throws \Drupal\Core\Entity\EntityStorageException
   * @throws \GuzzleHttp\Exception\GuzzleException
   */
  protected function passwordGrantRequest($scope = NULL) {
    $user = $this->drupalCreateUser(['use oauth2 server']);
    $this->drupalLogin($user);

    $token_url = $this->buildUrl(new Url('oauth2_server.token'));
    $data = [
      'grant_type' => 'password',
      'username' => $user->name->getValue()[0]['value'],
      'password' => $user->pass_raw,
    ];
    if ($scope) {
      $data['scope'] = $scope;
    }

    return $this->httpPostRequest($token_url, $data);
  }

  /**
   * Get redirect parameters.
   *
   * @param \Psr\Http\Message\ResponseInterface $response
   *   A response message object.
   * @param string $explode
   *   A string to explode on.
   *
   * @return array
   *   An associative array of redirect parameters.
   */
  public function getRedirectParams(ResponseInterface $response, $explode = '?') {
    $redirect_url_parts = explode($explode, $response->getHeader('location')[0]);

    $result = [];
    parse_str($redirect_url_parts[1], $result);
    return $result;
  }

  /**
   * Perform a GET request.
   *
   * @param string $url
   *   A Url object.
   * @param array $options
   *   An options array.
   *
   * @return \Psr\Http\Message\ResponseInterface
   *   The response object.
   *
   * @throws \GuzzleHttp\Exception\GuzzleException
   */
  public function httpGetRequest($url, array $options = []) {
    $cookieJar = $this->getSessionCookies();
    $options += [
      'cookies' => $cookieJar,
      'allow_redirects' => FALSE,
      'debug' => FALSE,
    ];

    return $this->getHttpClient()
      ->request(
        'GET',
        $url,
        $options
      );
  }

  /**
   * Perform a POST request.
   *
   * @param string $url
   *   A Url object.
   * @param array $data
   *   A data array.
   * @param bool $authorization
   *   Whether to authorize the request.
   *
   * @return \Psr\Http\Message\ResponseInterface
   *   The response object.
   *
   * @throws \GuzzleHttp\Exception\GuzzleException
   */
  public function httpPostRequest($url, array $data = [], $authorization = TRUE) {
    $cookieJar = $this->getSessionCookies();
    $options = [
      'cookies' => $cookieJar,
      'allow_redirects' => FALSE,
      'headers' => [
        'Accept' => 'application/json',
        'Content-Type' => 'application/x-www-form-urlencoded',
      ],
      'form_params' => $data,
      'debug' => FALSE,
    ];
    if ($authorization) {
      $options['headers']['Authorization'] = 'Basic ' . base64_encode($this->clientId . ':' . $this->clientSecret);
    }

    return $this->getHttpClient()
      ->request(
        'POST',
        $url,
        $options
      );
  }

}
