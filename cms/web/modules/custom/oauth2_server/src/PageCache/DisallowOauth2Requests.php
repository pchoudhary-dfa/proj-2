<?php

namespace Drupal\oauth2_server\PageCache;

use Drupal\oauth2_server\Authentication\Provider\OAuth2DrupalAuthProvider;
use Symfony\Component\HttpFoundation\Request;

/**
 * Class Disallow Oauth2 Requests.
 *
 * @package Drupal\oauth2_server\PageCache
 */
class DisallowOauth2Requests implements Oauth2RequestPolicyInterface {

  /**
   * The authentication provider.
   *
   * @var \Drupal\oauth2_server\Authentication\Provider\OAuth2DrupalAuthProvider
   */
  private $authProvider;

  /**
   * DisallowOauth2Requests constructor.
   *
   * @param \Drupal\oauth2_server\Authentication\Provider\OAuth2DrupalAuthProvider $auth_provider
   *   The authentication provider.
   */
  public function __construct(OAuth2DrupalAuthProvider $auth_provider) {
    $this->authProvider = $auth_provider;
  }

  /**
   * {@inheritdoc}
   */
  public function isOauth2Request(Request $request) {
    return $this->authProvider->applies($request);
  }

  /**
   * {@inheritdoc}
   */
  public function check(Request $request) {
    return $this->isOauth2Request($request) ? static::DENY : NULL;
  }

}
