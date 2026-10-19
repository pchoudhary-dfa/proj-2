<?php

namespace Drupal\oauth2_server\Controller;

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\PrivateKey;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Site\Settings;
use Drupal\Core\State\State;
use Drupal\Core\Url;
use Drupal\oauth2_server\OAuth2StorageInterface;
use Drupal\oauth2_server\ScopeUtility;
use Drupal\oauth2_server\Utility;
use OAuth2\HttpFoundationBridge\Request as BridgeRequest;
use OAuth2\HttpFoundationBridge\Response as BridgeResponse;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Class OAuth2 Controller.
 *
 * @package Drupal\oauth2_server\Controller
 */
class OAuth2Controller extends ControllerBase {

  /**
   * The OAuth2Storage service.
   *
   * @var \Drupal\oauth2_server\OAuth2StorageInterface
   */
  protected $storage;

  /**
   * The state service.
   *
   * @var \Drupal\Core\State\State
   */
  protected $state;

  /**
   * The private key service.
   *
   * @var \Drupal\Core\PrivateKey
   */
  protected $privateKey;

  /**
   * The logger channel.
   *
   * @var \Drupal\Core\Logger\LoggerChannel|\Drupal\Core\Logger\LoggerChannelInterface
   */
  protected $logger;

  /**
   * The class constructor.
   *
   * @param \Drupal\oauth2_server\OAuth2StorageInterface $oauth2_storage
   *   The oauth2 storage service.
   * @param \Drupal\Core\State\State $state
   *   The state service.
   * @param \Drupal\Core\PrivateKey $private_key
   *   The private key service.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory service.
   */
  public function __construct(
    OAuth2StorageInterface $oauth2_storage,
    State $state,
    PrivateKey $private_key,
    LoggerChannelFactoryInterface $logger_factory,
  ) {
    $this->storage = $oauth2_storage;
    $this->state = $state;
    $this->privateKey = $private_key;
    $this->logger = $logger_factory->get('oauth2_server');
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('oauth2_server.storage'),
      $container->get('state'),
      $container->get('private_key'),
      $container->get('logger.factory')
    );
  }

  /**
   * Authorize.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return array|\OAuth2\HttpFoundationBridge\Response|\Symfony\Component\HttpFoundation\JsonResponse|\Symfony\Component\HttpFoundation\RedirectResponse
   *   A form array or a response object.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function authorize(RouteMatchInterface $route_match, Request $request) {
    $this->moduleHandler()->invokeAll('oauth2_server_pre_authorize');

    // Workaround https://www.drupal.org/project/oauth2_server/issues/3049250
    // Create a duplicate request with the parameters removed, so that the
    // object can survive being serialized.
    $duplicated_request = $request->duplicate(NULL, NULL, []);
    $bridgeRequest = BridgeRequest::createFromRequest($duplicated_request);

    if ($this->currentUser()->isAnonymous()) {
      // A user may be redirected to the authorize request a second time
      // but without parameters. For example when a user has to register
      // rather than login. In such a case we have already stored a valid
      // request and don't want to overwrite it with an invalid request.
      // In case a user visits the authorize link directly this changes nothing.
      if ($bridgeRequest->get('client_id')) {
        $_SESSION['oauth2_server_authorize'] = $bridgeRequest;
      }
      $query = http_build_query($request->query->all());
      $url = new Url('user.login', [], ['query' => ['destination' => 'oauth2/authorize?' . $query]]);
      $url->setAbsolute(TRUE);
      return new RedirectResponse($url->toString());
    }

    // A login happened: Create the request with parameters from the session.
    if (!empty($_SESSION['oauth2_server_authorize'])) {
      $bridgeRequest = $_SESSION['oauth2_server_authorize'];
    }

    $client = FALSE;
    if ($bridgeRequest->get('client_id')) {
      /** @var \Drupal\oauth2_server\ClientInterface[] $clients */
      $clients = $this->entityTypeManager()->getStorage('oauth2_server_client')
        ->loadByProperties([
          'client_id' => $bridgeRequest->get('client_id'),
        ]);
      if ($clients) {
        $client = reset($clients);
      }
    }
    if (!$client) {
      return new JsonResponse(
        ['error' => 'Client could not be found.'],
        JsonResponse::HTTP_NOT_FOUND
      );
    }

    // Load the server.
    $server = $client->getServer();

    // If the oauth2_server is not enabled, this does not exist.
    if (!$server->status()) {
      $this->logger->warning('Attempt to login using disabled oauth2_server %server_id', ['%server_id' => $server->id()]);
      throw new NotFoundHttpException();
    }

    // Initialize the server.
    $oauth2_server = Utility::startServer($server, $this->storage);

    // Automatic authorization is enabled for this client. Finish authorization.
    // handleAuthorizeRequest() will call validateAuthorizeRequest().
    $response = new BridgeResponse();
    if ($client->automatic_authorization) {
      unset($_SESSION['oauth2_server_authorize']);
      $oauth2_server
        ->handleAuthorizeRequest($bridgeRequest, $response, TRUE, $this->currentUser()->id());
		
		##########################Custom Code###############################    
        // If authorization code request from monitoring
        if (isset($_REQUEST['return_data']) && $_REQUEST['return_data']=='mon'){		  
          foreach($response->headers as $inx =>$hdrs){
                  if($inx=='location'){
                        return new JsonResponse(['location' => base64_encode($hdrs[0])]); //, JsonResponse::HTTP_NOT_FOUND
                  }
          }
        }
        ####################################################################
		
      return $response;
    }
    else {
      // Validate the request.
      if (!$oauth2_server->validateAuthorizeRequest($bridgeRequest, $response)) {
        // Clear the parameters saved in the session to avoid reusing them when
        // doing another request while logged in.
        unset($_SESSION['oauth2_server_authorize']);
        return $response;
      }

      // Determine the scope for this request.
      $scope_util = new ScopeUtility($client->getServer());
      if (!$scope = $scope_util->getScopeFromRequest($bridgeRequest)) {
        $scope = $scope_util->getDefaultScope();
      }
      // Convert the scope string to a set of entities.
      $scope_names = explode(' ', $scope);
      $scopes = $this->entityTypeManager()->getStorage('oauth2_server_scope')
        ->loadByProperties([
          'server_id' => $client->getServer()->id(),
          'scope_id' => $scope_names,
        ]);

      // Show the authorize form.
      return $this->formBuilder()->getForm(
        'Drupal\oauth2_server\Form\AuthorizeForm',
        [
          'client' => $client,
          'scopes' => $scopes,
        ]
      );
    }
  }

  /**
   * Token.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \OAuth2\HttpFoundationBridge\Response|\Symfony\Component\HttpFoundation\JsonResponse
   *   A response object.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function token(RouteMatchInterface $route_match, Request $request) {
    $bridgeRequest = BridgeRequest::createFromRequest($request);
    $client_credentials = Utility::getClientCredentials($bridgeRequest);

    // Get the client and use it to load the server and initialize the server.
    $client = FALSE;
    if ($client_credentials) {
      /** @var \Drupal\oauth2_server\ClientInterface[] $clients */
      $clients = $this->entityTypeManager()->getStorage('oauth2_server_client')
        ->loadByProperties(['client_id' => $client_credentials['client_id']]);
      if ($clients) {
        $client = reset($clients);
      }
    }
    if (!$client) {
      return new JsonResponse(
        ['error' => 'Client could not be found.'],
        JsonResponse::HTTP_NOT_FOUND
      );
    }

    // Load the server.
    $server = $client->getServer();

    // If the oauth2_server is not enabled, this does not exist.
    if (!$server->status()) {
      $this->logger->warning('Attempt to login using disabled oauth2_server %server_id', ['%server_id' => $server->id()]);
      throw new NotFoundHttpException();
    }

    $response = new BridgeResponse();
    $oauth2_server = Utility::startServer($server, $this->storage);
    $oauth2_server->handleTokenRequest($bridgeRequest, $response);
    return $response;
  }

  /**
   * Tokens.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \OAuth2\HttpFoundationBridge\Response|\Symfony\Component\HttpFoundation\JsonResponse
   *   The response object.
   */
  public function tokens(RouteMatchInterface $route_match, Request $request) {
    $token = $route_match->getRawParameter('oauth2_server_token');
    $token = $this->storage->getAccessToken($token);

    // No token found. Stop here.
    if (!$token || $token['expires'] <= time()) {
      return new BridgeResponse([], 404);
    }

    // Return the token, without the server and client_id keys.
    unset($token['server']);
    return new JsonResponse($token);
  }

  /**
   * User info.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \OAuth2\HttpFoundationBridge\Response
   *   The response object.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function userInfo(RouteMatchInterface $route_match, Request $request) {
    $bridgeRequest = BridgeRequest::createFromRequest($request);
    $client_credentials = Utility::getClientCredentials($bridgeRequest);

    // Get the client and use it to load the server and initialize the server.
    $client = FALSE;
    if ($client_credentials) {
      /** @var \Drupal\oauth2_server\ClientInterface[] $clients */
      $clients = $this->entityTypeManager()->getStorage('oauth2_server_client')
        ->loadByProperties(['client_id' => $client_credentials['client_id']]);
      if ($clients) {
        $client = reset($clients);
      }
    }

    $server = NULL;
    if ($client) {
      $server = $client->getServer();

      // If the oauth2_server is not enabled, this does not exist.
      if (!$server->status()) {
        $this->logger->warning('Attempt to login using disabled oauth2_server %server_id', ['%server_id' => $server->id()]);
        throw new NotFoundHttpException();
      }
    }

    $response = new BridgeResponse();
    $oauth2_server = Utility::startServer($server, $this->storage);
    $oauth2_server->handleUserInfoRequest($bridgeRequest, $response);
    return $response;
  }

  /**
   * Revoke.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match service.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The current request object.
   *
   * @return \OAuth2\HttpFoundationBridge\Response
   *   A response object.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function revoke(RouteMatchInterface $route_match, Request $request) {
    $bridgeRequest = BridgeRequest::createFromRequest($request);
    $client_credentials = Utility::getClientCredentials($bridgeRequest);

    // Get the client and use it to load the server and initialize the server.
    $client = FALSE;
    if ($client_credentials) {
      /** @var \Drupal\oauth2_server\ClientInterface[] $clients */
      $clients = $this->entityTypeManager()->getStorage('oauth2_server_client')
        ->loadByProperties(['client_id' => $client_credentials['client_id']]);
      if ($clients) {
        $client = reset($clients);
      }
    }

    $server = NULL;
    if ($client) {
      $server = $client->getServer();

      // If the oauth2_server is not enabled, this does not exist.
      if (!$server->status()) {
        $this->logger->warning('Attempt to login using disabled oauth2_server %server_id', ['%server_id' => $server->id()]);
        throw new NotFoundHttpException();
      }
    }

    $response = new BridgeResponse();
    $oauth2_server = Utility::startServer($server, $this->storage);
    $oauth2_server->handleRevokeRequest($bridgeRequest, $response);
    return $response;
  }

  /**
   * Certificates.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The response object.
   */
  public function certificates(RouteMatchInterface $route_match, Request $request) {
    $keys = Utility::getKeys();
    $this->accessNeedsKeys();
    $certificates = [];
    $certificates[] = $keys['public_key'];
    return new JsonResponse($certificates);
  }
  
  
  
  ##########################Custom Code############################### 
  /**
   * Access needs Keys.
   */
  public function accessNeedsKeys() {
    $this->openIdConfiguration();
  }
  
  /**
   * To get jwk uri
   * Added by CSF
   * @06-Mar-2018
  */
  private function openIdConfiguration() {
    $foundJwkUri = $foundOpenidConfiguration = false;
    if (!empty($_GET)) {
      array_walk($_GET, function ($val, $var) use (&$foundJwkUri, &$foundOpenidConfiguration) {
        if (strtolower($var) == 'jwkuri') {
          $foundJwkUri = true;
        }
        if (strtolower($var) == 'openid-configuration') {
          $foundOpenidConfiguration = true;
        }
      });
    }
    $response = [];
    if ($foundOpenidConfiguration === true) {
      global $base_url;
      $issuer = 'https://' . $_SERVER['HTTP_HOST'];
      $response = [
        'issuer'                                => $issuer,
        'authorization_endpoint'                => $base_url . '/oauth2/authorize',
        'token_endpoint'                        => $base_url . '/oauth2/token',
        'userinfo_endpoint'                     => $base_url . '/oauth2/userInfo',
        'jwks_uri'                              => $base_url . '/oauth2/certificates?jwkUri',
        'response_types_supported'              => ['code', 'id_token', 'token id_token', 'code id_token'],
        'subject_types_supported'               => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
      ];
    }
    if ($foundJwkUri === true) {
      $keys = Utility::getKeys();
      if (!empty($keys['public_key'])) {
        $public_key = openssl_pkey_get_public($keys['public_key']);
        $public_key = openssl_pkey_get_details( $public_key );
        $response   = [
          'keys' => [
            [
              'kty' => 'RSA',
              'alg' => 'RS256',
              'use' => 'sig',
              'n'   => base64_encode( $public_key['rsa']['n'] ),
              'e'   => base64_encode( $public_key['rsa']['e'] ),
          ],
          ],
        ];
      }
    }
    if ($foundOpenidConfiguration === true || $foundJwkUri === true) {
      echo json_encode($response, 1);die;
    }
  }
  
  ##########################Custom Code############################### 

  /**
   * Json Web Token (JWK).
   *
   * Output the public key as a JSON blob in JWK format, for ease of
   * consumption by clients that support it.
   *
   * @param \Drupal\Core\Routing\RouteMatchInterface $route_match
   *   The route match object.
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   The response object.
   *
   * @see https://tools.ietf.org/html/rfc7517
   */
  public function jwk(RouteMatchInterface $route_match, Request $request) {
    $keys = Utility::getKeys();

    $cert = openssl_x509_read($keys['public_key']);
    $publicKey = openssl_get_publickey($cert);
    $keyDetails = openssl_pkey_get_details($publicKey);
    // We still support PHP 7.4 for previous core, so avoid the deprecation
    // warning by wrapping them.
    if (PHP_MAJOR_VERSION < 8) {
      // @codingStandardsIgnoreLine
      openssl_x509_free($cert); // @phpstan-ignore-line
      // @codingStandardsIgnoreLine
      openssl_pkey_free($publicKey); // @phpstan-ignore-line
    }
    $jwk['e'] = self::base64urlEncode($keyDetails['rsa']['e']);
    $jwk['n'] = self::base64urlEncode($keyDetails['rsa']['n']);
    $jwk['mod'] = self::base64urlEncode($keyDetails['rsa']['n']);
    // @see https://datatracker.ietf.org/doc/html/rfc7517#section-4.7
    $jwk['x5c'][] = base64_encode(self::pem2der($keys['public_key']));
    $jwk['kty'] = 'RSA';
    $jwk['use'] = "sig";
    $jwk['alg'] = "RS256";
    $jwk['kid'] = Crypt::hmacbase64(
      $this->state()->get('oauth2_server.next_certificate_id', 0),
      Settings::getHashSalt()
    );

    $response = ["keys" => [$jwk]];
    // If (openssl_error_string()) {
    // $this->logger->error("Error: @message", [
    // "@code" => openssl_error_string(),
    // ]);
    // throw new HttpException(522, "SSL subsytem failure detected.");
    // }
    // .
    return new JsonResponse($response, 200);
  }

  /**
   * Generates a token based on $value, the token seed, and the private key.
   *
   * @param string $seed
   *   The per-session token seed.
   * @param string $value
   *   (optional) An additional value to base the token on.
   *
   * @return string
   *   A 43-character URL-safe token for validation, based on the token seed,
   *   the hash salt provided by Settings::getHashSalt(), and the
   *   'drupal_private_key' configuration variable.
   *
   * @see \Drupal\Core\Site\Settings::getHashSalt()
   */
  protected function computeToken($seed, $value = '') {
    return Crypt::hmacBase64($value, $seed . $this->privateKey->get() . Settings::getHashSalt());
  }

  /**
   * Convert a PEM encoded to DER encoded certificate.
   *
   * @param string $pem
   *   The PEM encoded certificate.
   *
   * @return string|bool
   *   The DER encoded certificate or false.
   *
   * @see http://php.net/manual/en/ref.openssl.php#74188
   */
  public static function pem2der($pem) {
    $begin = "CERTIFICATE-----";
    $end = "-----END";
    $pem = substr($pem, strpos($pem, $begin) + strlen($begin));
    $pem = substr($pem, 0, strpos($pem, $end));
    $der = base64_decode($pem);
    return $der;
  }

  /**
   * Base64 URL encoding.
   *
   * @param string $data
   *   The data to be encoded.
   *
   * @return string
   *   The Base64 URL encoded data.
   *
   * @see http://php.net/manual/en/function.base64-encode.php#103849
   */
  public static function base64urlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
  }

}
