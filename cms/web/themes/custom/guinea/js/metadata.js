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
  Drupal.behaviors.mybehavior = {
    attach: function (context, settings) {
      jQuery('.selIndicator select').on('change', function (event) {
        event.preventDefault();
        var html = '';
        var langCode = drupalSettings.path.currentLanguage;

        var indicator = this.value;
        $.ajax({
          url: Drupal.url('metadata-ajax', {
            'language': langCode
          }),
          type: 'post',
          dataType: "json",
          cache: false,
          data: {
            "action": "getMetadataByIndGid",
            'indicator': indicator,
            'url': window.location.pathname
          },
          beforeSend: function () {
            $('.metahtml.panelBx .loader').removeClass('hidden');
            jQuery('.border-non-bx').html('');
          },
          success: function (data) {
            /* if($('#metaTitle').length) {
                $('#metaTitle').html('<div class="col-md-10 pr-0"><p class="fs-1 text-uppercase">'+data.metaTitle+'</p></div>');
            } else {
                $('#metadataDiv .loader').after('<div id="metaTitle" class="row"><div class="col-md-10 pr-0"><p class="fs-1 text-uppercase">'+data.metaTitle+'</p></div></div>');
            } */

            if (data.metaTitle != '') {
              html += '<h3>' + data.metaTitle + '</h3><ul id="metadata_icons" class="list-button d-print-none">' + data.metadata_icons + '</ul>';
            }

            html += '<div id="metaDiv"><ul id="metaDiv" class="crimnal-list">' + data.metaVal + '</ul></div>';
            jQuery('.border-non-bx').html(html);
            jQuery('.indicator-name').text(data.metaTitle || '');
            a2a.init('page');
            $('.metahtml.panelBx .loader').addClass('hidden');
          }
        });
      });
      jQuery('.selCl select').on('change', function (event) {
        event.preventDefault();

        var classification = this.value;
        var indList = '';
        var html = '';
        var langCode = drupalSettings.path.currentLanguage;

        jQuery.ajax({
          url: Drupal.url('metadata-ajax', {
            'language': langCode
          }),
          type: 'post',
          dataType: "json",
          cache: false,
          data: {
            "action": "getMetadataByIcgid",
            'classification': classification,
            'url': window.location.pathname
          },
          beforeSend: function () {
            jQuery('.metahtml.panelBx .loader').removeClass('hidden');
            jQuery('.border-non-bx').html('');
          },
          success: function (data) {
            //console.log(data);
            if (data.noData != '') {
              indList += data.noData;
            } else {
              var i = 0;
              jQuery.each(data.indicator_list, function (index, value) {
                var trimmedName = value.iName.length > 10000 ? value.iName.substring(0, 10000) + '...' : value.iName; // Trim the value of iName to 50 characters
                indList += '<option value="' + value.iGid + '" ' + ((i == 0) ? 'selected="selected"' : '') + '>' + trimmedName + '</option>';

                i++;
              });
            }

            if (data.metaTitle != '') {
              html += '<h3>' + data.metaTitle + '</h3><ul id="metadata_icons" class="list-button d-print-none">' + data.metadata_icons + '</ul>';
            }

            html += '<div id="metaDiv"><ul id="metaDiv" class="crimnal-list">' + data.metaVal + '</ul></div>';

            /* if(jQuery('#metaTitle').length) {
                jQuery('#metaTitle').html('<div class="col-md-10 pr-0"><p class="fs-1 text-uppercase">'+data.metaTitle+'</p></div>');
            } else {
                jQuery('#metadataDiv .loader').after('<div id="metaTitle" class="row"><div class="col-md-10 pr-0"><p class="fs-1 text-uppercase">'+data.metaTitle+'</p></div></div>');
            } */

            jQuery(".selIndicator .wide").html(indList);
            //jQuery('.selIndicator select').niceSelect('update');
            jQuery('.border-non-bx').html(html);
            jQuery('.indicator-category').html('<span>' + jQuery('.selCl select option:selected').text() + '</span>');
            jQuery('.indicator-name').text(data.metaTitle || '');
            a2a.init('page');
            jQuery('.metahtml.panelBx .loader').addClass('hidden');
          }
        });
      });

      jQuery("#metadata_input").autocomplete({
        source: function (request, response) {
          console.log('yes');
          var langCode = drupalSettings.path.currentLanguage;

          jQuery.ajax({
            url: Drupal.url('metadata-ajax', {
              'language': langCode
            }),
            type: 'post',
            dataType: "json",
            cache: false,
            data: {
              "action": "searchIndicator",
              'indicator': request.term
            },
            success: function (data) {
              response(data);
            }
          });
        },
        select: function (event, ui) {
          jQuery('#metadata_input').val(ui.item.label); // display the selected text
          jQuery('#metadata_input').data('indgid', ui.item.value);
          return false;
        },
        focus: function (event, ui) {
          jQuery("#metadata_input").val(ui.item.label);
          return false;
        },
      });

      /** 
       * Send to metadata page on click (single language - no prefix)
      */
      jQuery('.search-bx .searchBtn', context).on('click', function () {
        var indgid = $("#metadata_input").data("indgid");
        if (indgid != '' && indgid != undefined) {
          window.location.replace(window.location.origin + "/metadata/indcl/" + indgid);
        } else {
          jQuery('#metadata_input').focus();
        }
      });

      /** 
       * Send to metadata page on classification selection (single language - no prefix)
      */
      jQuery('#ctypeSearch', context).on('click', function () {
        var cType = jQuery('.radiobx input[name="radio"]:checked').val();
        window.location.replace(window.location.origin + "/metadata/ctype/" + cType);
      });

      jQuery('.non-crimnal-bx', context).on('click', '.shareIcons', function () {
        jQuery('.socialmedia').toggleClass('active');
      });


      /**
       * For Metadata Accordion (delegated so one handler, works after AJAX)
       */
      jQuery('.border-non-bx', context).off('click.metadataAccordion', '.crimnal-list .list-data strong').on('click.metadataAccordion', '.crimnal-list .list-data strong', function () {
        var currentContainer = jQuery(this).siblings(".list-data-container");
        var currentLi = jQuery(this).closest("li");
        var isOpen = currentLi.hasClass("card-highlight");

        if (isOpen) {
          currentContainer.slideUp();
          currentLi.removeClass("card-static card-highlight");
        } else {
          jQuery(".list-data-container").not(currentContainer).slideUp();
          currentContainer.stop(true, true).slideDown();
          jQuery(".crimnal-list li").removeClass("card-static card-highlight");
          currentLi.addClass("card-static card-highlight");
        }
      });


      /**
       * For Selection of radio button on metadata page
       */
      document.addEventListener("DOMContentLoaded", function () {
        const seeBtn = document.getElementById('ctypeSearch');
        const radioSector = document.getElementById('radio-1');
        const radioObjective = document.getElementById('radio-2');

        // Set radio selection based on URL path
        const path = window.location.pathname;
        if (path.includes('/ctype/gl')) {
          radioObjective.checked = true;
        } else if (path.includes('/ctype/sc')) {
          radioSector.checked = true;
        }

      });


      /**
       * Get metadata on indicator selection
       */

      /**
       * Print metadata - same layout and styling as download metadata PDF
       */
      jQuery('.border-non-bx', context).on('click', '#print_metadata', function () {
        var disp_setting = "toolbar=yes,location=no,";
        disp_setting += "directories=yes,menubar=yes,";
        disp_setting += "scrollbars=yes,width=800, height=800, left=100, top=25";

        var baseUrl = (typeof drupalSettings !== 'undefined' && drupalSettings.path && drupalSettings.path.baseUrl) ? drupalSettings.path.baseUrl : '/';
        baseUrl = baseUrl.endsWith('/') ? baseUrl : (baseUrl + '/');

        // Use a single explicit logo path for metadata print output (size matches PDF download).
        var printLogoWidth = 140;
        var logoUrl = window.location.origin + baseUrl + 'themes/custom/guinea/guinea_logo.png';
        var titleText = jQuery('#border-non-bx h3').text() || '';
        var metaTitleHtml = '<div id="metaTitle" class="row">' +
          '<p style="font-size: 30px; font-weight: 600; color: #3A7D33; padding: 0; margin: 14px 0; font-family: sans-serif;">' + titleText + '</p></div>';
        var metaContent = document.getElementById('metaDiv') ? document.getElementById('metaDiv').innerHTML : '';
        var siteUrl = window.location.origin + baseUrl;

        var content_vlue = '<div class="logo" style="display:flex;align-items:center;width:100%;margin-bottom:0;"><div style="flex:0 0 ' + printLogoWidth + 'px;"><img id="print-logo" src="' + logoUrl + '" width="' + printLogoWidth + '" style="max-width:' + printLogoWidth + 'px;height:auto;" alt=""></div><div style="flex:1;text-align:center;"><span style="font-size:28px;font-weight:600;color:#3A7D33;font-family:sans-serif;letter-spacing:0.05em;">METADATA</span></div><div style="flex:0 0 ' + printLogoWidth + 'px;"></div></div>' + metaTitleHtml + '<div id="metadata" class="scrollDiv">' + metaContent + '</div><div class="site-url-footer">' + siteUrl + '</div>';

        var docprint = window.open("", "", disp_setting);
        docprint.document.open();
        docprint.document.write('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"');
        docprint.document.write('"https://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">');
        docprint.document.write('<html xmlns="https://www.w3.org/1999/xhtml" xml:lang="en">');
        docprint.document.write('<head><title>' + (titleText || 'Metadata') + '</title>');
        docprint.document.write('<style type="text/css">');
        docprint.document.write('body{ margin:0; padding: 25px 32px; font-family: sans-serif; font-size: 12px; color: #000;}');
        docprint.document.write('.logo{ margin-bottom: 0;}');
        docprint.document.write('#print-logo{ max-width: ' + printLogoWidth + 'px; height: auto; display: block;}');
        docprint.document.write('#metaTitle p{ font-size: 30px; font-weight: 600; color: #3A7D33; padding: 0; margin: 14px 0;}');
        docprint.document.write('#metadata .list-data{ margin: 0 0 10px 0;}');
        docprint.document.write('#metadata .list-data > strong{ display: block; font-size: 24px; font-weight: 600; color: #3A7D33; padding: 0; margin: 0 0 0 0; font-family: sans-serif;}');
        docprint.document.write('#metadata .list-data-container{ font-size: 16px; margin: 0 0 6px 0; font-family: sans-serif; color: #000;}');
        docprint.document.write('#metadata .list-data-container *{ color: #000;}');
        docprint.document.write('a{ color:#000; text-decoration:none;}');
        docprint.document.write('ul.crimnal-list{ list-style:none; padding:0; margin:0;}');
        docprint.document.write('.site-url-footer{ margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 12px; color: #666;}');
        docprint.document.write('</style>');
        docprint.document.write('</head><body>');
        docprint.document.write(content_vlue);
        docprint.document.write('<script>(function(){ var img = document.getElementById("print-logo"); function doPrint(){ window.print(); } if (img && img.complete) doPrint(); else if (img) img.onload = doPrint; else doPrint(); })();<\/script>');
        docprint.document.write('</body></html>');
        docprint.document.close();
        docprint.focus();
      });
    }
  };
})(jQuery, Drupal, drupalSettings);
