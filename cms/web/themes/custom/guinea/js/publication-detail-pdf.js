/**
 * @file
 * PDF export from the publication card using html2pdf.js (save + preview).
 */
(function (Drupal) {
  'use strict';

  function sanitizeFilename(name) {
    var base = (name || 'publication').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'publication';
  }

  function getPrintableClone() {
    var card = document.querySelector('.publication-detail-card');
    if (!card) {
      return null;
    }
    var clone = card.cloneNode(true);
    clone.querySelectorAll('.publication-detail-actions, .publication-detail-share').forEach(function (el) {
      el.remove();
    });
    clone.classList.add('publication-detail-card--pdf-export');
    return clone;
  }

  function waitForImages(root) {
    var imgs = root.querySelectorAll('img');
    if (!imgs.length) {
      return Promise.resolve();
    }
    return Promise.all(
      Array.prototype.map.call(imgs, function (img) {
        if (img.complete && img.naturalWidth > 0) {
          return Promise.resolve();
        }
        return new Promise(function (resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          window.setTimeout(resolve, 8000);
        });
      })
    );
  }

  /**
   * @param {string} filename
   * @param {boolean} [isPreview] Slightly faster settings for "Voir" (open in tab).
   */
  function getPdfOptions(filename, isPreview) {
    var scale = isPreview ? 1.2 : 1.5;
    var jpegQuality = isPreview ? 0.85 : 0.92;
    return {
      margin: [12, 12, 12, 12],
      filename: filename + '.pdf',
      image: { type: 'jpeg', quality: jpegQuality },
      html2canvas: {
        scale: scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };
  }

  /**
   * Lets layout/fonts settle before html2canvas runs (avoids blank captures).
   *
   * @param {number} [delayMs]
   * @returns {Promise<void>}
   */
  function nextPaint(delayMs) {
    var d = typeof delayMs === 'number' ? delayMs : 100;
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          window.setTimeout(resolve, d);
        });
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var PUBLICATION_PAGE_LOADER_ID = 'guinea-publication-pdf-page-loader';

  /**
   * Full-page loader on the current site while "Voir" PDF is generated (main window).
   */
  function showPublicationPageLoader() {
    hidePublicationPageLoader();
    var el = document.createElement('div');
    el.id = PUBLICATION_PAGE_LOADER_ID;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-busy', 'true');
    el.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'background:rgba(255,255,255,0.94)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:1rem',
      'padding:1.5rem',
      'box-sizing:border-box',
    ].join(';');

    var keyframes = document.createElement('style');
    keyframes.textContent =
      '@keyframes guineaPublicationPdfSpin{to{transform:rotate(360deg)}}';

    var spinner = document.createElement('div');
    spinner.setAttribute('aria-hidden', 'true');
    spinner.style.cssText = [
      'width:52px',
      'height:52px',
      'border:4px solid #e5e7eb',
      'border-top-color:#2d6a4f',
      'border-radius:50%',
      'animation:guineaPublicationPdfSpin 0.8s linear infinite',
    ].join(';');

    var title = document.createElement('p');
    title.style.cssText = [
      'margin:0',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:1.125rem',
      'font-weight:600',
      'color:#1f2937',
      'text-align:center',
      'max-width:22rem',
    ].join(';');
    title.textContent = Drupal.t('Generating PDF…');

    var sub = document.createElement('p');
    sub.style.cssText = [
      'margin:0',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:0.9375rem',
      'color:#6b7280',
      'text-align:center',
      'max-width:26rem',
      'line-height:1.5',
    ].join(';');
    sub.textContent = Drupal.t('Please wait. The PDF will appear in the other tab when it is ready.');

    el.appendChild(keyframes);
    el.appendChild(spinner);
    el.appendChild(title);
    el.appendChild(sub);
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
  }

  function hidePublicationPageLoader() {
    var el = document.getElementById(PUBLICATION_PAGE_LOADER_ID);
    if (el) {
      el.remove();
    }
    document.body.style.overflow = '';
  }

  /**
   * Shows a loading UI in the preview tab immediately (avoids a confusing blank page).
   *
   * @param {Window} win
   */
  function showPdfLoadingInWindow(win) {
    if (!win || win.closed) {
      return;
    }
    try {
      var doc = win.document;
      var title = escapeHtml(Drupal.t('Generating PDF'));
      var body = escapeHtml(Drupal.t('Please wait, this may take a few seconds.'));
      var hint = escapeHtml(Drupal.t('Do not close this tab.'));
      doc.open();
      doc.write(
        '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>' +
          title +
          '</title><style>' +
          'body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;' +
          'min-height:100vh;margin:0;background:#f0f2f1;color:#2c2c2c;}' +
          '.wrap{text-align:center;padding:2rem 1.5rem;max-width:24rem;}' +
          '.spinner{width:44px;height:44px;border:3px solid #ddd;border-top-color:#2d6a4f;border-radius:50%;' +
          'animation:spin 0.75s linear infinite;margin:0 auto 1.25rem;}' +
          '@keyframes spin{to{transform:rotate(360deg)}}' +
          'h1{font-size:1.125rem;font-weight:600;margin:0 0 0.5rem;}' +
          'p{margin:0;font-size:0.9375rem;line-height:1.5;color:#555;}' +
          '.muted{font-size:0.8125rem;color:#888;margin-top:0.75rem;}' +
          '</style></head><body><div class="wrap" role="status" aria-live="polite">' +
          '<div class="spinner" aria-hidden="true"></div>' +
          '<h1>' +
          title +
          '</h1>' +
          '<p>' +
          body +
          '</p>' +
          '<p class="muted">' +
          hint +
          '</p>' +
          '</div></body></html>'
      );
      doc.close();
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Writes PDF bytes into a tab opened synchronously (keeps user activation; works on repeat clicks).
   *
   * @param {object} pdf jsPDF instance
   * @param {Window} targetWin from window.open('about:blank') in the same click handler
   * @returns {Promise<void>}
   */
  function writePdfToPreviewWindow(pdf, targetWin) {
    if (!pdf || typeof pdf.output !== 'function') {
      return Promise.reject(new Error('Invalid PDF document from html2pdf.'));
    }
    if (!targetWin || targetWin.closed) {
      return Promise.reject(new Error('Preview window was closed.'));
    }

    function failPreview(message) {
      try {
        if (targetWin && !targetWin.closed) {
          targetWin.document.open();
          targetWin.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>PDF</title></head><body><p>' +
              String(message) +
              '</p></body></html>'
          );
          targetWin.document.close();
        }
      } catch (e) {
        try {
          targetWin.close();
        } catch (e2) {}
      }
    }

    var ab;
    try {
      ab = pdf.output('arraybuffer');
    } catch (e) {
      ab = null;
    }

    return Promise.resolve(ab).then(function (buf) {
      if (buf && typeof buf.then === 'function') {
        return buf.then(function (b) {
          return assignPdfToWindow(b);
        });
      }
      return assignPdfToWindow(buf);
    });

    function assignPdfToWindow(bytes) {
      if (bytes && bytes.byteLength > 0) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        try {
          targetWin.location.href = url;
        } catch (e) {
          URL.revokeObjectURL(url);
          failPreview(Drupal.t('Could not display the PDF in the preview tab.'));
          return Promise.reject(e);
        }
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 120000);
        return Promise.resolve();
      }
      try {
        var u8 = pdf.output('uint8array');
        if (u8 && u8.length) {
          var blob2 = new Blob([u8], { type: 'application/pdf' });
          var url2 = URL.createObjectURL(blob2);
          targetWin.location.href = url2;
          window.setTimeout(function () {
            URL.revokeObjectURL(url2);
          }, 120000);
          return Promise.resolve();
        }
      } catch (e2) {}
      try {
        var dataUri = pdf.output('datauristring');
        if (typeof dataUri === 'string' && dataUri.indexOf('data:') === 0) {
          targetWin.location.href = dataUri;
          return Promise.resolve();
        }
      } catch (e3) {}
      failPreview(Drupal.t('Could not read PDF data for preview.'));
      return Promise.reject(new Error('Could not read PDF bytes from jsPDF.'));
    }
  }

  /**
   * Removes leftover nodes from a previous html2pdf run (can block the next export).
   */
  function cleanupStalePdfDom() {
    document.querySelectorAll('.html2pdf__overlay, .html2pdf__container').forEach(function (el) {
      try {
        el.remove();
      } catch (e) {}
    });
    document.querySelectorAll('.publication-html2pdf-wrapper').forEach(function (el) {
      try {
        el.remove();
      } catch (e2) {}
    });
  }

  function formatPdfError(err) {
    if (!err) {
      return '';
    }
    var msg = err.message || String(err);
    if (/taint|security|cross-origin|canvas/i.test(msg)) {
      return (
        Drupal.t('PDF export failed because of images loaded from another domain. Try again after the images have fully loaded, or use images hosted on this site.') +
        ' (' +
        msg +
        ')'
      );
    }
    return msg;
  }

  /**
   * @param {function(): void | Promise<void>} action
   * @param {string} filename
   * @param {boolean} [isPreview] Faster PDF options + shorter layout delay for preview.
   * @returns {Promise<void>}
   */
  function runExportAction(action, filename, isPreview) {
    cleanupStalePdfDom();

    var clone = getPrintableClone();
    if (!clone) {
      return Promise.reject(new Error('Publication card not found'));
    }

    var card = document.querySelector('.publication-detail-card');
    var approxHeight = card ? Math.ceil(card.getBoundingClientRect().height) : 800;

    var wrapper = document.createElement('div');
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.className = 'publication-html2pdf-wrapper';
    wrapper.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:210mm',
      'max-width:100vw',
      'min-height:' + Math.max(approxHeight, 400) + 'px',
      'z-index:-1',
      'opacity:1',
      'pointer-events:none',
      'overflow:visible',
      'background:#fff',
      'box-sizing:border-box',
    ].join(';');

    clone.style.position = 'relative';
    clone.style.left = 'auto';
    clone.style.top = 'auto';
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';
    clone.style.background = '#fff';

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    var opt = getPdfOptions(filename, !!isPreview);

    function cleanup() {
      if (wrapper.parentNode) {
        wrapper.remove();
      }
    }

    return waitForImages(clone)
      .then(function () {
        return nextPaint(isPreview ? 50 : 120);
      })
      .then(function () {
        return action(clone, opt);
      })
      .then(
        function () {
          cleanup();
        },
        function (err) {
          cleanup();
          throw err;
        }
      );
  }

  Drupal.behaviors.guineaPublicationDetailPdf = {
    attach: function (context, settings) {
      var wraps = context.querySelectorAll('.publication-detail-pdf-actions');
      wraps.forEach(function (wrap) {
        if (wrap.dataset.pdfBound === '1') {
          return;
        }
        wrap.dataset.pdfBound = '1';

        var cfg = settings.guinea || {};
        var filename = sanitizeFilename(cfg.publicationPdfFilename);

        var btnDownload = wrap.querySelector('[data-publication-pdf-action="download"]');
        var btnOpen = wrap.querySelector('[data-publication-pdf-action="open"]');

        function setBusy(busy) {
          [btnDownload, btnOpen].forEach(function (b) {
            if (b) {
              b.disabled = busy;
              b.setAttribute('aria-busy', busy ? 'true' : 'false');
            }
          });
        }

        function alertFailure(err) {
          console.error('[publication-detail-pdf]', err);
          var detail = formatPdfError(err);
          window.alert(
            detail
              ? Drupal.t('Could not generate the PDF.') + '\n\n' + detail
              : Drupal.t('Could not generate the PDF. Please try again.')
          );
        }

        if (btnDownload) {
          btnDownload.addEventListener('click', function () {
            if (typeof html2pdf === 'undefined') {
              alertFailure(new Error('html2pdf is not loaded.'));
              return;
            }
            setBusy(true);
            runExportAction(function (clone, opt) {
              return new Promise(function (resolve, reject) {
                html2pdf()
                  .set(opt)
                  .from(clone)
                  .save()
                  .thenExternal(resolve)
                  .catchExternal(reject);
              });
            }, filename, false)
              .catch(alertFailure)
              .finally(function () {
                setBusy(false);
              });
          });
        }

        if (btnOpen) {
          btnOpen.addEventListener('click', function () {
            if (typeof html2pdf === 'undefined') {
              alertFailure(new Error('html2pdf is not loaded.'));
              return;
            }
            showPublicationPageLoader();
            // Do not pass noopener/noreferrer here: with those flags many browsers return null
            // (no Window handle), which breaks preview and looks like "popup blocked".
            var previewWin = window.open('about:blank', '_blank');
            if (!previewWin) {
              hidePublicationPageLoader();
              alertFailure(new Error('Popup blocked — allow pop-ups for this site to preview the PDF.'));
              return;
            }
            showPdfLoadingInWindow(previewWin);
            setBusy(true);
            var safetyRelease = window.setTimeout(function () {
              setBusy(false);
              hidePublicationPageLoader();
            }, 120000);
            runExportAction(function (clone, opt) {
              return new Promise(function (resolve, reject) {
                html2pdf()
                  .set(opt)
                  .from(clone)
                  .toPdf()
                  .get('pdf')
                  .thenExternal(function (pdf) {
                    writePdfToPreviewWindow(pdf, previewWin).then(resolve).catch(reject);
                  })
                  .catchExternal(reject);
              });
            }, filename, true)
              .catch(alertFailure)
              .finally(function () {
                window.clearTimeout(safetyRelease);
                hidePublicationPageLoader();
                setBusy(false);
              });
          });
        }
      });
    },
  };
})(Drupal);
