/*
=====================================
##----- Load Dashboard Libraries
=====================================
*/

var load = (function () {
	function _load(tag) {
		return function (url) {
			// This promise will be used by Promise. all to determine success or failure
			return new Promise(function (resolve, reject) {
				var element = document.createElement(tag);
				var parent = 'dfa-dashboard-container';
				var attr = 'src';

				// Important success and error for the promise
				element.onload = function () {
					resolve(url);
				};
				element.onerror = function () {
					reject(url);
				};

				// Need to set different attributes depending on tag type
				switch (tag) {
					case 'script':
						element.type = 'text/javascript';
						element.async = false;
					break;
					case 'link':
						element.type = 'text/css';
						element.rel = 'stylesheet';
						attr = 'href';
						// parent = 'head';
					break;
				}

				// Inject into document to kick off loading
				element[attr] = url;
				insertAfter(element, document.getElementsByClassName(parent)[0]);
			});
		};
	}
	return {
		css: _load('link'),
		js: _load('script'),
		img: _load('img')
	}
})();

function insertAfter(newNode, referenceNode) {
	referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

(function ($) {
	Promise.all([

		load.css(appComponentUrl + '../../../css/component/component.progressloader.css?ver=' + version),
		load.css(appComponentUrl + '/common/css/dfa-viz-responsive.css?ver=' + version),
		load.css(appComponentUrl + '/common/css/dfa-viz-style.css?ver=' + version),
		load.css(appComponentUrl + '/shared/icomoon/style.css?ver=' + version),
		load.css(appComponentUrl + '/shared/bootstrap-4.1.3/css/dfa-viz-bootstrap.css?ver=' + version),

		load.js(appComponentUrl + '/shared/highcharts/v7.1.2/highcharts.js?ver=' + version),
		load.js(appComponentUrl + '/shared/highcharts/v7.1.2/map.js?ver=' + version),
		load.js(appComponentUrl + '/shared/highcharts/v7.1.2/sunburst.js?ver=' + version),
		load.js(appComponentUrl + '/shared/highcharts/v7.1.2/sankey.js?ver=' + version),
		load.js(appComponentUrl + '/shared/dom-image/dom-to-image.min.js?ver=' + version),

		load.js(appComponentUrl + '/shared/d3charts/d3.v4.min.js?ver=' + version),

		load.js(appComponentUrl + '/main/config.js?ver=' + version),
		load.js(appComponentUrl + '/common/js/common.js?ver=' + version),
		load.js(appComponentUrl + '/common/js/external-filters.js?ver=' + version),
		load.js(appComponentUrl + '/common/js/visuals.js?ver=' + version),

		load.js(appComponentUrl + '/app/summary_indctr/summary_indctr.js?ver=' + version),
		load.js(appComponentUrl + '/app/summary_financial/summary_financial.js?ver=' + version),
		load.js(appComponentUrl + '/app/indctr_qltv_plnd_actl/indctr_qltv_plnd_actl.js?ver=' + version),
		load.js(appComponentUrl + '/app/bdgt_utlzn_rate_cbf/bdgt_utlzn_rate_cbf.js?ver=' + version),
		load.js(appComponentUrl + '/app/sts_by_tag_frmwrk/sts_by_tag_frmwrk.js?ver=' + version),
		load.js(appComponentUrl + '/app/indctr_accrdn_plnd_actl/indctr_accrdn_plnd_actl.js?ver=' + version),
		load.js(appComponentUrl + '/app/financial_indctr/financial_indctr.js?ver=' + version),
		load.js(appComponentUrl + '/app/data_manager/data_manager.js?ver=' + version),
		load.js(appComponentUrl + '/app/data_manager_pyramid/data_manager_pyramid.js?ver=' + version),
		load.js(appComponentUrl + '/app/sankey_chart/sankey_chart.js?ver=' + version)

	]).then(function () {

		$(document).ready(function() {
			var $containerElement = $('body').find("[data-id=dfa-db-container]");
			var callType = $containerElement.attr('data-call');
			var callArea = $containerElement.attr('data-area');
			setTimeout(function(){
				dfa.viz.init(callType, callArea);
			}, 0);
		});

	}).catch(function (e) {
		console.log('Not able to load dashboard libraries')
	});

}(jQuery));