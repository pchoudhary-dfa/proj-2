<?php

namespace Drupal\visitor_counter\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Cache\Cache;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Drupal\Core\Database\Connection;
use Drupal\Core\Language\LanguageManagerInterface;

/**
 * Provides a 'Visitor Counter' block.
 *
 * @Block(
 *   id = "visitor_counter_block",
 *   admin_label = @Translation("Visitor Counter"),
 * )
 */
class VisitorCounterBlock extends BlockBase implements ContainerFactoryPluginInterface {

  private Connection $db;
  private LanguageManagerInterface $languageManager;

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->db = $container->get('database');
    $instance->languageManager = $container->get('language_manager');
    return $instance;
  }

  public function build(): array {
    // Check if table exists before querying (safety check if schema not installed yet).
    if (!$this->db->schema()->tableExists('visitor_counter_visitors')) {
      return [
        '#theme' => 'item_list__visitor_counter',
        '#items' => [ $this->t('Visiteurs : 0') ],
        '#cache' => [
          'max-age' => 0,
          'contexts' => ['languages:language_interface'],
        ],
      ];
    }

    // Count all-time unique visitors using stable fingerprint when available.
    // This prevents inflated counts when visitor cookies are reset/blocked.
    $query = $this->db->select('visitor_counter_visitors', 'v');
    $query->addExpression(
      "COUNT(DISTINCT CASE WHEN v.ip_hash IS NOT NULL AND v.ip_hash <> '' AND v.ua IS NOT NULL AND v.ua <> '' THEN CONCAT(v.ip_hash, '|', v.ua) ELSE v.token END)",
      'unique_visitors'
    );
    $count = (int) $query->execute()->fetchField();

    $formattedCount = number_format($count);
    $translatedText = $this->t('Visiteurs : @n', ['@n' => $formattedCount]);

    return [
      '#theme' => 'item_list__visitor_counter',
      '#items' => [ $translatedText ],
      '#cache' => [
        'max-age' => 0,
        'contexts' => ['languages:language_interface'],
      ],
    ];
  }

  public function getCacheMaxAge() {
    return 0;
  }
}
