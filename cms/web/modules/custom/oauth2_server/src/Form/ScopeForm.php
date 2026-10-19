<?php

namespace Drupal\oauth2_server\Form;

use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Form\FormStateInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Class Scope Form.
 *
 * @package Drupal\oauth2_server\Form
 */
class ScopeForm extends EntityForm {

  /**
   * The scope entity.
   *
   * @var \Drupal\oauth2_server\ScopeInterface
   */
  protected $entity;

  /**
   * The scope storage.
   *
   * @var \Drupal\Core\Entity\EntityStorageInterface
   */
  protected $storage;

  /**
   * Scope Form constructor.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   The entity type manager.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager) {
    $this->storage = $entity_type_manager->getStorage('oauth2_server_scope');
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
    $scope = $this->entity;

    $server = $form_state->get('oauth2_server');
    if (!$server) {
      throw new \Exception('OAuth2 server was not set');
    }

    $form['#tree'] = TRUE;
    $form['scope_id'] = [
      '#type' => 'machine_name',
      '#default_value' => !$scope->isNew() ? $scope->scope_id : '',
      '#maxlength' => 50,
      '#required' => TRUE,
      '#machine_name' => [
        'replace_pattern' => '[^a-z0-9_:]+',
        'exists' => [$this->storage, 'load'],
      ],
      '#description' => $this->t('A unique name for this item. It must only contain lowercase letters, numbers, underscores, and semicolons.'),
    ];
    $form['server_id'] = [
      '#type' => 'value',
      '#value' => $server->id(),
    ];
    $form['description'] = [
      '#title' => $this->t('Description'),
      '#type' => 'textfield',
      '#default_value' => $scope->description,
      '#description' => $this->t('Used to describe the scope to the user on the authorization form.'),
      '#required' => TRUE,
    ];
    $form['default'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Default'),
      '#default_value' => $scope->isDefault(),
    ];
    return parent::form($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  protected function actions(array $form, FormStateInterface $form_state) {
    $actions = parent::actions($form, $form_state);
    $actions['submit']['#value'] = $this->t('Save scope');
    return $actions;
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state) {
    parent::validateForm($form, $form_state);
    if ($this->entity->isNew() ||
        $this->entity->getOriginalId() != $this->entity->id()) {
      $exists = $this->storage->load($this->entity->id());
      if ($exists) {
        $form_state->setErrorByName('scope_id', $this->t('This Scope ID already exists.'));
      }
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    parent::submitForm($form, $form_state);
    $this->messenger()->addMessage($this->t('The scope configuration has been saved.'));
    $form_state->setRedirect(
      'entity.oauth2_server.scopes',
      [
        'oauth2_server' => $form_state->get('oauth2_server')->id(),
      ]
    );

    $server = $this->entity->getServer();
    if ($form_state->getValue('default')) {
      $server->settings['default_scope'] = $this->entity->id();
      $server->save();
    }
    elseif ($server->settings['default_scope'] == $this->entity->getOriginalId()) {
      $server->settings['default_scope'] = '';
      $server->save();
    }
  }

}
