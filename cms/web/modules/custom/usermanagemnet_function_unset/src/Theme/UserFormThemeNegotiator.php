<?php

namespace Drupal\usermanagemnet_function_unset\Theme;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Theme\ThemeNegotiatorInterface;

/**
 * Forces the administration theme on user create/edit routes.
 *
 * Global Admin often lacks "View the administration theme", so Drupal falls
 * back to the Guinea front theme on /admin/people/create. This negotiator
 * ensures every role sees the same Claro admin UI.
 */
class UserFormThemeNegotiator implements ThemeNegotiatorInterface {

  /**
   * Routes that must always use the administration theme.
   */
  private const ROUTES = [
    'entity.user.create_form',
    'entity.user.edit_form',
  ];

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * Constructs a UserFormThemeNegotiator object.
   */
  public function __construct(ConfigFactoryInterface $config_factory) {
    $this->configFactory = $config_factory;
  }

  /**
   * {@inheritdoc}
   */
  public function applies(RouteMatchInterface $route_match): bool {
    if (in_array($route_match->getRouteName(), self::ROUTES, TRUE)) {
      $request = \Drupal::request();
      $token = $request->query->get('pass-reset-token');
      if ($token !== NULL && $token !== '') {
        return FALSE;
      }
      return TRUE;
    }
    return FALSE;
  }

  /**
   * {@inheritdoc}
   */
  public function determineActiveTheme(RouteMatchInterface $route_match): ?string {
    $admin_theme = $this->configFactory->get('system.theme')->get('admin');
    if (!empty($admin_theme)) {
      return $admin_theme;
    }

    return $this->configFactory->get('system.theme')->get('default') ?: NULL;
  }

}
