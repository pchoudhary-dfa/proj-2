<?php

/**
 * @file
 * OAuth2 Server API documentation.
 */

use Drupal\oauth2_server\ServerInterface;
use Drupal\user\UserInterface;

/**
 * @addtogroup hooks
 * @{
 */

/**
 * Inform other modules that an authorization process is going to happen.
 */
function hook_oauth2_server_pre_authorize() {
}

/**
 * Allow modules to supply additional claims.
 *
 * @param \Drupal\user\UserInterface $account
 *   The user account object.
 * @param array $requested_scopes
 *   An array of requested scopes.
 *
 * @return array
 *   An array of additional claims.
 */
function hook_oauth2_server_claims(UserInterface $account, array $requested_scopes) {
  $claims = [];
  if (in_array('phone', $requested_scopes)) {
    $claims = [
      'phone_number' => $account->get('field_phone_number')->getValue(),
      'phone_number_verified' => $account->get('field_phone_number_verified')->getValue(),
    ];
  }
  return $claims;
}

/**
 * Perform alterations on the available claims.
 *
 * @param array $claims
 *   An array of claims.
 * @param \Drupal\user\UserInterface $account
 *   A user account object.
 * @param array $requested_scopes
 *   An array of requested scopes.
 */
function hook_oauth2_server_user_claims_alter(array &$claims, UserInterface $account, array $requested_scopes) {
  if (in_array('phone', $requested_scopes)) {
    $claims['phone_number'] = '123456';
    $claims['phone_number_verified'] = FALSE;
  }
}

/**
 * Supply a default scope from a module.
 *
 * Allow any hook_oauth2_server_default_scope() implementations to supply the
 * default scope. The first one to return a scope wins.
 *
 * @param \Drupal\oauth2_server\ServerInterface $server
 *   An OAuth2 Server instance.
 *
 * @return string[]
 *   An array of scope strings.
 */
function hook_oauth2_server_default_scope(ServerInterface $server) {
  // Grant "basic" and "admin" scopes by default.
  if ($server->id() == 'test_server') {
    return ['basic', 'admin'];
  }
}

/**
 * Perform alterations on the available scopes.
 *
 * @param array[] $context
 *   Array of scopes and OAuth2 Server.
 */
function hook_oauth2_server_scope_access_alter(array &$context) {
  if ($context['server']->id() == 'test_server') {
    // We have to loop through the scopes because the actual ids are
    // prefixed with the server id.
    foreach ($context['scopes'] as $id => $scope) {
      if ($scope->scope_id == 'forbidden') {
        unset($context['scopes'][$id]);
      }
    }
  }
}

/**
 * @} End of "addtogroup hooks".
 */
