/**
 * @file
 * Main JavaScript file for Guinea theme.
 */

(function (Drupal) {
  'use strict';

  /**
   * Attach behaviors for Guinea theme.
   */
  Drupal.behaviors.guineaTheme = {
    attach: function (context, settings) {
      // Add any JavaScript functionality here
      
      // Example: Smooth scroll for anchor links
      const anchorLinks = context.querySelectorAll('a[href^="#"]');
      anchorLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
          const href = this.getAttribute('href');
          if (href !== '#' && href.length > 1) {
            const target = context.querySelector(href);
            if (target) {
              e.preventDefault();
              target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }
          }
        });
      });
    }
  };

})(Drupal);

