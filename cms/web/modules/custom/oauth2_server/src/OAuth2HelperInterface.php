<?php

namespace Drupal\oauth2_server;

use Symfony\Component\HttpFoundation\Request;

/**
 * Helper methods around OAuth actions.
 */
interface OAuth2HelperInterface {

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
  public function hasValidOauth2Authentication(Request $request) : bool;

  /**
   * Returns the token from the request.
   *
   * Will check both the authorization header as well as an access_token query
   * parameter for the token.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return string|null
   *   The token as string or null if no token was found.
   */
  public function getTokenFromRequest(Request $request) : ?string;

  /**
   * Parses an authentication header for a schema and a token.
   *
   * @param string $header
   *   The value of the Authentication header.
   *
   * @return array|null
   *   An array containing 'schema' and 'token' for a valid authentication
   *   header, null otherwise.
   */
  public function parseAuthorizationHeader(string $header) : ?array;

  /**
   * Returns the scopes that are authorized for the request.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return array
   *   An array containing the scopes that are authorised in the request if the
   *   request contains valid OAuth token. An empty array if no scopes are
   *   authorised.
   */
  public function getAllowedScopesFromRequest(Request $request) : array;

}
