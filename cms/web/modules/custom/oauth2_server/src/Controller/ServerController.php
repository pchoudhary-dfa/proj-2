<?php

namespace Drupal\oauth2_server\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\oauth2_server\ServerInterface;

/**
 * Class Server Controller.
 *
 * @package Drupal\oauth2_server\Controller
 */
class ServerController extends ControllerBase {

  /**
   * Enables a OAuth2 server without a confirmation form.
   *
   * @param \Drupal\oauth2_server\ServerInterface $oauth2_server
   *   The server to be enabled.
   *
   * @return \Symfony\Component\HttpFoundation\Response
   *   The response to send to the browser.
   *
   * @throws \Drupal\Core\Entity\EntityStorageException
   */
  public function serverBypassEnable(ServerInterface $oauth2_server) {
    $oauth2_server->setStatus(TRUE)->save();

    // Notify the user about the status change.
    $this->messenger()->addMessage(
      $this->t(
        'The OAuth2 server %name has been enabled.',
        [
          '%name' => $oauth2_server->label(),
        ]
      )
    );
    return $this->redirect('oauth2_server.overview');
  }

}
