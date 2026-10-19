<?php

namespace Drupal\oauth2_server\Form;

use Drupal\Component\Utility\UrlHelper;
use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Entity\EntityTypeManager;
use Drupal\Core\Form\FormStateInterface;
use Drupal\oauth2_server\Utility;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Class Client Form.
 *
 * @package Drupal\oauth2_server\Form
 */
class ClientForm extends EntityForm {

  /**
   * The client entity.
   *
   * @var \Drupal\oauth2_server\ClientInterface
   */
  protected $entity;

  /**
   * The client storage.
   *
   * @var \Drupal\Core\Entity\EntityStorageInterface
   */
  protected $storage;

  /**
   * ClientForm constructor.
   *
   * @param \Drupal\Core\Entity\EntityTypeManager $entity_type_manager
   *   The entity type manager.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function __construct(EntityTypeManager $entity_type_manager) {
    $this->storage = $entity_type_manager->getStorage('oauth2_server_client');
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('entity_type.manager')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function form(array $form, FormStateInterface $form_state) {
    $client = $this->entity;
    $form_state->setTemporaryValue('client_secret', $client->client_secret);

    $server = $form_state->get('oauth2_server');
    if (!$server) {
      throw new \Exception('OAuth2 server was not set');
    }

    $form['#tree'] = TRUE;
    $form['server_id'] = [
      '#type' => 'value',
      '#value' => $server->id(),
    ];
    $form['name'] = [
      '#title' => $this->t('Label'),
      '#type' => 'textfield',
      '#default_value' => $client->name,
      '#description' => $this->t('The human-readable name of this client.'),
      '#required' => TRUE,
      '#weight' => -50,
    ];
    $form['client_id'] = [
      '#title' => $this->t('Client ID'),
      '#type' => 'machine_name',
      '#default_value' => $client->id(),
      '#required' => TRUE,
      '#weight' => -40,
      '#machine_name' => [
        'exists' => [$this, 'exists'],
      ],
    ];
    $grant_types = array_filter($client->settings['override_grant_types'] ? $client->settings['grant_types'] : $server->settings['grant_types']);
    $jwt_bearer_enabled = isset($grant_types['urn:ietf:params:oauth:grant-type:jwt-bearer']);
    $form['client_secret'] = [
      '#title' => $this->t('Client secret'),
      '#type' => 'password',
      '#weight' => -30,
      // Hide this field if only JWT bearer is enabled, since it doesn't use it.
      '#access' => (count($grant_types) != 1 || !$jwt_bearer_enabled),
    ];
    if (!empty($client->client_secret)) {
      $form['client_secret']['#description'] = $this->t('Leave this blank to keep using the previously saved secret.');
    }
    $form['public_key'] = [
      '#title' => $this->t('Public key'),
      '#type' => 'textarea',
      '#default_value' => $client->public_key,
      '#required' => TRUE,
      '#description' => $this->t('Used to decode the JWT when the %JWT grant type is used.', ['%JWT' => $this->t('JWT bearer')]),
      '#weight' => -20,
      // Show the field if JWT bearer is enabled, other grant types don't use
      // it.
      '#access' => $jwt_bearer_enabled,
    ];
    $form['redirect_uri'] = [
      '#title' => $this->t('Redirect URIs'),
      '#type' => 'textarea',
      '#default_value' => $client->redirect_uri,
      '#description' => $this->t('The absolute URIs to validate against. Enter one value per line.'),
      '#required' => TRUE,
      '#weight' => -10,
    ];
    $form['logo_uri'] = [
      '#title' => $this->t('Logo URI'),
      '#type' => 'textfield',
      '#default_value' => $client->logo_uri,
      '#description' => $this->t('A URL that references a logo for the Client application. If present, the server SHOULD display this image to the End-User during approval.'),
      '#required' => FALSE,
      '#weight' => -10,
    ];
    $form['client_uri'] = [
      '#title' => $this->t('Client URI'),
      '#type' => 'textfield',
      '#default_value' => $client->client_uri,
      '#description' => $this->t('The	URL of the home page of the Client. If present, the server SHOULD display this URL to the End-User in a followable fashion.'),
      '#required' => FALSE,
      '#weight' => -10,
    ];
    $form['policy_uri'] = [
      '#title' => $this->t('Policy URI'),
      '#type' => 'textfield',
      '#default_value' => $client->policy_uri,
      '#description' => $this->t('A	URL that the Relying Party Client provides to the End-User to read about the how the profile data will be used. The OpenID Provider SHOULD display this URL to the End-User if it is given.'),
      '#required' => FALSE,
      '#weight' => -10,
    ];
    $form['tos_uri'] = [
      '#title' => $this->t('Terms of service URI'),
      '#type' => 'textfield',
      '#default_value' => $client->tos_uri,
      '#description' => $this->t("A URL that the Relying Party Client provides to the End-User to read about the Relying Party's terms of service. The OpenID Provider SHOULD display this URL to the End-User if it is given."),
      '#required' => FALSE,
      '#weight' => -10,
    ];
    $form['automatic_authorization'] = [
      '#title' => $this->t('Automatically authorize this client'),
      '#type' => 'checkbox',
      '#default_value' => $client->automatic_authorization,
      '#description' => $this->t('This will cause the authorization form to be skipped. <b>Warning:</b> Give to trusted clients only!'),
      '#weight' => 39,
    ];
    $form['settings'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Advanced settings'),
      '#collapsible' => TRUE,
      '#weight' => 40,
    ];
    $form['settings']['override_grant_types'] = [
      '#title' => $this->t('Override available grant types'),
      '#type' => 'checkbox',
      '#default_value' => !empty($client->settings['override_grant_types']),
    ];
    $form['settings']['allow_implicit'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Allow the implicit flow'),
      '#description' => $this->t('Allows clients to receive an access token without the need for an authorization request token.'),
      '#default_value' => !empty($client->settings['allow_implicit']),
      '#states' => [
        'visible' => [
          '#edit-settings-override-grant-types' => ['checked' => TRUE],
        ],
      ],
    ];

    // Prepare a list of available grant types.
    $grant_types = Utility::getGrantTypes();
    $grant_type_options = [];
    foreach ($grant_types as $type => $grant_type) {
      $grant_type_options[$type] = $grant_type['name'];
    }
    $form['settings']['grant_types'] = [
      '#type' => 'checkboxes',
      '#title' => $this->t('Enabled grant types'),
      '#options' => $grant_type_options,
      '#default_value' => $client->settings['grant_types'],
      '#states' => [
        'visible' => [
          '#edit-settings-override-grant-types' => ['checked' => TRUE],
        ],
      ],
    ];

    // Add any grant type specific settings.
    foreach ($grant_types as $type => $grant_type) {

      // Merge-in any provided defaults.
      if (isset($grant_type['default settings'])) {
        $client->settings += $grant_type['default settings'];
      }

      // Add the form elements.
      if (isset($grant_type['settings callback'])) {
        $dom_ids = [];
        $dom_ids[] = 'edit-settings-override-grant-types';
        $dom_ids[] = 'edit-settings-grant-types-' . str_replace('_', '-', $type);
        $form['settings'] += $grant_type['settings callback']($client->settings, $dom_ids);
      }
    }
    return parent::form($form, $form_state);
  }

  /**
   * Determines if the client entity already exists.
   *
   * @param string $client_id
   *   The client ID.
   *
   * @return bool
   *   TRUE if the client exists, FALSE otherwise.
   */
  public function exists($client_id) {
    $entity = $this->storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('client_id', $client_id)
      ->execute();
    return (bool) $entity;
  }

