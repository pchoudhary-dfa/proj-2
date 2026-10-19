/**
 * @file
 * Handles AJAX fetching of CMS related records, including filter submission and response.
 */

(function ($, Drupal, drupalSettings) {
    'use strict';
   /**
   * Attaches the AJAX behavior to fetch post records and filters.
   *
   * @type {Drupal~behavior}
   *
   * @prop {Drupal~behaviorAttach} attach
   *   Attaches ajax functionality to relevant elements.
   */
    Drupal.behaviors.cms_settings = {
        attach: function (context, settings) {
            var sdg_no = Drupal.checkPlain(drupalSettings.sdg_no);

            $(".slices > a").on('click',function() {
                var sdgNo = $(this).attr('id').match(/\d+/);
                var sdgId = $(this).data("sdg");

                $(".sdg-Content > div, .sdgTextBlocks > div, .lines .leaderLine, .slices2 .darkSlice").removeClass("hideCont");
                $($(this).data("target")).addClass("hideCont");
                $('.sliceActive').removeClass("sliceActive");
                $(".slices > a").addClass("sliceSmall");
                $(this).toggleClass("sliceActive");
                $(this).removeClass("sliceSmall");
                $(".slices2 .darkSlice").addClass("dSliceTrans");
                $(".cirPlc").removeClass("show");
                $(".sdg-Content").addClass("smallCirc");
        
                setTimeout(function () {
                    $(".sdgTextBlocks > div").removeClass("change");
                }, 800);

                // The basic check
                if(document.readyState === 'complete') {
                    $.ajax({
                        url: drupalSettings.path.baseUrl + 'sdg-ajax',
                        type: 'post',
                        cache: false,
                        data: {
                            "action": "getSdgData",
                            "sdgNo" : sdgNo[0],
                            "sdgId" : sdgId,
                        },
                        beforeSend: function() {
                            $("#circle"+sdgNo[0]).addClass("show");
                            $('.customRow .tab-content').fadeOut();
                        },
                        success: function(sdg) {
                            $('.customRow .tab-content').html(sdg.sdg_data);
                            $('.customRow .tab-content').fadeIn();
                            $('.sdgDetail .sdg_head').text(sdgNo[0]);
                            $('.sdgDetail .library_data').html(sdg.libraries);
                            $('.sdgDetail .bottom-desc').html(sdg.bottom_desc);
                        }
                    });
                }
            });

            $("[id*='slice']").click(function() {
                var slice = $(this).attr('id').match(/\d+/);
                $(".cirPlc").removeClass("showPermanant");
                $("#circle"+slice[0]).addClass("showPermanant");
            });

            $("[id*='slice']").mouseover(function () {
                var slice = $(this).attr('id').match(/\d+/);
                $("#circle"+slice[0]).addClass("show");
            });
        
            $("[id*='slice']").mouseout(function () {
                var slice = $(this).attr('id').match(/\d+/);
                $("#circle"+slice[0]).removeClass("show");
            });

            $(".slices > a").trigger('click');
            $("#slice"+sdg_no).trigger('click');
            $('#tabSdg-'+sdg_no).addClass('show active'); 
        }
    };
})(jQuery, Drupal, drupalSettings);