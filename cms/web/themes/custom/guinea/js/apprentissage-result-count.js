/**
 * @file
 * Fills [data-guinea-apprentissage-count] from the Apprentissage view total_rows.
 */
(function (Drupal, drupalSettings) {
  'use strict';

  function formatCount(n) {
    if (n === 1) {
      return '1 histoire trouvee';
    }
    return n + ' histoires trouvees';
  }

  Drupal.behaviors.guineaApprentissageResultCount = {
    attach(context, settings) {
      const n = settings.guinea && typeof settings.guinea.apprentissageResultCount === 'number'
        ? settings.guinea.apprentissageResultCount
        : null;

      if (n === null) {
        return;
      }

      // Marker is in page template (outside the Views AJAX DOM subtree).
      document.querySelectorAll('[data-guinea-apprentissage-count]').forEach((el) => {
        el.textContent = formatCount(n);
      });
    },
  };
})(Drupal, drupalSettings);