  /**
   * {@inheritdoc}
   */
  protected function actions(array $form, FormStateInterface $form_state) {
    $actions = parent::actions($form, $form_state);
    $actions['submit']['#value'] = $this->t('Save client');
    return $actions;
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state) {
    // Store a new secret if provided.
    if ($client_secret = $form_state->getValue('client_secret')) {
      $hashed_client_secret = $this->entity->hashClientSecret($client_secret);
      if (!$client_secret) {
        $form_state->setErrorByName('client_secret', $this->t('Could not hash the client secret, please provide a different one.'));
      }
      else {
        // Hash the new secret for storage.
        $form_state->setValue('client_secret', $hashed_client_secret);
      }
    }
    // Keep the previously saved secret if field is left empty.
    else {
      $client_secret = $form_state->getTemporaryValue('client_secret');
      $form_state->setValue('client_secret', $client_secret);
    }

    $logo_uri = $form_state->getValue('logo_uri');
    if (!empty($logo_uri) && !UrlHelper::isValid($logo_uri, TRUE)) {
      $form_state->setErrorByName('logo_uri', $this->t('The url is not valid. An absolute url has to be provided.'));
    }

    $client_uri = $form_state->getValue('client_uri');
    if (!empty($client_uri) && !UrlHelper::isValid($client_uri, TRUE)) {
      $form_state->setErrorByName('client_uri', $this->t('The url is not valid. An absolute url has to be provided.'));
    }

    $policy_uri = $form_state->getValue('policy_uri');
    if (!empty($policy_uri) && !UrlHelper::isValid($policy_uri, TRUE)) {
      $form_state->setErrorByName('policy_uri', $this->t('The url is not valid. An absolute url has to be provided.'));
    }

    $tos_uri = $form_state->getValue('tos_uri');
    if (!empty($tos_uri) && !UrlHelper::isValid($tos_uri, TRUE)) {
      $form_state->setErrorByName('tos_uri', $this->t('The url is not valid. An absolute url has to be provided.'));
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    parent::submitForm($form, $form_state);
    $this->messenger()->addMessage($this->t('The client configuration has been saved.'));
    $form_state->setRedirect('entity.oauth2_server.clients', ['oauth2_server' => $form_state->get('oauth2_server')->id()]);
  }

}
