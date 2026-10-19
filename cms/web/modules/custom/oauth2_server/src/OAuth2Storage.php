<?php

namespace Drupal\oauth2_server;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\File\FileUrlGeneratorInterface;
use Drupal\Core\Password\PasswordInterface;
use Drupal\Core\Session\AnonymousUserSession;
use Drupal\file\Entity\File;
use Drupal\user\UserInterface;
use OAuth2\Encryption\Jwt;

/**
 * Provides Drupal OAuth2 storage for the library.
 *
 * @package Drupal\oauth2_server
 */
class OAuth2Storage implements OAuth2StorageInterface {

  /**
   * The entity manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The password hasher.
   *
   * @var \Drupal\Core\Password\PasswordInterface
   */
  protected $passwordHasher;

  /**
   * The module handler.
   *
   * @var \Drupal\Core\Extension\ModuleHandlerInterface
   */
  protected $moduleHandler;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected $configFactory;

  /**
   * The time object.
   *
   * @var \Drupal\Component\Datetime\TimeInterface
   */
  protected $time;

  /**
   * File URL generator service.
   *
   * @var \Drupal\Core\File\FileUrlGeneratorInterface
   */
  protected $fileUrlGenerator;

  /**
   * Constructs a new OAuth2Storage.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   The entity type manager.
   * @param \Drupal\Core\Password\PasswordInterface $password_hasher
   *   The password hasher.
   * @param \Drupal\Core\Extension\ModuleHandlerInterface $module_handler
   *   The module handler.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   * @param \Drupal\Component\Datetime\TimeInterface $time
   *   The time object.
   * @param \Drupal\Core\File\FileUrlGeneratorInterface|null $fileUrlGenerator
   *   File URL generator service.
   */
  public function __construct(
    EntityTypeManagerInterface $entity_type_manager,
    PasswordInterface $password_hasher,
    ModuleHandlerInterface $module_handler,
    ConfigFactoryInterface $config_factory,
    TimeInterface $time,
    ?FileUrlGeneratorInterface $fileUrlGenerator = NULL,
  ) {
    $this->entityTypeManager = $entity_type_manager;
    $this->passwordHasher = $password_hasher;
    $this->moduleHandler = $module_handler;
    $this->configFactory = $config_factory;
    $this->time = $time;
    if ($fileUrlGenerator === NULL) {
      @trigger_error('Calling ' . __METHOD__ . ' without the $fileUrlGenerator argument is deprecated in oauth2_server:2.1.0 and it will be required in oauth2_server:3.0.0. See https://www.drupal.org/node/3288840', E_USER_DEPRECATED);
      /* @phpstan-ignore-next-line */
      $fileUrlGenerator = \Drupal::service('file_url_generator');
    }
    $this->fileUrlGenerator = $fileUrlGenerator;
  }

