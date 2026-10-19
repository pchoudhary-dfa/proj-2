/**
 * Guinea theme Monitoring tool JavaScript.
 * Wrapped in IIFE so $ works (Drupal uses jQuery noConflict - only jQuery is global).
 */
(function ($) {
  'use strict';

  // Monitoring tool page menu items
  $('.searchContainer').addClass('mCustomScrollbar');
  $('.middleSection').on('click', '.monitoring-icon', function () {
    const $targetMenu = $(this).next().find('.dropdown-menu');
    if ($targetMenu.hasClass('show')) {
      $targetMenu.removeClass('show');
    } else {
      $('.dropdown-menu.business').removeClass('show');
      $targetMenu.addClass('show');
    }
  });
})(jQuery);


// DFA Help icon (config from .env via drupalSettings.guinea)
(function ($, Drupal, drupalSettings) {
  'use strict';

  $(document).ready(function () {
    var guinea = (typeof drupalSettings !== 'undefined' && drupalSettings.guinea) ? drupalSettings.guinea : {};
    var dfaHelpUrl = guinea.DFA_HELP_URL || '';
    var dfaHelpEnabled = String(guinea.IS_DFA_HELP_ENABLED || 'false').toLowerCase() === 'true';

    if (dfaHelpEnabled && dfaHelpUrl && typeof dfaHelp !== 'undefined') {
      dfaHelp.init({
        apiURL: dfaHelpUrl,
        helpIcon: '<i class="fa-solid fa-info-circle fa-custom-size"></i>',
        colorCode: '#59B1EF',
        langCode: 'fr',
        enabled: 'true',
        languages: { 'en': 'en', 'fr': 'fr' }
      });
      dfaHelp.refresh();
    }
  });
})(jQuery, Drupal, drupalSettings);