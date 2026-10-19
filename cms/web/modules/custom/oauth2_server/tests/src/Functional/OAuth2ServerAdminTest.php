<?php

namespace Drupal\Tests\oauth2_server\Functional;

use Drupal\Core\Url;
use Drupal\Tests\BrowserTestBase;
use Drupal\oauth2_server\ClientInterface;

/**
 * The OAuth2 Server admin test case.
 *
 * @group oauth2_server
 */
class OAuth2ServerAdminTest extends BrowserTestBase {

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stable9';

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['oauth2_server'];

  /**
   * Test editing client secret.
   */
  public function testEditingClientSecret() {
    /** @var \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager */
    $entity_type_manager = $this->container->get('entity_type.manager');

    /** @var \Drupal\Core\Password\PasswordInterface $password_hasher */
    $password_hasher = $this->container->get('password');

    $account = $this->drupalCreateUser(['administer oauth2 server']);
    $this->drupalLogin($account);

    $server_id = strtolower($this->randomMachineName());
    $this->drupalGet(new Url('entity.oauth2_server.add_form'));

    // Create a server in the UI.
    $this->submitForm([
      'name' => $this->randomString(),
      'server_id' => $server_id,
    ], 'Save server');

    // Create a client of the server in the UI, with a random secret.
    $client_id = strtolower($this->randomMachineName());
    $secret = $this->randomString(32);
    $this->drupalGet(new Url('entity.oauth2_server.clients.add_form', ['oauth2_server' => $server_id]));
    $this->submitForm([
      'name' => $this->randomString(),
      'client_id' => $client_id,
      'redirect_uri' => 'http://localhost',
      'client_secret' => $secret,
    ], 'Save client');

    // Test that the raw secret does not match the saved (hashed) one.
    /** @var \Drupal\oauth2_server\ClientInterface $client */
    $client = $entity_type_manager->getStorage('oauth2_server_client')->load($client_id);
    $this->assertNotEquals($secret, $client->client_secret, 'Raw secret does not match hashed secret.');

    // Test that the secret can be matched.
    $this->assertTrue($password_hasher->check($secret, $client->client_secret), 'Hashes match for known secret and stored secret.');

    // Edit the client, and do not set a new secret. It should stay the same.
    $old_hashed_secret = $client->client_secret;
    $this->updateClient($client, [
      'name' => $this->randomString(),
    ]);
    $entity_type_manager->getStorage('oauth2_server_client')->resetCache();
    $client = $entity_type_manager->getStorage('oauth2_server_client')->load($client_id);
    $this->assertEquals($old_hashed_secret, $client->client_secret, 'Secret is not changed accidentally when editing the client.');

    // Edit the client, and set a new, non-empty secret.
    $new_secret = $this->randomString(32);
    $this->updateClient($client, [
      'client_secret' => $new_secret,
    ]);
    $entity_type_manager->getStorage('oauth2_server_client')->resetCache();
    $client = $entity_type_manager->getStorage('oauth2_server_client')->load($client_id);
    $this->assertTrue($password_hasher->check($new_secret, $client->client_secret), 'Hashes match for new secret and stored secret.');
  }

  /**
   * Edit a client in the UI.
   *
   * @param \Drupal\oauth2_server\ClientInterface $client
   *   The client entity.
   * @param array $values
   *   New values.
   */
  protected function updateClient(ClientInterface $client, array $values) {
    $edit_uri = new Url('entity.oauth2_server.clients.edit_form', [
      'oauth2_server' => $client->getServer()->id(),
      'oauth2_server_client' => $client->id(),
    ]);
    $this->drupalGet($edit_uri);
    $this->submitForm($values, 'Save client');
  }

}
