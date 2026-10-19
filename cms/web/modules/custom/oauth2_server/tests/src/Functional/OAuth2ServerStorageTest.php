<?php

namespace Drupal\Tests\oauth2_server\Functional;

use Drupal\Tests\BrowserTestBase;

/**
 * The OAuth2 Server admin test case.
 *
 * @group oauth2_server
 */
class OAuth2ServerStorageTest extends BrowserTestBase {

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stable9';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['oauth2_server'];

  /**
   * The client key of the test client.
   *
   * @var string
   */
  protected $clientId = 'test_client';

  /**
   * The client secret of the test client.
   *
   * @var string
   */
  protected $clientSecret = 'test_secret';

  /**
   * The storage instance to be tested.
   *
   * @var \Drupal\oauth2_server\OAuth2StorageInterface
   */
  protected $storage;

  /**
   * The test client.
   *
   * @var \Drupal\oauth2_server\ClientInterface
   */
  protected $client;

  /**
   * The redirect uri used on multiple locations.
   *
   * @var string
   */
  protected $redirectUri;

  /**
   * {@inheritdoc}
   */
  public function setUp(): void {
    parent::setUp();

    $this->redirectUri = $this->buildUrl('authorized', ['absolute' => TRUE]);

    /** @var \Drupal\oauth2_server\ServerInterface $server */
    $server = $this->container->get('entity_type.manager')->getStorage('oauth2_server')->create([
      'server_id' => 'test_server',
      'name' => 'Test Server',
      'settings' => [
        'default_scope' => '',
        'allow_implicit' => TRUE,
        'grant_types' => [
          'authorization_code' => 'authorization_code',
          'client_credentials' => 'client_credentials',
          'refresh_token' => 'refresh_token',
          'password' => 'password',
        ],
        'always_issue_new_refresh_token' => TRUE,
        'advanced_settings' => [
          'require_exact_redirect_uri' => TRUE,
        ],
      ],
    ]);
    $server->save();

    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $this->client = $this->container->get('entity_type.manager')->getStorage('oauth2_server_client')->create([
      'client_id' => $this->clientId,
      'server_id' => $server->id(),
      'name' => 'Test client',
      'unhashed_client_secret' => $this->clientSecret,
      'redirect_uri' => $this->redirectUri,
      'automatic_authorization' => TRUE,
    ]);
    $this->client->save();

    $this->storage = $this->container->get('oauth2_server.storage');
  }

  /**
   * Check client credentials.
   */
  public function testCheckClientCredentials() {
    // Nonexistent client_id.
    $result = $this->storage->checkClientCredentials('fakeclient', 'testpass');
    $this->assertFalse($result, 'Invalid client credentials correctly detected.');

    // Invalid client_secret.
    $result = $this->storage->checkClientCredentials($this->clientId, 'invalidcredentials');
    $this->assertFalse($result, 'Invalid client_secret correctly detected.');

    // Valid credentials.
    $result = $this->storage->checkClientCredentials($this->clientId, $this->clientSecret);
    $this->assertTrue($result, 'Valid client credentials correctly detected.');

    // No client secret.
    $result = $this->storage->checkClientCredentials($this->clientId, '');
    $this->assertFalse($result, 'Empty client secret not accepted.');

    // Allow empty client secret, try again.
    $this->client->client_secret = '';
    $this->client->save();
    $result = $this->storage->checkClientCredentials($this->clientId, '');
    $this->assertTrue($result, 'Empty client secret accepted if none required.');

    // Try again with a NULL client secret. This should be accepted too.
    $result = $this->storage->checkClientCredentials($this->clientId, NULL);
    $this->assertTrue($result, 'Null client secret accepted if none required.');
  }

  /**
   * Get client credentials.
   */
  public function testGetClientDetails() {
    // Nonexistent client_id.
    $details = $this->storage->getClientDetails('fakeclient');
    $this->assertFalse($details, 'Invalid client_id correctly detected.');

    // Valid client_id.
    $details = $this->storage->getClientDetails($this->clientId);
    $this->assertNotNull($details, 'Client details successfully returned.');
    $this->assertArrayHasKey('client_id', $details, 'The "client_id" value is present in the client details.');
    $this->assertArrayHasKey('client_secret', $details, 'The "client_secret" value is present in the client details.');
    $this->assertArrayHasKey('redirect_uri', $details, 'The "redirect_uri" value is present in the client details.');
  }

  /**
   * Access token.
   */
  public function testAccessToken() {
    $user = $this->drupalCreateUser(['use oauth2 server']);

    $token = (bool) $this->storage->getAccessToken('newtoken');
    $this->assertFalse($token, 'Trying to load a nonexistent token is unsuccessful.');

    $expires = time() + 20;
    $success = (bool) $this->storage->setAccessToken('newtoken', $this->clientId, $user->id(), $expires);
    $this->assertTrue($success, 'A new access token has been successfully created.');

    // Verify the return format of getAccessToken().
    $token = $this->storage->getAccessToken('newtoken');
    $this->assertTrue((bool) $token, 'An access token was successfully returned.');
    $this->assertArrayHasKey('access_token', $token, 'The "access_token" value is present in the token array.');
    $this->assertArrayHasKey('client_id', $token, 'The "client_id" value is present in the token array.');
    $this->assertArrayHasKey('user_id', $token, 'The "user_id" value is present in the token array.');
    $this->assertArrayHasKey('expires', $token, 'The "expires" value is present in the token array.');
    $this->assertEquals('newtoken', $token['access_token'], 'The "access_token" key has the expected value.');
    $this->assertEquals($this->clientId, $token['client_id'], 'The "client_id" key has the expected value.');
    $this->assertEquals($user->id(), $token['user_id'], 'The "user_id" key has the expected value.');
    $this->assertEquals($expires, $token['expires'], 'The "expires" key has the expected value.');

    // Update the token.
    $expires = time() + 42;
    $success = (bool) $this->storage->setAccessToken('newtoken', $this->clientId, $user->id(), $expires);
    $this->assertTrue($success, 'The access token was successfully updated.');

    $token = $this->storage->getAccessToken('newtoken');
    $this->assertTrue((bool) $token, 'An access token was successfully returned.');
    $this->assertEquals($expires, $token['expires'], 'The expires timestamp matches the new value.');
  }

