/**
 * @file
 * Hero slider: dot click + auto-advance at a standard interval.
 */
(function (Drupal, drupalSettings, $) {
  'use strict';

  var AUTO_INTERVAL_MS = 6000;

  function initHeroSlider() {
    var $section = $('.hero-section');
    if (!$section.length) {
      return;
    }
    var dataSlides = $section.attr('data-hero-slides');
    var defaultImage = $section.attr('data-hero-default-image') || '';
    var slides = [];
    try {
      slides = dataSlides ? JSON.parse(dataSlides) : [];
    } catch (e) {
      return;
    }
    if (slides.length < 2) {
      return;
    }

    var $image = $section.find('.hero-slide-image');
    var $title = $section.find('.hero-slide-title');
    var $title2 = $section.find('.hero-slide-title-2');
    var $subtitle = $section.find('.hero-slide-subtitle');
    var $subtitle2 = $section.find('.hero-slide-subtitle-2');
    var $dots = $section.find('.hero-dot');
    if (!$image.length || !$title.length || !$subtitle.length || !$dots.length) {
      return;
    }

    var currentIndex = 0;
    var autoTimer = null;

    function goToSlide(index) {
      index = Math.max(0, Math.min(index, slides.length - 1));
      currentIndex = index;
      var slide = slides[index];
      var imgSrc = (slide.image_url && slide.image_url.length) ? slide.image_url : defaultImage;
      $image.attr('src', imgSrc);
      $title.text(slide.title || '');
      if ($title2.length) {
        $title2.text(slide.title_2 || '');
      }
      $subtitle.text(slide.subtitle || '');
      if ($subtitle2.length) {
        $subtitle2.text(slide.subtitle_2 || '');
      }
      $dots.each(function (i) {
        var $dot = $(this);
        if (i === index) {
          $dot.addClass('dot-active').removeClass('dot').attr('aria-selected', 'true');
        } else {
          $dot.addClass('dot').removeClass('dot-active').attr('aria-selected', 'false');
        }
      });
    }

    function nextSlide() {
      goToSlide((currentIndex + 1) % slides.length);
    }

    $dots.on('click', function () {
      var index = parseInt($(this).attr('data-hero-index'), 10);
      if (!isNaN(index)) {
        goToSlide(index);
        clearInterval(autoTimer);
        autoTimer = setInterval(nextSlide, AUTO_INTERVAL_MS);
      }
    });

    autoTimer = setInterval(nextSlide, AUTO_INTERVAL_MS);

    $section.on('mouseenter', function () {
      clearInterval(autoTimer);
    });
    $section.on('mouseleave', function () {
      clearInterval(autoTimer);
      autoTimer = setInterval(nextSlide, AUTO_INTERVAL_MS);
    });
  }

  $(document).ready(function () {
    initHeroSlider();
  });
})(Drupal, drupalSettings, jQuery);
