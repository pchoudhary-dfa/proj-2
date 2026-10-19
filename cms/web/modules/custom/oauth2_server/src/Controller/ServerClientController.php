<?php

namespace Drupal\oauth2_server\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\oauth2_server\ClientInterface;
use Drupal\oauth2_server\ServerInterface;

/**
 * Class Server Client Controller.
 *
 * @package Drupal\oauth2_server\Controller
 */
class ServerClientController extends ControllerBase {

  /**
   * Return a list of clients for a OAuth2 server.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server to display the clients of.
   *
   * @return array
   *   The renderable array.
   */
  public function serverClients(ServerInterface $oauth2_server) {
    return $this->entityTypeManager()
      ->getListBuilder('oauth2_server_client')
      ->render($oauth2_server);
  }

  /**
   * Returns the page title for an server's "Clients" tab.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server that is displayed.
   *
   * @return string
   *   The page title.
   */
  public function serverClientsTitle(ServerInterface $oauth2_server) {
    return $this->t('OAuth2 Server: %name clients', ['%name' => $oauth2_server->label()]);
  }

  /**
   * Returns the form for adding a client to a server.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server the client should belong to.
   *
   * @return array
   *   The renderable form array.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function serverAddClient(ServerInterface $oauth2_server) {
    $client = $this->entityTypeManager()
      ->getStorage('oauth2_server_client')
      ->create(['server_id' => $oauth2_server->id()]);
    return $this->entityFormBuilder()
      ->getForm($client, 'add', ['oauth2_server' => $oauth2_server]);
  }

  /**
   * Returns the form for editing a client to a server.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server the client should belong to.
   * @param \Drupal\oauth2_server\ClientInterface $oauth2_server_client
   *   The client entity.
   *
   * @return array
   *   The renderable form array.
   */
  public function serverEditClient(ServerInterface $oauth2_server, ClientInterface $oauth2_server_client) {
    return $this->entityFormBuilder()
      ->getForm($oauth2_server_client, 'edit', ['oauth2_server' => $oauth2_server]);
  }

  /**
   * Returns the form for deleting a client to a server.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server the client should belong to.
   * @param \Drupal\oauth2_server\ClientInterface $oauth2_server_client
   *   The client entity.
   *
   * @return array
   *   The renderable form.
   */
  public function serverDeleteClient(ServerInterface $oauth2_server, ClientInterface $oauth2_server_client) {
    return $this->entityFormBuilder()
      ->getForm($oauth2_server_client, 'delete', ['oauth2_server' => $oauth2_server]);
  }

}
