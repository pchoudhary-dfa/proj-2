<?php

namespace Drupal\oauth2_server;

use Symfony\Component\HttpFoundation\Request;

/**
 * Helper class around OAuth actions.
 */
class OAuth2Helper implements OAuth2HelperInterface {

  /**
   * The OAuth2Storage.
   *
   * @var \Drupal\oauth2_server\OAuth2StorageInterface
   */
  protected $storage;

  /**
   * OAuth2Helper constructor.
   *
   * @param \Drupal\oauth2_server\OAuth2StorageInterface $oauth2_storage
   *   The OAuth2 storage service.
   */
  public function __construct(
    OAuth2StorageInterface $oauth2_storage,
  ) {
    $this->storage = $oauth2_storage;
  }

  /**
   * {@inheritdoc}
   */
  public function hasValidOauth2Authentication(Request $request) : bool {
    $method = [];

    // Check if the client uses the "Bearer" authentication scheme
    // to transmit the access token.
    // See https://tools.ietf.org/html/rfc6750#section-2.1
    if (stripos(trim($request->headers->get('authorization', '')), 'Bearer') !== FALSE) {
      $method[] = t('Authorization Request Header Field');
    }

    // Check if the access token is in the entity-body of the HTTP request,
    // and if the client adds the access token to the request-body using the
    // "access_token" parameter.
    // See https://tools.ietf.org/html/rfc6750#section-2.2
    if (trim($request->headers->get('content-type', '')) === 'application/x-www-form-urlencoded'
        && empty($request->query->get('access_token'))
        && trim($request->getMethod()) !== 'GET'
        && preg_match("/\baccess_token\b/", $request->getContent()) === 1) {
      $method[] = t('Form-Encoded Body Parameter');
    }

    // Check if the access token is in URI of the HTTP request,
    // the client adds the access token to the request URI query component
    // using the "access_token" parameter.
    // See https://tools.ietf.org/html/rfc6750#section-2.3
    if (!empty($request->get('access_token'))
        && preg_match("/\baccess_token\b/", $request->getContent()) === 0) {
      $method[] = t('URI Query Parameter');
    }

    // There are three methods of sending bearer access tokens in
    // resource requests to resource servers.
    // Clients MUST NOT use more than one method to transmit the token in each
    // request.
    return count($method) === 1;
  }

  /**
   * {@inheritdoc}
   */
  public function getTokenFromRequest(Request $request) : ?string {
    if (!empty($request->headers->get('authorization'))) {
      $header = $this->parseAuthorizationHeader($request->headers->get('authorization'));
      // If there is a token in the header we return it, otherwise we allow
      // fallback to another token method.
      if ($header !== NULL) {
        return $header['token'];
      }
    }
    if (!empty($request->get('access_token'))) {
      return $request->get('access_token');
    }
    return NULL;
  }

  /**
   * {@inheritdoc}
   */
  public function parseAuthorizationHeader(string $header) : ?array {
    // An authorization header must always consist of "<schema> <token>".
    $parts = explode(' ', $header, 2);
    if (count($parts) !== 2) {
      return NULL;
    }

    return [
      'schema' => $parts[0],
      'token' => $parts[1],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getAllowedScopesFromRequest(Request $request) : array {
    $token = $this->getTokenFromRequest($request);
    if ($token === NULL) {
      return [];
    }

    $token_data = $this->storage->getAccessToken($token);
    if (empty($token_data)) {
      return [];
    }

    return explode(' ', $token_data['scope']);
  }

}
