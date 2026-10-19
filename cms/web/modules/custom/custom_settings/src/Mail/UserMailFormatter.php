<?php

namespace Drupal\custom_settings\Mail;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Language\LanguageManagerInterface;
use Drupal\Core\Render\RendererInterface;
use Drupal\Core\Url;
use Drupal\user\UserInterface;

/**
 * Builds branded HTML emails for core user account notifications.
 */
class UserMailFormatter {

  /**
   * Mail keys handled by this formatter.
   */
  protected const SUPPORTED_KEYS = [
    'register_admin_created',
    'register_no_approval_required',
    'password_reset',
    'status_activated',
    'cancel_confirm',
  ];

  /**
   * Constructs a UserMailFormatter object.
   */
  public function __construct(
    protected ConfigFactoryInterface $configFactory,
    protected LanguageManagerInterface $languageManager,
    protected RendererInterface $renderer,
  ) {}

  /**
   * Checks whether a user mail key is supported.
   */
  public function supports(string $key): bool {
    return in_array($key, self::SUPPORTED_KEYS, TRUE);
  }

  /**
   * Builds subject and HTML body for a user notification email.
   *
   * @return array{subject: string, body: string}|null
   *   Rendered mail parts, or NULL when unsupported.
   */
  public function build(string $key, UserInterface $account, string $langcode): ?array {
    if (!$this->supports($key)) {
      return NULL;
    }

    $site_name = 'Plateforme SAMA';
    $language = $this->languageManager->getLanguage($langcode);
    $display_name = $account->getDisplayName() ?: $account->getAccountName();
    $login_url = Url::fromRoute('user.login', [], [
      'absolute' => TRUE,
      'language' => $language,
    ])->toString();

    $app_url = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';
    if ($app_url !== '') {
      $app_url = rtrim($app_url, '/');
      $login_parts = parse_url($login_url);
      if ($login_parts && isset($login_parts['path'])) {
        $path_and_query = $login_parts['path'] . (isset($login_parts['query']) ? '?' . $login_parts['query'] : '');
        $login_url = $app_url . $path_and_query;
      }
    }

    $definitions = $this->getDefinitions($site_name, $display_name, $account, $langcode, $login_url);
    if (!isset($definitions[$key])) {
      return NULL;
    }

    $definition = $definitions[$key];
    $build = [
      '#theme' => 'guinea_user_mail',
      '#subject' => $definition['subject'],
      '#site_name' => $site_name,
      '#logo_url' => $this->getLogoUrl(),
      '#greeting_name' => $display_name,
      '#headline' => $definition['headline'] ?? '',
      '#intro' => $definition['intro'],
      '#action_url' => $definition['action_url'] ?? '',
      '#action_label' => $definition['action_label'] ?? '',
      '#show_login_details' => $definition['show_login_details'] ?? FALSE,
      '#username' => $account->getAccountName(),
      '#login_url' => $login_url,
      '#login_url_label' => (string) t('Cliquez ici', [], ['langcode' => $langcode]),
      '#note' => $definition['note'] ?? '',
      '#langcode' => $langcode,
    ];
    $body = $this->renderer->renderPlain($build);

    return [
      'subject' => $definition['subject'],
      'body' => (string) $body,
    ];
  }

  /**
   * Returns absolute URL to the theme logo, if available.
   */
  protected function getLogoUrl(): string {
    try {
      $theme_path = \Drupal::service('extension.list.theme')->getPath('guinea');
      if (!$theme_path || !file_exists(\Drupal::root() . '/' . $theme_path . '/guinea_logo.png')) {
        return '';
      }
      $request = \Drupal::request();
      $base = $request->getSchemeAndHttpHost() . $request->getBasePath();
      return rtrim($base, '/') . '/' . $theme_path . '/guinea_logo.png';
    }
    catch (\Throwable) {
      return '';
    }
  }