  /**
   * Retrieve the account from the storage.
   *
   * @param string $username
   *   The username or email address of the account.
   *
   * @return \Drupal\user\UserInterface|bool
   *   The account loaded from the storage or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getStorageAccount($username) {
    /** @var \Drupal\user\UserInterface[] $users */
    $users = $this->entityTypeManager->getStorage('user')
      ->loadByProperties(['name' => $username]);
    if ($users) {
      return reset($users);
    }
    else {
      // An email address might have been supplied instead of the username.
      /** @var \Drupal\user\UserInterface[] $users */
      $users = $this->entityTypeManager->getStorage('user')
        ->loadByProperties(['mail' => $username]);
      if ($users) {
        return reset($users);
      }
    }
    return FALSE;
  }

  /**
   * Get the client from the entity backend.
   *
   * @param string $client_id
   *   The client id to find.
   *
   * @return \Drupal\oauth2_server\ClientInterface|bool
   *   A client entity or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getStorageClient($client_id) {
    /** @var \Drupal\oauth2_server\ClientInterface[] $clients */
    $clients = $this->entityTypeManager->getStorage('oauth2_server_client')
      ->loadByProperties(['client_id' => $client_id]);
    if ($clients) {
      return reset($clients);
    }
    return FALSE;
  }

  /**
   * Get the token from the entity backend.
   *
   * @param string $token
   *   The token to find.
   *
   * @return \Drupal\oauth2_server\TokenInterface|bool
   *   Returns the token or FALSE.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getStorageToken($token) {
    /** @var \Drupal\oauth2_server\TokenInterface[] $tokens */
    $tokens = $this->entityTypeManager->getStorage('oauth2_server_token')
      ->loadByProperties(['token' => $token]);
    if ($tokens) {
      return reset($tokens);
    }

    $jwt = new Jwt();
    $decoded_token = $jwt->decode($token, NULL, FALSE);

    if ($decoded_token === FALSE || empty($decoded_token['id'])) {
      return FALSE;
    }

    /** @var \Drupal\oauth2_server\TokenInterface[] $tokens */
    $tokens = $this->entityTypeManager->getStorage('oauth2_server_token')
      ->loadByProperties(['token' => $decoded_token['id']]);
    if ($tokens) {
      return reset($tokens);
    }

    return FALSE;
  }

  /**
   * Get the authorization code from the entity backend.
   *
   * @param string $code
   *   The authorization code string.
   *
   * @return \Drupal\oauth2_server\AuthorizationCodeInterface|bool
   *   Returns the code or FALSE.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getStorageAuthorizationCode($code) {
    /** @var \Drupal\oauth2_server\AuthorizationCodeInterface[] $codes */
    $codes = $this->entityTypeManager->getStorage('oauth2_server_authorization_code')
      ->loadByProperties(['code' => $code]);
    if ($codes) {
      return reset($codes);
    }
    return FALSE;
  }

  /**
   * Check client credentials.
   *
   * @param string $client_id
   *   The client id string.
   * @param string|null $client_secret
   *   The client secret string.
   *
   * @return bool
   *   A boolean whether the credentials are correct.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function checkClientCredentials($client_id, $client_secret = NULL) {
    $client = $this->getClientDetails($client_id);
    if (!$client) {
      return FALSE;
    }

    // The client may omit the client secret or provide NULL, and expect that to
    // be treated the same as an empty string.
    // See https://tools.ietf.org/html/rfc6749#section-2.3.1
    if ($client['client_secret'] === '' &&
      ($client_secret === '' || $client_secret === NULL)) {
      return TRUE;
    }
    return $this->passwordHasher->check($client_secret, $client['client_secret']);
  }

  /**
   * Is public client.
   *
   * @param string $client_id
   *   The client id string.
   *
   * @return bool
   *   Whether this is a public client.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function isPublicClient($client_id) {
    $client = $this->getClientDetails($client_id);
    return $client && empty($client['client_secret']);
  }

  /**
   * Get client credentials.
   *
   * @param string $client_id
   *   The client id string.
   *
   * @return array|bool|\Drupal\oauth2_server\Entity\Client
   *   An client array.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getClientDetails($client_id) {
    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $this->getStorageClient($client_id);
    if ($client) {
      // Return a client array in the format expected by the library.
      $client = [
        'client_id' => $client->client_id,
        'client_secret' => $client->client_secret,
        'public_key' => $client->public_key,
        // The library expects multiple redirect uris to be separated by
        // a space, but the module separates them by a newline, matching
        // Drupal behavior in other areas.
        'redirect_uri' => str_replace(
          ["\r\n", "\r", "\n"],
          ' ',
          $client->redirect_uri
        ),
      ];
    }
    return $client;
  }

  /**
   * Get client scope.
   *
   * @param string $client_id
   *   The client id string.
   *
   * @return null
   *   The module doesn't currently support per-client scopes.
   */
  public function getClientScope($client_id) {
    return NULL;
  }

  /**
   * Check restricted grant type.
   *
   * @param string $client_id
   *   The client id string.
   * @param string $grant_type
   *   The grant type string.
   *
   * @return bool
   *   Whether the grant type is available.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function checkRestrictedGrantType($client_id, $grant_type) {
    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $this->getStorageClient($client_id);
    $server = $client->getServer();
    if (!empty($client->settings['override_grant_types'])) {
      $grant_types = array_filter($client->settings['grant_types']);
      $allow_implicit = $client->settings['allow_implicit'];
    }
    else {
      // Fallback to the global server settings.
      $grant_types = array_filter($server->settings['grant_types']);
      $allow_implicit = $server->settings['allow_implicit'];
    }

    // Implicit flow is enabled by a different setting, so it needs to be
    // added to the check separately.
    if ($allow_implicit) {
      $grant_types['implicit'] = 'implicit';
    }
    return in_array($grant_type, $grant_types);
  }

  /**
   * Get access token.
   *
   * @param string $access_token
   *   The access token string.
   *
   * @return array|bool
   *   An access token array or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getAccessToken($access_token) {
    /** @var \Drupal\oauth2_server\TokenInterface $token */
    $token = $this->getStorageToken($access_token);
    if (!$token) {
      return FALSE;
    }

    $user = $token->getUser();
    $enabled_grant_types = array_filter(
      $token->getClient()->getServer()->get('settings')['grant_types']
    );
    if (!in_array('client_credentials', $enabled_grant_types)) {
      if ($user && $user->isBlocked()) {
        // If the user is blocked, deny access.
        return FALSE;
      }
    }

    $scopes = [];
    /** @var \Drupal\oauth2_server\ScopeInterface[] $scope_entities */
    $scope_entities = $token->scopes->referencedEntities();
    foreach ($scope_entities as $scope) {
      $scopes[] = $scope->scope_id;
    }
    sort($scopes);

    // Return a token array in the format expected by the library.
    $token_array = [
      'server' => $token->getClient()->getServer()->id(),
      'client_id' => $token->getClient()->client_id,
      'user_id' => $user->id(),
      'user_uuid' => $user->uuid(),
      'access_token' => $token->token->value,
      'expires' => (int) $token->expires->value,
      'scope' => implode(' ', $scopes),
    ];

    // Track last access on the token.
    $this->logAccessTime($token);
    return $token_array;
  }

  /**
   * Track the time the token was accessed.
   *
   * @param \Drupal\oauth2_server\TokenInterface $token
   *   A token object.
   */
  protected function logAccessTime(TokenInterface $token) {
    if (empty($token->last_access->value) ||
      $token->last_access->value != $this->time->getRequestTime()) {
      $token->last_access = $this->time->getRequestTime();
      try {
        $token->save();
      }
      catch (\Exception $e) {
        // @todo find a way to reliably handle concurrent updates of last_access.
      }
    }
  }

  /**
   * Set access token.
   *
   * @param string $access_token
   *   The access token string.
   * @param string $client_id
   *   The client id string.
   * @param int $uid
   *   The user id.
   * @param int $expires
   *   The timestamp the token expires.
   * @param string|null $scope
   *   The scope string.
   *
   * @return int
   *   Whether the access token could be saved or not.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function setAccessToken($access_token, $client_id, $uid, $expires, $scope = NULL) {
    $client = $this->getStorageClient($client_id);
    if (!$client) {
      throw new \InvalidArgumentException("The supplied client couldn't be loaded.");
    }

    // If no token was found, start with a new entity.
    $token = $this->getStorageToken($access_token);
    if (!$token) {
      // The username is not required, the "Client credentials" grant type
      // doesn't provide it, for instance.
      if (!$uid ||
        !$this->entityTypeManager->getStorage('user')->load($uid)) {
        $uid = 0;
      }

      /** @var \Drupal\oauth2_server\TokenInterface $token */
      $token = $this->entityTypeManager->getStorage('oauth2_server_token')
        ->create(['type' => 'access']);
      $token->set('client_id', $client->id());
      $token->set('uid', $uid);
      $token->set('token', $access_token);
    }

    $token->set('expires', $expires);
    $this->setScopeData($token, $client->getServer(), $scope);

    return $token->save();
  }

  /**
   * Get authorization code.
   *
   * @param string $code
   *   The authorization code string.
   *
   * @return array|bool
   *   An authorization code array or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getAuthorizationCode($code) {
    /** @var \Drupal\oauth2_server\AuthorizationCodeInterface $code */
    $code = $this->getStorageAuthorizationCode($code);
    if (!$code) {
      return FALSE;
    }

    $scopes = [];
    /** @var \Drupal\oauth2_server\ScopeInterface[] $scope_entities */
    $scope_entities = $code->scopes->referencedEntities();
    foreach ($scope_entities as $scope) {
      $scopes[] = $scope->scope_id;
    }
    sort($scopes);

    // Return a code array in the format expected by the library.
    $code_array = [
      'server' => $code->getClient()->getServer()->id(),
      'client_id' => $code->getClient()->client_id,
      'user_id' => $code->getUser()->id(),
      'user_uuid' => $code->getUser()->uuid(),
      'authorization_code' => $code->code->value,
      'redirect_uri' => $code->redirect_uri->value,
      'expires' => (int) $code->expires->value,
      'scope' => implode(' ', $scopes),
      'id_token' => $code->id_token->value,
    ];

    // Examine the id_token and alter the OpenID Connect 'sub' property if
    // necessary. The 'sub' property is usually the user's UID, but this is
    // configurable for backwards compatibility reasons. See:
    // https://www.drupal.org/node/2274357#comment-9779467
    $sub_property = $this->configFactory->get('oauth2_server.oauth')
      ->get('user_sub_property');
    if (!empty($code_array['id_token']) && $sub_property != 'uid') {
      $account = $code->getUser();
      $desired_sub = $account->{$sub_property}->value;
      $parts = explode('.', $code_array['id_token']);
      $claims = json_decode(Utility::base64urlDecode($parts[1]), TRUE);
      if (isset($claims['sub']) && $desired_sub != $claims['sub']) {
        $claims['sub'] = $desired_sub;
        $parts[1] = Utility::base64urlEncode(json_encode($claims));
        $code_array['id_token'] = implode('.', $parts);
      }
    }
    return $code_array;
  }

  /**
   * Set authorization code.
   *
   * @param string $code
   *   The authorization code string.
   * @param mixed $client_id
   *   The client id string.
   * @param int $uid
   *   The user uid.
   * @param string $redirect_uri
   *   The redirect uri string.
   * @param int $expires
   *   The timestamp the authorization code expires.
   * @param string|null $scope
   *   The scope string.
   * @param string|null $id_token
   *   The token string.
   * @param string|null $code_challenge
   *   The code challenge string.
   * @param string|null $code_challenge_method
   *   The code challenge method string.
   *
   * @return int
   *   Whether the authorization code could be saved or not.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function setAuthorizationCode($code, $client_id, $uid, $redirect_uri, $expires, $scope = NULL, $id_token = NULL, $code_challenge = NULL, $code_challenge_method = NULL) {
    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $this->getStorageClient($client_id);
    if (!$client) {
      throw new \InvalidArgumentException("The supplied client couldn't be loaded.");
    }

    // If no code was found, start with a new entity.
    /** @var \Drupal\oauth2_server\AuthorizationCodeInterface $authorization_code */
    $authorization_code = $this->getStorageAuthorizationCode($code);
    if (!$authorization_code) {
      /** @var \Drupal\user\UserInterface $user */
      $user = $this->entityTypeManager->getStorage('user')->load($uid);
      if (!$user) {
        throw new \InvalidArgumentException("The supplied user couldn't be loaded.");
      }

      /** @var \Drupal\oauth2_server\AuthorizationCodeInterface $authorization_code */
      $authorization_code = $this->entityTypeManager->getStorage('oauth2_server_authorization_code')->create([]);
      $authorization_code->client_id = $client->id();
      $authorization_code->uid = $user->id();
      $authorization_code->code = $code;
      $authorization_code->id_token = $id_token;
    }

    $authorization_code->redirect_uri = $redirect_uri;
    $authorization_code->expires = $expires;
    $this->setScopeData($authorization_code, $client->getServer(), $scope);

    return $authorization_code->save();
  }

  /**
   * Expire authorization code.
   *
   * @param string $code
   *   The authorization code.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function expireAuthorizationCode($code) {
    /** @var \Drupal\oauth2_server\AuthorizationCodeInterface $authorization_code */
    $authorization_code = $this->getStorageAuthorizationCode($code);
    if ($authorization_code) {
      $authorization_code->delete();
    }
  }

  /* JwtBearerInterface */

  /**
   * Get client key.
   *
   * @param string $client_id
   *   The client id string.
   * @param string $subject
   *   The subject string.
   *
   * @return string|bool
   *   The client id public key or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getClientKey($client_id, $subject) {
    // While the API supports a key per user (subject), the module only supports
    // one key per client, since it's the simpler and more frequent use case.
    $client = $this->getClientDetails($client_id);
    return $client ? $client['public_key'] : FALSE;
  }

  /**
   * Get Jti.
   *
   * @param string $client_id
   *   The client id string.
   * @param string $subject
   *   The subject string.
   * @param string $audience
   *   The audience string.
   * @param int $expires
   *   The expiration timestamp.
   * @param string $jti
   *   The jti string.
   *
   * @return array|void
   *   An Jti array.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getJti($client_id, $subject, $audience, $expires, $jti) {
    $client = $this->getStorageClient($client_id);
    if (!$client) {
      // The client_id should be validated prior to this method being called,
      // but the library doesn't do that currently.
      // phpcs:ignore Drupal.Commenting.FunctionComment.InvalidReturnNotVoid
      return;
    }

    $found = $this->entityTypeManager->getStorage('oauth2_server_jti')->loadByProperties([
      'client_id' => $client->id(),
      'subject' => $subject,
      'jti' => $jti,
      'expires' => $expires,
    ]);

    if ($found) {
      // JTI found, return the data back in the expected format.
      return [
        'issuer' => $client_id,
        'subject' => $subject,
        'jti' => $jti,
        'expires' => $expires,
      ];
    }
  }

  /**
   * Set Jti.
   *
   * @param string $client_id
   *   The client id string.
   * @param string $subject
   *   The subject string.
   * @param string $audience
   *   The audience string.
   * @param int $expires
   *   The expiration timestamp.
   * @param string $jti
   *   The jti string.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function setJti($client_id, $subject, $audience, $expires, $jti) {
    $client = $this->getStorageClient($client_id);
    if (!$client) {
      // The client_id should be validated prior to this method being called,
      // but the library doesn't do that currently.
      return;
    }

    $entity = $this->entityTypeManager->getStorage('oauth2_server_jti')->create([
      'client_id' => $client->id(),
      'subject' => $subject,
      'jti' => $jti,
      'expires' => $expires,
    ]);
    $entity->save();
  }

  /* UserCredentialsInterface */

  /**
   * Check user credentials.
   *
   * @param string $username
   *   The username string.
   * @param string $password
   *   The password string.
   *
   * @return bool
   *   Whether the credentials are valid or not.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function checkUserCredentials($username, $password) {
    $account = $this->getStorageAccount($username);
    if ($account && $account->isActive()) {
      return $this->passwordHasher->check($password, $account->getPassword());
    }
    return FALSE;
  }

  /**
   * Get user details.
   *
   * @param string $username
   *   The username string.
   *
   * @return array|bool
   *   The user details array or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getUserDetails($username) {
    $account = $this->getStorageAccount($username);
    if ($account) {
      return ['user_id' => $account->id()];
    }
    return FALSE;
  }

  /* UserClaimsInterface */

  /**
   * Get user claims.
   *
   * @param int $uid
   *   The user id integer.
   * @param string $scope
   *   The scope string.
   *
   * @return array
   *   An associative array of claim strings.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityMalformedException
   */
  public function getUserClaims($uid, $scope) {
    /** @var \Drupal\user\UserInterface $account */
    $account = $this->entityTypeManager->getStorage('user')
      ->load($uid);
    if (!$account) {
      throw new \InvalidArgumentException("The supplied user couldn't be loaded.");
    }
    $requested_scopes = explode(' ', trim($scope));

    // The OpenID Connect 'sub' (Subject Identifier) property is usually the
    // user's UID, but this is configurable for backwards compatibility reasons.
    // See: https://www.drupal.org/node/2274357#comment-9779467
    $sub_property = $this->configFactory->get('oauth2_server.oauth')
      ->get('user_sub_property');

    // Prepare the default claims.
    $claims = [
      'sub' => $account->{$sub_property}->value,
    ];

    if (in_array('email', $requested_scopes)) {
      $claims['email'] = $account->getEmail();
      $claims['email_verified'] = $this->configFactory->get('user.settings')
        ->get('verify_mail');
    }

    if (in_array('profile', $requested_scopes)) {
      if (!empty($account->label())) {
        $claims['name'] = $account->getDisplayName();
        $claims['preferred_username'] = $account->getAccountName();
      }
      if (!empty($account->timezone)) {
        $claims['zoneinfo'] = $account->getTimeZone();
      }
      $anonymous_user = new AnonymousUserSession();
      if ($anonymous_user->hasPermission('access user profiles')) {
        $claims['profile'] = $account->toUrl('canonical', ['absolute' => TRUE]);
      }
      if ($picture = $this->getUserPicture($account)) {
        $claims['picture'] = $picture;
      }
    }

    // Allow modules to supply additional claims.
    $claims += $this->moduleHandler->invokeAll('oauth2_server_claims', [
      'account' => $account,
      'requested_scopes' => $requested_scopes,
    ]);

    // Finally, allow modules to alter claims.
    $this->moduleHandler->alter('oauth2_server_user_claims', $claims, $account, $requested_scopes);
    return $claims;
  }

  /* RefreshTokenInterface */

  /**
   * Get refresh token.
   *
   * @param string $refresh_token
   *   The refresh token string.
   *
   * @return array|bool
   *   The token array or false.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getRefreshToken($refresh_token) {
    /** @var \Drupal\oauth2_server\TokenInterface $token */
    $token = $this->getStorageToken($refresh_token);
    if (!$token) {
      return FALSE;
    }

    $user = $token->getUser();
    if ($user && $user->isBlocked()) {
      // If the user is blocked, deny access.
      return FALSE;
    }

    $scopes = [];
    /** @var \Drupal\oauth2_server\ScopeInterface $token */
    $scope_entities = $token->scopes->referencedEntities();
    foreach ($scope_entities as $scope) {
      $scopes[] = $scope->scope_id;
    }
    sort($scopes);

    return [
      'server' => $token->getClient()->getServer()->id(),
      'client_id' => $token->getClient()->client_id,
      'user_id' => $token->getUser()->id(),
      'user_uuid' => $token->getUser()->uuid(),
      'refresh_token' => $token->token->value,
      'expires' => (int) $token->expires->value,
      'scope' => implode(' ', $scopes),
    ];
  }

  /**
   * Set refresh token.
   *
   * @param string $refresh_token
   *   The refresh token string.
   * @param string $client_id
   *   The client id string.
   * @param int $uid
   *   The user id integer.
   * @param int $expires
   *   The expiration timestamp.
   * @param string|null $scope
   *   The scope string.
   *
   * @return int
   *   Whether the token was saved or not.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function setRefreshToken($refresh_token, $client_id, $uid, $expires, $scope = NULL) {
    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $this->getStorageClient($client_id);
    if (!$client) {
      throw new \InvalidArgumentException("The supplied client couldn't be loaded.");
    }

    // If no token was found, start with a new entity.
    /** @var \Drupal\oauth2_server\TokenInterface $token */
    $token = $this->getStorageToken($refresh_token);
    if (!$token) {
      $user = $this->entityTypeManager->getStorage('user')->load($uid);
      if (!$user) {
        throw new \InvalidArgumentException("The supplied user couldn't be loaded.");
      }

      /** @var \Drupal\oauth2_server\TokenInterface $token */
      $token = $this->entityTypeManager->getStorage('oauth2_server_token')
        ->create(['type' => 'refresh']);
      $token->set('client_id', $client->id());
      $token->set('uid', $uid);
      $token->set('token', $refresh_token);
    }

    $token->set('expires', $expires);
    $this->setScopeData($token, $client->getServer(), $scope);
    return $token->save();
  }

  /**
   * Unset refresh token.
   *
   * @param string $refresh_token
   *   The refresh token string.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function unsetRefreshToken($refresh_token) {
    /** @var \Drupal\oauth2_server\TokenInterface $token */
    $token = $this->getStorageToken($refresh_token);

    // Check token exists before trying to delete.
    if ($token) {
      $token->delete();
    }
  }

  /**
   * Sets the "scopes" entityreference field on the passed entity.
   *
   * @param object $entity
   *   The entity containing the "scopes" entityreference field.
   * @param object $server
   *   The machine name of the server.
   * @param string $scope
   *   Scopes in a space-separated string.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  private function setScopeData($entity, $server, $scope) {
    $entity->scopes = [];
    if ($scope) {
      $scopes = preg_split('/\s+/', $scope);
      /** @var \Drupal\oauth2_server\ScopeInterface[] $loaded_scopes */
      $loaded_scopes = $this->entityTypeManager
        ->getStorage('oauth2_server_scope')
        ->loadByProperties([
          'server_id' => $server->id(),
          'scope_id' => $scopes,
        ]);
      ksort($loaded_scopes);
      foreach ($loaded_scopes as $loaded_scope) {
        $entity->scopes[] = $loaded_scope->id();
      }
    }
  }

  /* PublicKeyInterface */

  /**
   * Get public key.
   *
   * @param string|null $client_id
   *   The client id string.
   *
   * @return string
   *   The public key string.
   */
  public function getPublicKey($client_id = NULL) {
    // The library allows for per-client keys. The module uses global keys that
    // are regenerated every day, following Google's example.
    $keys = Utility::getKeys();
    return $keys['public_key'];
  }

  /**
   * Get private key.
   *
   * @param string|null $client_id
   *   The client id string.
   *
   * @return string
   *   The private key string.
   */
  public function getPrivateKey($client_id = NULL) {
    // The library allows for per-client keys. The module uses global keys
    // that are regenerated every day, following Google's example.
    $keys = Utility::getKeys();
    return $keys['private_key'];
  }

  /**
   * Get encryption algorithm.
   *
   * @param string|null $client_id
   *   The client id string.
   *
   * @return string
   *   The encryption algorithm identifier string.
   */
  public function getEncryptionAlgorithm($client_id = NULL) {
    return 'RS256';
  }

  /**
   * Get the user's picture to return as an OpenID Connect claim.
   *
   * @param \Drupal\user\UserInterface $account
   *   The user account object.
   *
   * @return string|null
   *   An absolute URL to the user picture, or NULL if none is found.
   *
   * @throws \Drupal\Core\Entity\EntityMalformedException
   */
  protected function getUserPicture(UserInterface $account) {
    if (!user_picture_enabled()) {
      return NULL;
    }

    if ($account->user_picture && $account->user_picture->target_id) {
      $file = File::load($account->user_picture->target_id);
      if ($file) {
        if ($file->hasLinkTemplate('canonical')) {
          return $file->toUrl()->setAbsolute(TRUE);
        }
        elseif (
          $file->getEntityTypeId() === 'file'
          && $file->access('download')
        ) {
          return $this->fileUrlGenerator->generate($file->getFileUri())->toString();
        }
      }
    }
    return NULL;
  }

}
