<?php

namespace Drupal\visitor_counter\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpFoundation\Cookie;
use Drupal\Core\Database\Connection;
use Drupal\Core\Session\AccountProxyInterface;
use Symfony\Component\HttpFoundation\RequestStack;

final class VisitorCounterSubscriber implements EventSubscriberInterface {

  const COOKIE_NAME = 'vcid';
  const COOKIE_LIFETIME_SECONDS = 63072000; // ~2 years
  const ACTIVITY_TOUCH_INTERVAL_SECONDS = 3600; // Touch last_seen at most hourly.
  const COOKIE_SAMESITE = 'Lax';

  private Connection $db;
  private RequestStack $requestStack;
  private AccountProxyInterface $currentUser;
  private ?string $newToken = NULL;

  public function __construct(Connection $database, RequestStack $request_stack, ?AccountProxyInterface $current_user = NULL) {
    $this->db = $database;
    $this->requestStack = $request_stack;
    // Keep backward compatibility with containers compiled with 2 arguments.
    $this->currentUser = $current_user ?? \Drupal::currentUser();
  }

  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::REQUEST => ['onRequest', 40],
      KernelEvents::RESPONSE => ['onResponse', -40],
    ];
  }

  public function onRequest(RequestEvent $event): void {
    if (!$event->isMainRequest()) {
      return;
    }

    $request = $event->getRequest();
    $path = $request->getPathInfo();
    if (PHP_SAPI === 'cli' || str_starts_with($path, '/admin') || str_starts_with($path, '/core')) {
      return;
    }
    if (!in_array($request->getMethod(), ['GET', 'HEAD'], TRUE)) {
      return;
    }
    // Skip only administrative users; count anonymous + non-admin authenticated users.
    if (!$this->currentUser->isAnonymous() && $this->currentUser->hasPermission('administer site configuration')) {
      return;
    }

    $ua = (string) $request->headers->get('User-Agent', '');
    if ($this->isBot($ua)) {
      return;
    }

    $cookies = $request->cookies;
    $token = $cookies->get(self::COOKIE_NAME);

    // Validate token format if it exists (should be 64 hex characters)
    if (!empty($token) && (!is_string($token) || strlen($token) !== 64 || !ctype_xdigit($token))) {
      // Invalid token format, treat as new visitor
      $token = NULL;
    }

    if (empty($token)) {
      $token = $this->generateToken();
      $this->newToken = $token;
    }

    // Check if table exists before querying (safety check if schema not installed yet).
    if (!$this->db->schema()->tableExists('visitor_counter_visitors')) {
      return;
    }

    $now = time();
    $hasLastSeen = $this->db->schema()->fieldExists('visitor_counter_visitors', 'last_seen');

    // Check if token already exists.
    $existingQuery = $this->db->select('visitor_counter_visitors', 'v')
      ->condition('token', $token)
      ->range(0, 1);
    $existingQuery->fields('v', $hasLastSeen ? ['id', 'last_seen'] : ['id', 'first_seen']);
    $existing = $existingQuery->execute()->fetchObject();

    if ($existing) {
      // Update activity timestamp (throttled).
      $activityTs = $hasLastSeen ? (int) $existing->last_seen : (int) $existing->first_seen;
      if ($hasLastSeen && $activityTs < ($now - self::ACTIVITY_TOUCH_INTERVAL_SECONDS)) {
        $this->db->update('visitor_counter_visitors')
          ->fields(['last_seen' => $now])
          ->condition('id', (int) $existing->id)
          ->execute();
      }
      return;
    }

    $ip = $request->getClientIp();
    $ipHash = $ip ? hash('sha256', $ip) : NULL;
    $normalizedUa = mb_substr(trim($ua), 0, 255);

    // Fallback dedupe: if cookie is missing/rotated, reuse an existing visitor
    // fingerprint (IP+UA) across all time.
    if (!empty($ipHash) && $normalizedUa !== '') {
      $recentFingerprintQuery = $this->db->select('visitor_counter_visitors', 'v')
        ->condition('ip_hash', $ipHash)
        ->condition('ua', $normalizedUa)
        ->range(0, 1);
      $recentFingerprintQuery->fields('v', $hasLastSeen ? ['id', 'token', 'last_seen'] : ['id', 'token', 'first_seen']);
      if ($hasLastSeen) {
        $recentFingerprintQuery->orderBy('last_seen', 'DESC');
      }
      else {
        $recentFingerprintQuery->orderBy('first_seen', 'DESC');
      }
      $recentFingerprint = $recentFingerprintQuery->execute()->fetchObject();

      if ($recentFingerprint) {
        $this->newToken = (string) $recentFingerprint->token;
        $activityTs = $hasLastSeen ? (int) $recentFingerprint->last_seen : (int) $recentFingerprint->first_seen;
        if ($hasLastSeen && $activityTs < ($now - self::ACTIVITY_TOUCH_INTERVAL_SECONDS)) {
          $this->db->update('visitor_counter_visitors')
            ->fields(['last_seen' => $now])
            ->condition('id', (int) $recentFingerprint->id)
            ->execute();
        }
        return;
      }
    }

    try {
      $fields = [
        'token' => $token,
        'first_seen' => $now,
        'ua' => $normalizedUa,
        'ip_hash' => $ipHash,
      ];
      if ($hasLastSeen) {
        $fields['last_seen'] = $now;
      }
      $this->db->insert('visitor_counter_visitors')
        ->fields($fields)
        ->execute();
    } catch (\Exception $e) {
      // Handle race condition: if another request inserted the same token
      // between our check and insert, the unique constraint will prevent duplicate.
      $errorMessage = $e->getMessage();
      $isDuplicateError = strpos($errorMessage, 'Duplicate entry') !== false ||
                         strpos($errorMessage, 'UNIQUE constraint') !== false ||
                         strpos($errorMessage, '1062') !== false; // MySQL duplicate key error code.

      if (!$isDuplicateError) {
        // Only log non-duplicate errors (actual database issues).
        \Drupal::logger('visitor_counter')->error('Failed to insert visitor: @message', [
          '@message' => $errorMessage
        ]);
      }
    }
  }

  public function onResponse(ResponseEvent $event): void {
    if (!$event->isMainRequest() || $this->newToken === NULL) {
      return;
    }
    $response = $event->getResponse();
    $isSecure = $this->requestStack->getCurrentRequest()->isSecure();
    $cookie = Cookie::create(self::COOKIE_NAME, $this->newToken, time() + self::COOKIE_LIFETIME_SECONDS, '/', NULL, $isSecure, TRUE, FALSE, self::COOKIE_SAMESITE);
    $response->headers->setCookie($cookie);
  }

  private function generateToken(): string {
    return bin2hex(random_bytes(32));
  }

  private function isBot(string $ua): bool {
    if ($ua === '') return true;
    $bots = [
      'bot','crawl','spider','slurp','bingpreview','mediapartners-google',
      'crawler','facebookexternalhit','fetch','monitoring','pingdom',
      'uptime','headless','phantomjs','axios','curl','python-requests',
    ];
    $uaLower = mb_strtolower($ua);
    foreach ($bots as $needle) {
      if (str_contains($uaLower, $needle)) {
        return true;
      }
    }
    return false;
  }
}
