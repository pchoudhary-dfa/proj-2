/**
 * @file
 * Fills [data-guinea-ressources-count] from the Ressources view total_rows (drupalSettings).
 */
(function (Drupal, drupalSettings) {
  'use strict';

  function formatCount(n) {
    if (n === 1) {
      return '1 publication trouvée';
    }
    return n + ' publications trouvées';
  }

  Drupal.behaviors.guineaRessourcesResultCount = {
    attach(context, settings) {
      const n = settings.guinea && typeof settings.guinea.ressourcesResultCount === 'number'
        ? settings.guinea.ressourcesResultCount
        : null;
      if (n === null) {
        return;
      }
      // Marker is in page template (outside the Views AJAX DOM subtree).
      document.querySelectorAll('[data-guinea-ressources-count]').forEach((el) => {
        el.textContent = formatCount(n);
      });
    },
  };
})(Drupal, drupalSettings);
