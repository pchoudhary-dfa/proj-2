/**
 * Guinea theme custom JavaScript.
 * Wrapped in IIFE so $ works (Drupal uses jQuery noConflict - only jQuery is global).
 */
(function ($) {
  'use strict';

  $(document).ready(function () {

    // Remove extra spaces from text content
    $('div, p, span, a, i').each(function () {
      if (this.childNodes.length === 1 && this.childNodes[0].nodeType === 3) {
        this.textContent = this.textContent.replace(/\u00A0/g, '');
      }
    });

    // Open/close menu
    jQuery(document).ready(function() {
      jQuery('.open-menu').click(function() {
        jQuery('.header-menu').slideToggle(); // smooth open/close
      });
    });
    
    jQuery(document).ready(function() {
      jQuery('.header-menu ul.d-flex > li > span').click(function() {
        jQuery('.header-menu ul.d-flex li ul.inner-dropdown').slideToggle();
        jQuery('.header-menu ul.d-flex > li > span.nav-dropdown-icon').toggleClass("rotate-180"); 
      });
    });


    // Scroll to top
    // $(window).scroll(function () {
    //   if ($(this).scrollTop() > 5) {
    //     $('.scroll-top').fadeIn();
    //   } else {
    //     $('.scroll-top').fadeOut();
    //   }
    // });
    // $('.scroll-top').click(function () {
    //   $('html, body').animate({ scrollTop: 0 }, 800);
    //   return false;
    // });

  });

})(jQuery);

/**
 * Login page: show/hide password toggle (eye button).
 */
(function (Drupal, $) {
  'use strict';

  Drupal.behaviors.guineaLoginPasswordToggle = {
    attach: function (context) {
      var $inputs = $('#user_Login .login-form input[type="password"], .password-reset-form-panel input[type="password"]', context);
      $inputs.each(function () {
        var $input = $(this);
        if ($input.closest('.password-toggle-wrap').length) {
          return;
        }
        $input.wrap('<div class="password-toggle-wrap"></div>');
        var $btn = $('<button>', {
          type: 'button',
          class: 'password-toggle-btn',
          'aria-label': 'Afficher le mot de passe',
          'aria-pressed': 'false',
          html: '<i class="fa-solid fa-eye" aria-hidden="true"></i>',
        });
        $input.parent().append($btn);

        $btn.on('click', function (e) {
          e.preventDefault();
          var isHidden = $input.attr('type') === 'password';
          if (isHidden) {
            $input.attr('type', 'text');
            $btn.attr('aria-label', 'Masquer le mot de passe').attr('aria-pressed', 'true');
            $btn.find('i').removeClass('fa-eye').addClass('fa-eye-slash');
          } else {
            $input.attr('type', 'password');
            $btn.attr('aria-label', 'Afficher le mot de passe').attr('aria-pressed', 'false');
            $btn.find('i').removeClass('fa-eye-slash').addClass('fa-eye');
          }
        });
      });
    },
  };
})(Drupal, jQuery);

/**
 * Keep apprentissage load-more state out of URL.
 *
 * Views infinite scroll may write ?page=... in browser history.
 * If that stays in the address bar, browser refresh requests that page and
 * users land on a later chunk instead of the initial listing.
 */
(function (Drupal) {
  'use strict';

  function isApprentissagePath(pathname) {
    return /\/apprenti(?:ssage|ssages|sages)\/?$/i.test(pathname || '');
  }

  function stripPageParam(urlValue) {
    if (!urlValue) {
      return urlValue;
    }

    var parsedUrl = new URL(urlValue, window.location.href);
    if (!parsedUrl.searchParams.has('page')) {
      return urlValue;
    }

    parsedUrl.searchParams.delete('page');
    return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  }

  Drupal.behaviors.guineaResetApprentissagePageParam = {
    attach: function (context) {
      if (context !== document || !window.history || !window.history.replaceState) {
        return;
      }

      if (!isApprentissagePath(window.location.pathname || '')) {
        return;
      }

      if (!window.__guineaApprentissageHistoryPatched) {
        var originalPushState = window.history.pushState.bind(window.history);
        var originalReplaceState = window.history.replaceState.bind(window.history);

        window.history.pushState = function (state, title, url) {
          return originalPushState(state, title, stripPageParam(url));
        };

        window.history.replaceState = function (state, title, url) {
          return originalReplaceState(state, title, stripPageParam(url));
        };

        window.__guineaApprentissageHistoryPatched = true;
      }

      // Clean current URL if user enters with ?page=... already present.
      var cleanUrl = stripPageParam(window.location.href);
      if (cleanUrl && cleanUrl !== (window.location.pathname + window.location.search + window.location.hash)) {
        window.history.replaceState({}, '', cleanUrl);
      }
    },
  };
})(Drupal);

/**
 * Real-time password match check and submission intercept for password-reset.
 */
(function (Drupal, $) {
  'use strict';

  Drupal.behaviors.guineaPasswordResetMatch = {
    attach: function (context) {
      var $pass1 = $('.password-reset-form-panel [name="pass[pass1]"], .password-reset-form-panel #edit-pass-pass1', context);
      var $pass2 = $('.password-reset-form-panel [name="pass[pass2]"], .password-reset-form-panel #edit-pass-pass2', context);
      var $form = $('.password-reset-form-panel form.user-form', context);

      if (!$pass1.length || !$pass2.length) {
        return;
      }

      // Add messages containers if they don't already exist
      var $target1 = $pass1.parent('.password-toggle-wrap').length ? $pass1.parent('.password-toggle-wrap') : $pass1;
      var $target2 = $pass2.parent('.password-toggle-wrap').length ? $pass2.parent('.password-toggle-wrap') : $pass2;

      if (!$target1.next('.field-error-message').length) {
        $('<div class="field-error-message" style="color: #cc0000; font-size: 13px; font-weight: bold; margin-top: 6px;"></div>').insertAfter($target1);
      }
      if (!$target2.next('.field-match-message').length) {
        $('<div class="field-match-message" style="font-size: 13px; font-weight: bold; margin-top: 6px;"></div>').insertAfter($target2);
      }

      var $pass1Error = $target1.next('.field-error-message');
      var $pass2Message = $target2.next('.field-match-message');

      function checkPasswordMatch() {
        var val1 = $pass1.val();
        var val2 = $pass2.val();

        $pass2.removeClass('is-invalid is-valid');

        if (val2 === '') {
          $pass2Message.text('');
          return;
        }

        if (val1 === val2) {
          $pass2Message.text("Les mots de passe correspondent.").css('color', '#006600');
          $pass2.addClass('is-valid').removeClass('is-invalid');
        } else {
          $pass2Message.text("Les mots de passe ne correspondent pas.").css('color', '#cc0000');
          $pass2.addClass('is-invalid').removeClass('is-valid');
        }
      }

      $pass1.off('input.match').on('input.match', function () {
        $pass1.removeClass('is-invalid');
        $pass1Error.text('');
        if ($pass2.val() !== '') {
          checkPasswordMatch();
        }
      });

      $pass2.off('input.match').on('input.match', checkPasswordMatch);

      $form.off('submit.match').on('submit.match', function (e) {
        var hasError = false;

        if ($pass1.val().trim() === '') {
          $pass1.addClass('is-invalid');
          $pass1Error.text("Le mot de passe est requis.");
          hasError = true;
        }

        if ($pass1.val() !== $pass2.val()) {
          $pass2.addClass('is-invalid');
          $pass2Message.text("Les mots de passe ne correspondent pas.").css('color', '#cc0000');
          hasError = true;
        }

        if (hasError) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }
  };
})(Drupal, jQuery);
