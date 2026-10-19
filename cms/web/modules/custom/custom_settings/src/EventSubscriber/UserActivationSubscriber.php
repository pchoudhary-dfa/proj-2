<?php

namespace Drupal\custom_settings\EventSubscriber;

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Url;
use Drupal\user\Entity\User;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

class UserActivationSubscriber implements EventSubscriberInterface {

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::REQUEST => [['onKernelRequest', 30]],
    ];
  }

  /**
   * Intercept password reset link requests.
   */
  public function onKernelRequest(RequestEvent $event): void {
    if (!$event->isMainRequest()) {
      return;
    }

    $request = $event->getRequest();
    $route_name = \Drupal::routeMatch()->getRouteName();

    // Intercept the one-time password reset route.
    if ($route_name === 'user.reset') {
      $uid = \Drupal::routeMatch()->getParameter('uid');
      $timestamp = \Drupal::routeMatch()->getParameter('timestamp');
      $hash = \Drupal::routeMatch()->getParameter('hash');

      if ($uid && $timestamp && $hash) {
        $user = User::load($uid);
        if ($user) {
          $current = \Drupal::time()->getRequestTime();
          $timeout = \Drupal::config('user.settings')->get('password_reset_timeout') ?: 86400;

          // Validate link hash and expiration.
          $hash_expected = user_pass_rehash($user, $timestamp);
          $is_valid_hash = hash_equals($hash_expected, $hash);
          $is_expired = ($user->getLastLoginTime() && ($current - $timestamp > $timeout));

          if ($is_valid_hash && !$is_expired) {
            // Activate the user if they are currently blocked.
            if (!$user->isActive()) {
              $user->activate();
              $user->save();
            }

            // Log the user in programmatically.
            user_login_finalize($user);

            // Generate password reset token and store in session.
            $token = Crypt::randomBytesBase64(55);
            $request->getSession()->set('pass_reset_' . $user->id(), $token);

            // Notify the user.
            \Drupal::messenger()->addStatus(t('You have used a one-time login link. You can set your new password now.'));

            // Redirect directly to the user profile edit page.
            $redirect_url = Url::fromRoute('entity.user.edit_form', ['user' => $user->id()], [
              'query' => ['pass-reset-token' => $token],
              'absolute' => TRUE,
            ])->toString();

            $event->setResponse(new RedirectResponse($redirect_url));
          }
        }
      }
    }
  }

}