  /**
   * Returns mail content definitions keyed by user mail operation.
   */
  protected function getDefinitions(
    string $site_name,
    string $display_name,
    UserInterface $account,
    string $langcode,
    string $login_url,
  ): array {
    $one_time_login_url = user_pass_reset_url($account, ['langcode' => $langcode]);
    $cancel_url = user_cancel_url($account, ['langcode' => $langcode]);

    $app_url = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';
    if ($app_url !== '') {
      $app_url = rtrim($app_url, '/');

      $one_time_parts = parse_url($one_time_login_url);
      if ($one_time_parts && isset($one_time_parts['path'])) {
        $path_and_query = $one_time_parts['path'] . (isset($one_time_parts['query']) ? '?' . $one_time_parts['query'] : '');
        $one_time_login_url = $app_url . $path_and_query;
      }

      $cancel_parts = parse_url($cancel_url);
      if ($cancel_parts && isset($cancel_parts['path'])) {
        $path_and_query = $cancel_parts['path'] . (isset($cancel_parts['query']) ? '?' . $cancel_parts['query'] : '');
        $cancel_url = $app_url . $path_and_query;
      }
    }
    $one_time_note = t("Ce lien sécurisé ne peut être utilisé qu'une seule fois et vous mènera à une page où vous pourrez choisir votre mot de passe.", [], ['langcode' => $langcode]);

    return [
      'register_admin_created' => [
        'subject' => t('Bienvenue sur la plateforme SAMA - Configurez votre compte', [], ['langcode' => $langcode]),
        'headline' => t('Votre compte est prêt', [], ['langcode' => $langcode]),
        'intro' => t('Un administrateur a créé un compte pour vous sur @site. Cliquez sur le bouton ci-dessous pour vous connecter pour la première fois et choisir votre mot de passe.', ['@site' => $site_name], ['langcode' => $langcode]),
        'action_url' => $one_time_login_url,
        'action_label' => t('Cliquez ici', [], ['langcode' => $langcode]),
        'show_login_details' => TRUE,
        'note' => $one_time_note . ' ' . t("Après avoir défini votre mot de passe, utilisez la page de connexion ci-dessus avec votre nom d'utilisateur et le mot de passe que vous avez choisi.", [], ['langcode' => $langcode]),
      ],
      'register_no_approval_required' => [
        'subject' => t('Bienvenue sur la plateforme SAMA - Configurez votre compte', [], ['langcode' => $langcode]),
        'headline' => t('Merci pour votre inscription', [], ['langcode' => $langcode]),
        'intro' => t('Votre compte sur @site a été créé. Cliquez sur le bouton ci-dessous pour vous connecter pour la première fois et choisir votre mot de passe.', ['@site' => $site_name], ['langcode' => $langcode]),
        'action_url' => $one_time_login_url,
        'action_label' => t('Cliquez ici', [], ['langcode' => $langcode]),
        'show_login_details' => TRUE,
        'note' => $one_time_note,
      ],
      'password_reset' => [
        'subject' => t('Réinitialisation du mot de passe pour @site', ['@site' => $site_name], ['langcode' => $langcode]),
        'headline' => t('Réinitialisation de mot de passe demandée', [], ['langcode' => $langcode]),
        'intro' => t('Nous avons reçu une demande de réinitialisation du mot de passe de votre compte @site. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.', ['@site' => $site_name], ['langcode' => $langcode]),
        'action_url' => $one_time_login_url,
        'action_label' => t('Cliquez ici', [], ['langcode' => $langcode]),
        'note' => $one_time_note . ' ' . t("Si vous n'avez pas demandé cela, vous pouvez ignorer cet e-mail en toute sécurité.", [], ['langcode' => $langcode]),
      ],
      'status_activated' => [
        'subject' => t('Votre compte @site a été activé', ['@site' => $site_name], ['langcode' => $langcode]),
        'headline' => t('Compte activé', [], ['langcode' => $langcode]),
        'intro' => t('Votre compte sur @site a été approuvé et activé. Cliquez sur le bouton ci-dessous pour vous connecter et définir votre mot de passe.', ['@site' => $site_name], ['langcode' => $langcode]),
        'action_url' => $one_time_login_url,
        'action_label' => t('Cliquez ici', [], ['langcode' => $langcode]),
        'show_login_details' => TRUE,
        'note' => $one_time_note,
      ],
      'cancel_confirm' => [
        'subject' => t('Confirmer la suppression du compte sur @site', ['@site' => $site_name], ['langcode' => $langcode]),
        'headline' => t('Demande de suppression de compte', [], ['langcode' => $langcode]),
        'intro' => t('Une demande de suppression de votre compte sur @site a été reçue. Cliquez sur le bouton ci-dessous pour confirmer la suppression.', ['@site' => $site_name], ['langcode' => $langcode]),
        'action_url' => $cancel_url,
        'action_label' => t('Cliquez ici', [], ['langcode' => $langcode]),
        'note' => t("Cette action ne peut pas être annulée. Le lien expire dans un jour et rien ne se passera s'il n'est pas utilisé.", [], ['langcode' => $langcode]),
      ],
    ];
  }

}
