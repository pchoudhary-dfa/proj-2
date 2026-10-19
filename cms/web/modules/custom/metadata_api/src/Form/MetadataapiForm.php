<?php

namespace Drupal\metadata_api\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configure settings for Custom Password Policy.
 */
class MetadataapiForm extends ConfigFormBase {
  /**
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'metadata_settings';
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames() {
    return [
      'metadata.adminsettings',  
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {  
    $config = $this->config('metadata.adminsettings');  

    $form['api_url'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('Metadata API Url'),
      '#required' => TRUE,
      '#default_value' => $config->get('api_url'),  
    ];
    
    $form['api_username'] = [  
      '#type' => 'textfield',  
      '#required' => TRUE,
      '#title' => $this->t('Metadata Username'),
      '#default_value' => $config->get('api_username'),  
    ];

    if($config->get('api_password') != '') {
      $form['api_password'] = [
        '#type' => 'password',
        '#title' => $this->t('Metadata Password'), 
      ];
    } else {
      $form['api_password'] = [
        '#type' => 'password',  
        '#required' => TRUE,
        '#title' => $this->t('Metadata Password'), 
      ];
    }

    $form['api_db_id'] = [  
      '#type' => 'textfield',  
      '#required' => TRUE,
      '#title' => $this->t('Metadata Database ID'),
      '#default_value' => $config->get('api_db_id'),  
    ];

    return parent::buildForm($form, $form_state);  
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {  
    parent::submitForm($form, $form_state);
    if($form_state->getValue('api_password') !='') {
      $this->config('metadata.adminsettings')  
        ->set('api_url', $form_state->getValue('api_url'))
        ->set('api_username', $form_state->getValue('api_username'))
        ->set('api_password', $form_state->getValue('api_password'))
        ->set('api_db_id', $form_state->getValue('api_db_id'))
        ->save();

    } else {
      $this->config('metadata.adminsettings')  
        ->set('api_url', $form_state->getValue('api_url'))
        ->set('api_username', $form_state->getValue('api_username'))
        ->set('api_db_id', $form_state->getValue('api_db_id'))
        ->save();
    } 
  }
}