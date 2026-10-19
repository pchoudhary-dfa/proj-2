<?php

namespace Drupal\oauth2_server;

use OAuth2\RequestInterface;
use OAuth2\ScopeInterface as OAuth2ScopeInterface;

/**
 * Provides a scope-checking utility to the library.
 *
 * @package Drupal\oauth2_server
 */
class ScopeUtility implements OAuth2ScopeInterface {

  /**
   * The server.
   *
   * @var \Drupal\oauth2_server\ServerInterface
   */
  private $server;

  /**
   * ScopeUtility constructor.
   *
   * @param \Drupal\oauth2_server\ServerInterface $server
   *   The server.
   */
  public function __construct(ServerInterface $server) {
    $this->server = $server;
  }

  /**
   * Check if everything in required scope is contained in available scope.
   *
   * @param string $required_scope
   *   A space-separated string of scopes.
   * @param string $available_scope
   *   A space-separated string of scopes.
   *
   * @return bool
   *   TRUE if everything in required scope is contained in available scope,
   *   and FALSE if it isn't.
   *
   * @see http://tools.ietf.org/html/rfc6749#section-7
   *
   * @ingroup oauth2_section_7
   */
  public function checkScope($required_scope, $available_scope) {
    $required_scope = explode(' ', trim($required_scope));
    $available_scope = explode(' ', trim($available_scope));
    return (count(array_diff($required_scope, $available_scope)) == 0);
  }

  /**
   * Check if the provided scope exists in storage.
   *
   * @param string $scope
   *   A space-separated string of scopes.
   * @param string|null $client_id
   *   The requesting client.
   *
   * @return bool
   *   TRUE if it exists, FALSE otherwise.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function scopeExists($scope, $client_id = NULL) {
    $scope = explode(' ', trim($scope));
    // Get all scope entities that match the provided scope.
    // Compare the difference.
    /* @phpstan-ignore-next-line */
    $query = \Drupal::entityQuery('oauth2_server_scope')
      ->accessCheck(FALSE);
    $query->condition('server_id', $this->server->id());
    $query->condition('scope_id', $scope);
    $results = $query->execute();

    $scope_ids = array_keys($results);
    /** @var \Drupal\oauth2_server\ScopeInterface[] $loaded_scopes */
    /* @phpstan-ignore-next-line */
    $loaded_scopes = \Drupal::entityTypeManager()->getStorage('oauth2_server_scope')
      ->loadMultiple($scope_ids);

    // Previously $query->addTag('oauth2_server_scope_access') was used but in
    // the config entities the query alter does not run. Use an alter.
    $context = [
      'scopes' => &$loaded_scopes,
      'server' => $this->server,
    ];
    /* @phpstan-ignore-next-line */
    \Drupal::moduleHandler()->alter('oauth2_server_scope_access', $context);

    if ($loaded_scopes) {
      $found_scope = [];
      foreach ($loaded_scopes as $loaded_scope) {
        $found_scope[] = $loaded_scope->label();
      }
      return (count(array_diff($scope, $found_scope)) == 0);
    }
    return FALSE;
  }

  /**
   * Get scope from request.
   *
   * @param \Oauth2\RequestInterface $request
   *   The request object.
   *
   * @return string
   *   The scope string.
   */
  public function getScopeFromRequest(RequestInterface $request) {
    // "scope" is valid if passed in either POST or QUERY.
    return $request->request('scope', $request->query('scope'));
  }

  /**
   * Get default scope.
   *
   * @param string|null $client_id
   *   The client id string.
   *
   * @return string
   *   The scope string.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function getDefaultScope($client_id = NULL) {
    // Allow any hook_oauth2_server_default_scope() implementations to supply
    // the default scope. The first one to return a scope wins.
    /* @phpstan-ignore-next-line */
    $result = \Drupal::moduleHandler()->invokeAll('oauth2_server_default_scope', [$this->server]);
    if (is_array($result)) {
      sort($result);
      return implode(' ', $result);
    }

    // If there's a valid default scope set in server settings, return it.
    $default_scope = $this->server->settings['default_scope'];
    if (!empty($default_scope)) {
      /** @var \Drupal\oauth2_server\ScopeInterface[] $loaded_scope */
      $loaded_scope = \Drupal::entityTypeManager()->getStorage('oauth2_server_scope')
        ->load($default_scope);
      if ($loaded_scope) {
        return $loaded_scope->scope_id;
      }
    }
    return FALSE;
  }

}
