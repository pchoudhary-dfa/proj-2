<?php

namespace Drupal\oauth2_server\Authentication\Provider;

use Drupal\Component\Datetime\TimeInterface;
use Drupal\Core\Authentication\AuthenticationProviderInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\oauth2_server\OAuth2HelperInterface;
use Drupal\oauth2_server\OAuth2StorageInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

/**
 * OAuth2 Drupal Auth Provider.
 *
 * @package Drupal\oauth2_server\Authentication\Provider
 */
class OAuth2DrupalAuthProvider implements AuthenticationProviderInterface {

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The OAuth2Storage.
   *
   * @var \Drupal\oauth2_server\OAuth2StorageInterface
   */
  protected $storage;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected $configFactory;

  /**
   * The logger factory.
   *
   * @var \Drupal\Core\Logger\LoggerChannelFactoryInterface
   */
  protected $loggerFactory;

  /**
   * The time object.
   *
   * @var \Drupal\Component\Datetime\TimeInterface
   */
  protected $time;

  /**
   * The OAuth2Helper service.
   *
   * @var \Drupal\oauth2_server\OAuth2HelperInterface
   */
  protected $oauth2Helper;

  /**
   * OAuth2 Drupal Auth Provider constructor.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   The entity type manager.
   * @param \Drupal\oauth2_server\OAuth2StorageInterface $oauth2_storage
   *   The OAuth2 storage object.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory.
   * @param \Drupal\Component\Datetime\TimeInterface $time
   *   The time object.
   * @param \Drupal\oauth2_server\OAuth2HelperInterface $oauth2_helper
   *   The OAuth2Helper service.
   */
  public function __construct(
    EntityTypeManagerInterface $entity_type_manager,
    OAuth2StorageInterface $oauth2_storage,
    ConfigFactoryInterface $config_factory,
    LoggerChannelFactoryInterface $logger_factory,
    TimeInterface $time,
    OAuth2HelperInterface $oauth2_helper,
  ) {
    $this->configFactory = $config_factory;
    $this->storage = $oauth2_storage;
    $this->entityTypeManager = $entity_type_manager;
    $this->loggerFactory = $logger_factory;
    $this->time = $time;
    $this->oauth2Helper = $oauth2_helper;
  }

  /**
   * Checks whether suitable authentication credentials are on the request.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return bool
   *   TRUE if authentication credentials suitable for this provider are on the
   *   request, FALSE otherwise.
   */
  public function applies(Request $request) {
    // If you return TRUE and the method Authentication logic fails,
    // you will get out from Drupal navigation if you are logged in.
    return $this->oauth2Helper->hasValidOauth2Authentication($request);
  }

  /**
   * {@inheritdoc}
   */
  public function authenticate(Request $request) {
    try {
      $token = $this->oauth2Helper->getTokenFromRequest($request);
      if ($token === NULL) {
        throw new \InvalidArgumentException("The client has not transmitted the token in the request.");
      }

      // Retrieve access token data.
      $info = $this->storage->getAccessToken($token);
      if (empty($info)) {
        throw new \InvalidArgumentException("The token: " . $token . " provided is not registered.");
      }

      // Determine if $info['server'] is empty.
      if (empty($info['server'])) {
        throw new \Exception("OAuth2 server was not set");
      }

      // Set $oauth2_server_name.
      $oauth2_server_name = 'oauth2_server.server.' . $info['server'];

      // Retrieves the configuration object.
      $config = $this->configFactory->get($oauth2_server_name);

      // Determine if $config is empty.
      /* @phpstan-ignore-next-line */
      if (empty($config)) {
        throw new \Exception("The config for '.$oauth2_server_name.' server could not be loaded.");
      }
      $oauth2_server_settings = $config->get('settings');
      if (empty($oauth2_server_settings['advanced_settings']) || empty($oauth2_server_settings['advanced_settings']['access_lifetime'])) {
        throw new \Exception("The access_lifetime was not set.");
      }
      if ($this->time->getRequestTime() > ($info['expires'] + $oauth2_server_settings['advanced_settings']['access_lifetime'])) {
        throw new \Exception("The token is expired.");
      }
      $account = $this->entityTypeManager->getStorage('user')
        ->load($info['user_id']);

      $log_session_opened = $oauth2_server_settings['log_session_opened'] ?? TRUE;
      if ($log_session_opened) {
        $this->loggerFactory->get('oauth2_server')
          ->notice('Session opened for %name via @client.', [
            '%name' => $account->getAccountName(),
            '@client' => $info['client_id'],
          ]);
      }

      return $account;
    }
    catch (\Exception $e) {
      $this->loggerFactory->get('oauth2_server')
        ->warning('Access denied: @code @message', [
          '@code' => $e->getCode(),
          '@message' => $e->getMessage(),
        ]);
      throw new AccessDeniedHttpException($e->getMessage(), $e);
    }
  }

  /**
   * Cleanup.
   *
   * @todo Doesn't appear to be used.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   */
  public function cleanup(Request $request) {}

  /**
   * Handle exception.
   *
   * @todo Doesn't appear to be used.
   *
   * @param \Symfony\Component\HttpKernel\Event\ExceptionEvent $event
   *   The exception object.
   *
   * @return bool
   *   Whether the exception s valid or not.
   */
  public function handleException(ExceptionEvent $event) {
    $exception = $event->getThrowable();
    if ($exception instanceof AccessDeniedHttpException) {
      $event->setThrowable(new UnauthorizedHttpException('Invalid consumer origin.', $exception));
      return TRUE;
    }
    return FALSE;
  }

}
