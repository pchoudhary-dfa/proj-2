<?php

namespace Drupal\oauth2_server;

use OAuth2\OpenID\Storage\AuthorizationCodeInterface as OAuth2AuthorizationCodeInterface;
use OAuth2\OpenID\Storage\UserClaimsInterface;
use OAuth2\Storage\AccessTokenInterface;
use OAuth2\Storage\ClientCredentialsInterface;
use OAuth2\Storage\JwtBearerInterface;
use OAuth2\Storage\PublicKeyInterface;
use OAuth2\Storage\RefreshTokenInterface;
use OAuth2\Storage\UserCredentialsInterface;

/**
 * Interface OAuth2 Storage Interface.
 *
 * @package Drupal\oauth2_server
 */
interface OAuth2StorageInterface extends
  OAuth2AuthorizationCodeInterface,
  AccessTokenInterface,
  ClientCredentialsInterface,
  JwtBearerInterface,
  RefreshTokenInterface,
  UserCredentialsInterface,
  UserClaimsInterface,
  PublicKeyInterface {
}
