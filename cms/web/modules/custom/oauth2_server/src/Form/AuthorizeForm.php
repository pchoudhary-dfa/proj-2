<?php

namespace Drupal\oauth2_server\Form;

use Drupal\Core\Config\ConfigFactory;
use Drupal\Core\File\FileUrlGeneratorInterface;
use Drupal\Core\Form\FormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Session\AccountProxy;
use Drupal\Core\StringTranslation\TranslationManager;
use Drupal\oauth2_server\OAuth2StorageInterface;
use Drupal\oauth2_server\Utility;
use OAuth2\HttpFoundationBridge\Request as BridgeRequest;
use OAuth2\HttpFoundationBridge\Response as BridgeResponse;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Class Authorize Form.
 *
 * @package Drupal\oauth2_server\Form
 */
class AuthorizeForm extends FormBase {

  /**
   * The OAuth2Storage.
   *
   * @var \Drupal\oauth2_server\OAuth2StorageInterface
   */
  protected $storage;

  /**
   * The current user.
   *
   * @var \Drupal\Core\Session\AccountProxy
   */
  protected $account;

  /**
   * The translation manager.
   *
   * @var \Drupal\Core\StringTranslation\TranslationManager
   */
  protected $translation;

  /**
   * Site config.
   *
   * @var \Drupal\Core\Config\Config|\Drupal\Core\Config\ImmutableConfig
   */
  protected $siteConfig;

  /**
   * Theme config.
   *
   * @var \Drupal\Core\Config\Config|\Drupal\Core\Config\ImmutableConfig
   */
  protected $themeConfig;

  /**
   * File URL generator service.
   *
   * @var \Drupal\Core\File\FileUrlGeneratorInterface
   */
  protected $fileUrlGenerator;