  /**
   * Set refresh token.
   */
  public function testSetRefreshToken() {
    $user = $this->drupalCreateUser(['use oauth2 server']);

    $token = (bool) $this->storage->getRefreshToken('refreshtoken');
    $this->assertFalse($token, 'Trying to load a nonexistent token is unsuccessful.');

    $expires = time() + 20;
    $success = (bool) $this->storage->setRefreshToken('refreshtoken', $this->clientId, $user->id(), $expires);
    $this->assertTrue($success, 'A new refresh token has been successfully created.');

    // Verify the return format of getRefreshToken().
    $token = $this->storage->getRefreshToken('refreshtoken');
    $this->assertTrue((bool) $token, 'A refresh token was successfully returned.');
    $this->assertArrayHasKey('refresh_token', $token, 'The "refresh_token" value is present in the token array.');
    $this->assertArrayHasKey('client_id', $token, 'The "client_id" value is present in the token array.');
    $this->assertArrayHasKey('user_id', $token, 'The "user_id" value is present in the token array.');
    $this->assertArrayHasKey('expires', $token, 'The "expires" value is present in the token array.');
    $this->assertEquals('refreshtoken', $token['refresh_token'], 'The "refresh_token" key has the expected value.');
    $this->assertEquals($this->clientId, $token['client_id'], 'The "client_id" key has the expected value.');
    $this->assertEquals($user->id(), $token['user_id'], 'The "user_id" key has the expected value.');
    $this->assertEquals($expires, $token['expires'], 'The "expires" key has the expected value.');
  }

  /**
   * Authorization code.
   */
  public function testAuthorizationCode() {
    $user = $this->drupalCreateUser(['use oauth2 server']);

    $code = (bool) $this->storage->getAuthorizationCode('newcode');
    $this->assertFalse($code, 'Trying to load a nonexistent authorization code is unsuccessful.');

    $expires = time() + 20;
    $success = (bool) $this->storage->setAuthorizationCode('newcode', $this->clientId, $user->id(), 'http://example.com', $expires);
    $this->assertTrue($success, 'A new authorization code was successfully created.');

    // Verify the return format of getAuthorizationCode().
    $code = $this->storage->getAuthorizationCode('newcode');
    $this->assertTrue((bool) $code, 'An authorization code was successfully returned.');
    $this->assertArrayHasKey('authorization_code', $code, 'The "authorization_code" value is present in the code array.');
    $this->assertArrayHasKey('client_id', $code, 'The "client_id" value is present in the code array.');
    $this->assertArrayHasKey('user_id', $code, 'The "user_id" value is present in the code array.');
    $this->assertArrayHasKey('redirect_uri', $code, 'The "redirect_uri" value is present in the code array.');
    $this->assertArrayHasKey('expires', $code, 'The "expires" value is present in the code array.');
    $this->assertEquals('newcode', $code['authorization_code'], 'The "authorization_code" key has the expected value.');
    $this->assertEquals($this->clientId, $code['client_id'], 'The "client_id" key has the expected value.');
    $this->assertEquals($user->id(), $code['user_id'], 'The "user_id" key has the expected value.');
    $this->assertEquals('http://example.com', $code['redirect_uri'], 'The "redirect_uri" key has the expected value.');
    $this->assertEquals($expires, $code['expires'], 'The "expires" key has the expected value.');

    // Change an existing code.
    $expires = time() + 42;
    $success = (bool) $this->storage->setAuthorizationCode('newcode', $this->clientId, $user->id(), 'http://example.org', $expires);
    $this->assertTrue($success, 'The authorization code was successfully updated.');

    $code = $this->storage->getAuthorizationCode('newcode');
    $this->assertTrue((bool) $code, 'An authorization code was successfully returned.');
    $this->assertEquals($expires, $code['expires'], 'The expires timestamp matches the new value.');
  }

  /**
   * Check user credentials.
   */
  public function testCheckUserCredentials() {
    $user = $this->drupalCreateUser(['use oauth2 server']);

    // Correct credentials.
    $result = $this->storage->checkUserCredentials($user->name->value, $user->pass_raw);
    $this->assertTrue($result, 'Valid user credentials correctly detected.');
    // Invalid username.
    $result = $this->storage->checkUserCredentials('fakeusername', $user->pass_raw);
    $this->assertFalse($result, 'Invalid username correctly detected.');
    // Invalid password.
    $result = $this->storage->checkUserCredentials($user->name->value, 'fakepass');
    $this->assertFalse($result, 'Invalid password correctly detected');
  }

}