  /**
   * The logger channel.
   *
   * @var \Drupal\Core\Logger\LoggerChannel|\Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * Authorize Form constructor.
   *
   * @param \Drupal\oauth2_server\OAuth2StorageInterface $oauth2_storage
   *   The OAuth2 storage object.
   * @param \Drupal\Core\Session\AccountProxy $account
   *   The current user account object.
   * @param \Drupal\Core\StringTranslation\TranslationManager $translation_manager
   *   The translation manager object.
   * @param \Drupal\Core\Config\ConfigFactory $config_factory
   *   The config factory object.
   * @param \Drupal\Core\File\FileUrlGeneratorInterface $fileUrlGenerator
   *   File URL generator service.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory object.
   */
  public function __construct(
    OAuth2StorageInterface $oauth2_storage,
    AccountProxy $account,
    TranslationManager $translation_manager,
    ConfigFactory $config_factory,
    FileUrlGeneratorInterface $fileUrlGenerator,
    LoggerChannelFactoryInterface $logger_factory,
  ) {
    $this->storage = $oauth2_storage;
    $this->account = $account;
    $this->translation = $translation_manager;
    $this->siteConfig = $config_factory->get('system.site');
    $this->themeConfig = $config_factory->get('system.theme.global');
    $this->fileUrlGenerator = $fileUrlGenerator;
    $this->logger = $logger_factory->get('oauth2_server');
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('oauth2_server.storage'),
      $container->get('current_user'),
      $container->get('string_translation'),
      $container->get('config.factory'),
      $container->get('file_url_generator'),
      $container->get('logger.factory')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'oauth2_server_authorize_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state, $context = []) {
    $client = $context['client'];

    $form['#title'] = $this->t('Authorize @client_label to use your account?', ['@client_label' => $client->label()]);

    if ($client->logo_uri) {
      $form['header'] = [
        '#markup' => '
    <div class="oauth2-server--auth-dialog-header">
        <div class="item">
          <img src="' . $client->logo_uri . '" alt="" width="50" height="50">
        </div>
        <div class="item check-mark">
          <img src="' . base_path() . 'core/misc/icons/73b355/check.svg" alt="" width="25" height="25">
        </div>
        <div class="item">
          <img src="' . ($this->themeConfig->get('logo.path') ? $this->fileUrlGenerator->generateAbsoluteString($this->themeConfig->get('logo.path')) : base_path() . 'core/misc/logo/drupal-logo.svg') . '" alt="" width="50" height="50">
        </div>
    </div>',
      ];
      $form['user'] = [
        '#markup' => '
    <div class="oauth2-server--auth-dialog-user">
        <div class="item"><strong>' . $this->t('@client_name', ['@client_name' => $client->name]) . '</strong></div>
        <div class="item">' . $this->t('wants to access your <strong>@username</strong> account', ['@username' => $this->account->getDisplayName()]) . '</div>
    </div>',
      ];
      $form['#attached']['library'][] = 'oauth2_server/authorize';
    }

    $list = [];
    foreach ($context['scopes'] as $scope) {
      // phpcs:ignore Drupal.Semantics.FunctionT.NotLiteralString
      $list[] = $this->t($scope->description);
    }

    $form['client'] = [
      '#type' => 'value',
      '#value' => $context['client'],
    ];
    $form['scopes'] = [
      '#title' => $this->t('This application will be able to access the following scopes which might include access to personal data:'),
      '#theme' => 'item_list',
      '#items' => $list,
      '#type' => 'ul',
    ];

    $form['disclaimer'] = [
      '#prefix' => '<p>',
      '#suffix' => '</p>',
      '#markup' => $this->t(
        'If you wish to continue, you must consent to <strong>@sitename</strong> sharing your <em>name</em>, <em>email address</em>, <em>language settings</em> and <em>profile picture</em> with <strong>@client_name</strong>.',
        [
          '@sitename' => $this->siteConfig->get('name'),
          '@client_name' => $client->name,
          '@policy_uri' => $client->policy_uri,
          '@tos_uri' => $client->tos_uri,
        ]
      ),
    ];
    if ($client->policy_uri && $client->tos_uri) {
      $form['disclaimer']['#markup'] .= $this->t(
        'Before using <strong>@client_name</strong>, you can read the <a href="@policy_uri" target="_blank">privacy policy</a> and the <a href="@tos_uri" target="_blank">terms of service</a> that apply to it.',
        [
          '@sitename' => $this->siteConfig->get('name'),
          '@client_name' => $client->name,
          '@policy_uri' => $client->policy_uri,
          '@tos_uri' => $client->tos_uri,
        ]
      );
    }
    elseif ($client->policy_uri) {
      $form['disclaimer']['#markup'] .= $this->t(
        'Before using <strong>@client_name</strong>, you can read the <a href="@tos_uri" target="_blank">terms of service</a> that apply to it.',
        [
          '@sitename' => $this->siteConfig->get('name'),
          '@client_name' => $client->name,
          '@policy_uri' => $client->policy_uri,
          '@tos_uri' => $client->tos_uri,
        ]
      );
    }
    elseif ($client->tos_uri) {
      $form['disclaimer']['#markup'] .= $this->t(
        'Before using <strong>@client_name</strong>, you can read the <a href="@policy_uri" target="_blank">privacy policy</a> that applies to it.',
        [
          '@sitename' => $this->siteConfig->get('name'),
          '@client_name' => $client->name,
          '@policy_uri' => $client->policy_uri,
          '@tos_uri' => $client->tos_uri,
        ]
      );
    }

    $form['actions'] = [
      '#type' => 'actions',
    ];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => t('Yes, I authorize this request'),
      '#authorized' => TRUE,
    ];
    $form['actions']['cancel'] = [
      '#type' => 'submit',
      '#value' => t('Cancel'),
      '#authorized' => FALSE,
    ];
    if ($client->redirect_uri) {
      $redirect_uris = explode("\r\n", trim($client->redirect_uri));
      $redirect_uris_string = implode(' or ', $redirect_uris);
      $form['actions']['explanation'] = [
        "#markup" => '<p>' . $this->translation->formatPlural(
          count($redirect_uris),
          'Authorizing will redirect to<br><strong>:client_uri</strong>',
          'Authorizing will redirect to one of<br><strong>:client_uris</strong>',
          [
            ':client_uri' => array_shift($redirect_uris),
            ':client_uris' => $redirect_uris_string,
          ]
        ) . '</p>',
      ];
    }
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    // A login happened. Create the request with parameters from the session.
    if (!empty($_SESSION['oauth2_server_authorize'])) {
      $bridgeRequest = $_SESSION['oauth2_server_authorize'];
      unset($_SESSION['oauth2_server_authorize']);
    }
    else {
      $bridgeRequest = BridgeRequest::createFromRequest($this->getRequest());
    }

    $authorized = $form_state->getTriggeringElement()['#authorized'];
    $server = $form_state->getValue('client')->getServer();

    // If the oauth2_server is not enabled, this does not exist.
    if (!$server->status()) {
      $this->logger->warning('Attempt to login using disabled oauth2_server %server_id', ['%server_id' => $server->id()]);
      throw new NotFoundHttpException();
    }

    // Finish the authorization request.
    $response = new BridgeResponse();
    $oauth2_server = Utility::startServer($server, $this->storage);
    $oauth2_server->handleAuthorizeRequest($bridgeRequest, $response, $authorized, $this->currentUser()->id());
    $form_state->setResponse($response);
  }

}
