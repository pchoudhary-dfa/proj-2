<?php

/**
 * @file
 * Contains \Drupal\custom_settings\Controller\Metadata.
 */

namespace Drupal\custom_settings\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\metadata_api\Controller\MetaDataAPI;
use Symfony\Component\HttpFoundation\JsonResponse;
use Drupal\taxonomy\Entity\Term;
use Drupal\Core\Asset\AssetUrlGeneratorInterface;
use Drupal\Core\StreamWrapper\StreamWrapperManagerInterface;
use Drupal\Core\Language\LanguageManagerInterface;
use Drupal\Component\Utility\Html;
use Mpdf\Mpdf;

class Metadata extends ControllerBase
{
    /**
     * SDG Classification type based functionalities here
     */
    public function sdgMetadata($sdg)
    {
        global $base_url;

        $data = MetaDataAPI::getClassificationType('GL');

        if (isset($data['error']) && !empty($data['error'])) {
            return [
                '#theme' => 'metadata-indcl',
                '#indicators' => '',
                '#metadata' => '',
                '#error' => $data['error'],
            ];
        } else {
            if (!empty($data)) {
                $indicator_list = MetaDataAPI::searchIndicatorByIcGid($sdg);
                $selected_indicator = (!empty($indicator_list) ? $indicator_list[0]['iGid'] : '');
                $indicators['selected_indicator'] = $selected_indicator;
                $indicators['selected_classification'] = $sdg;
                $indicators['list'] = $indicator_list;
                $indicators['classification'] = $data;
                $metadatas = (($selected_indicator != "") ? MetaDataAPI::getMetadata($selected_indicator) : '');
                $metaIndText = '';

                if (!empty($metadatas['metaData'])) {
                    $metaIndText .= $indicator_list[0]['iName'];

                    foreach ($metadatas['metaData'] as $meta_val) {
                        $meta_data[] = array(
                            'category' => $meta_val['categoryName'],
                            'description' => html_entity_decode($meta_val['metaDescription'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                        );
                    }
                }

                $metadata_array['data'] = isset($meta_data) ? $meta_data : '';
                $metadata_array['indicator_text'] = $metaIndText;

                $addtoany_data = addtoany_create_data($base_url . '/metadata/sdg/' . $sdg, $indicator_list[0]['iName']);
                $share_html = [];
                $content = '';

                $share_html = [
                    '#addtoany_html' => \Drupal::token()->replace($addtoany_data['addtoany_html'], ['node' => $content]),
                    '#link_url' => $addtoany_data['link_url'],
                    '#link_title' => $indicator_list[0]['iName'],
                    '#button_setting' => $addtoany_data['button_setting'],
                    '#button_image' => $addtoany_data['button_image'],
                    '#universal_button_placement' => $addtoany_data['universal_button_placement'],
                    '#buttons_size' => $addtoany_data['buttons_size'],
                    '#theme' => 'addtoany_standard',
                    '#cache' => [
                        'contexts' => ['url'],
                    ],
                ];

                $metadata_array['share'] = $share_html;

                return [
                    '#theme' => 'metadata-indcl',
                    '#indicators' => $indicators,
                    '#metadata' => $metadata_array,
                    '#error' => '',
                ];
            } else {
                throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
            }
        }
    }

    /**
     * Indicator or Classification type based functionalities here
     */
    public function indCL($indcl)
    {
        global $base_url;

        $data = MetaDataAPI::searchIndicatorByiGid($indcl);

        if (!empty($data)) {
            $indicators['selected_indicator'] = $indcl;
            $indicators['selected_classification'] = $data['icInfo']['icGid'] ?? null;
            $indicators['list'] = MetaDataAPI::getIndicatorsList($data['icInfo']['icGid'] ?? '');
            $classification = MetaDataAPI::getClassificationType('SC');
            $indicators['classification'] = $classification['ic'];
            $metadatas = MetaDataAPI::getMetadata($indcl);
            $metaIndText = '';

            if (!empty($metadatas['metaData'])) {
                $metaIndText .= $data['iName'];

                foreach ($metadatas['metaData'] as $meta_val) {
                    $meta_data[] = array(
                        'category' => $meta_val['categoryName'],
                        'description' => html_entity_decode($meta_val['metaDescription'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                    );
                }
            }

            $metadata_array['data'] = isset($meta_data) ? $meta_data : '';
            $metadata_array['indicator_text'] = $metaIndText;

            $addtoany_data = addtoany_create_data($base_url . '/metadata/indcl/' . $indcl, $data['iName']);
            $share_html = [];
            $content = '';

            $share_html = [
                '#addtoany_html' => \Drupal::token()->replace($addtoany_data['addtoany_html'], ['node' => $content]),
                '#link_url' => $addtoany_data['link_url'],
                '#link_title' => $data['iName'],
                '#button_setting' => $addtoany_data['button_setting'],
                '#button_image' => $addtoany_data['button_image'],
                '#universal_button_placement' => $addtoany_data['universal_button_placement'],
                '#buttons_size' => $addtoany_data['buttons_size'],
                '#theme' => 'addtoany_standard',
                '#cache' => [
                    'contexts' => ['url'],
                ],
            ];

            $metadata_array['share'] = $share_html;

            return [
                '#theme' => 'metadata-indcl',
                '#indicators' => $indicators,
                '#metadata' => $metadata_array,
            ];
        } else {
            throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
        }
    }

    /**
     * Classification type based functionalities here
     */
    public function cType($ctype)
    {
        global $base_url;
        $data = MetaDataAPI::getClassificationType($ctype);
        $share_html = [];
        $content = '';

        if (isset($data['error']) && !empty($data['error'])) {
            return [
                '#theme' => 'metadata-indcl',
                '#indicators' => '',
                '#metadata' => '',
                '#error' => $data['error'],
            ];
        } else {
            if (!empty($data)) {
                $indicator_list = MetaDataAPI::searchIndicatorByIcGid($data['ic'][0]['gid']);
                if (isset($indicator_list['data']['error']) && $indicator_list['data']['error'] != '') {
                    $selected_indicator = '';
                } else {
                    if (isset($indicator_list['indicator']) && !empty($indicator_list['indicator'])) {
                        $selected_indicator = $indicator_list['indicator'][0]['iGid'];
                    } else {
                        $selected_indicator = '';
                    }
                }
                $indicators['selected_indicator'] = $selected_indicator;
                $indicators['selected_classification'] = $data['ic'][0]['gid'];
                $indicators['list'] = ((isset($indicator_list['indicator']) && !empty($indicator_list['indicator'])) ? $indicator_list['indicator'] : '');
                $indicators['classification'] = $data['ic'];
                $metadatas = (($selected_indicator != "") ? MetaDataAPI::getMetadata($selected_indicator) : '');
                $metaIndText = '';

                $indicator_gid = isset($indicator_list['indicator'][0]['iGid']) ? $indicator_list['indicator'][0]['iGid'] : '';
                $indicator_name = isset($indicator_list['indicator'][0]['iName']) ? $indicator_list['indicator'][0]['iName'] : '';

                if (!empty($metadatas['metaData'])) {
                    $metaIndText .= $indicator_name;

                    foreach ($metadatas['metaData'] as $meta_val) {
                        $meta_data[] = array(
                            'category' => $meta_val['categoryName'],
                            'description' => html_entity_decode($meta_val['metaDescription'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                        );
                    }

                    $addtoany_data = addtoany_create_data($base_url . '/metadata/indcl/' . $indicator_gid, $indicator_name);

                    $share_html = [
                        '#addtoany_html' => \Drupal::token()->replace($addtoany_data['addtoany_html'], ['node' => $content]),
                        '#link_url' => $addtoany_data['link_url'],
                        '#link_title' => $indicator_list['indicator'][0]['iName'],
                        '#button_setting' => $addtoany_data['button_setting'],
                        '#button_image' => $addtoany_data['button_image'],
                        '#universal_button_placement' => $addtoany_data['universal_button_placement'],
                        '#buttons_size' => $addtoany_data['buttons_size'],
                        '#theme' => 'addtoany_standard',
                        '#cache' => [
                            'contexts' => ['url'],
                        ],
                    ];

                    $metadata_array['share'] = $share_html;
                }

                $metadata_array['data'] = isset($meta_data) ? $meta_data : '';
                $metadata_array['indicator_text'] = $metaIndText;

                return [
                    '#theme' => 'metadata-indcl',
                    '#indicators' => $indicators,
                    '#metadata' => $metadata_array,
                    '#error' => '',
                ];
            } else {
                throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
            }
        }
    }

    /**
     * Metadata ajax functionalities starts here
     */
    public function metaDataAjax()
    {
        global $base_url;
        $action = \Drupal::request()->request->get('action');
        $metaTitle = '';
        $metadata_icons = '';
        $metaVal = '';
        $share_html = [];
        $content = '';

        // Get the base site URL
        $site_url = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';

        /**
         * Search indicator by keyword
         */
        if ($action == 'searchIndicator') {
            $indicator = \Drupal::request()->request->get('indicator');
            $indicators = [];

            $data = MetaDataAPI::searchIndicatorByKeyword($indicator);

            if (isset($data['error']) && !empty($data['error'])) {
                $indicators = $data['error'];
            } else {
                if (!empty($data['indicator'])) {
                    foreach ($data['indicator'] as $indicator) {
                        $indicators[] = ["value" => $indicator['iGid'], "label" => $indicator['iName']];
                    }
                } else {
                    $indicators = 'No Data Found';
                }
            }

            return new JsonResponse($indicators);
        }

        /**
         * Get Indicator list by classification gid
         */
        if ($action == 'getMetadataByIcgid') {
            $classification = \Drupal::request()->request->get('classification');
            $url = \Drupal::request()->request->get('url');
            $indicator_list = MetaDataAPI::searchIndicatorByIcGid($classification);

            $url = explode('/', $url);
            if ($url[2] == 'ctype') {
                $uri = $url[3];

                if ($url[3] == 'sc') {
                    $uri = 'indcl';
                } else {
                    $uri = 'sdg';
                }
            } else {
                $uri = $url[2];
            }

            if (isset($indicator_list['indicator']) && !empty($indicator_list['indicator'])) {
                $metadatas = MetaDataAPI::getMetadata($indicator_list['indicator'][0]['iGid']);

                if (!empty($metadatas['metaData'])) {
                    $addtoany_data = addtoany_create_data($base_url . '/metadata/' . $uri . '/' . $indicator_list['indicator'][0]['iGid'], $indicator_list['indicator'][0]['iName']);

                    $share_html = [
                        '#addtoany_html' => \Drupal::token()->replace($addtoany_data['addtoany_html'], ['node' => $content]),
                        '#link_url' => $addtoany_data['link_url'],
                        '#link_title' => $indicator_list['indicator'][0]['iName'],
                        '#button_setting' => $addtoany_data['button_setting'],
                        '#button_image' => $addtoany_data['button_image'],
                        '#universal_button_placement' => $addtoany_data['universal_button_placement'],
                        '#buttons_size' => $addtoany_data['buttons_size'],
                        '#theme' => 'addtoany_standard',
                        '#cache' => ['contexts' => ['url']],
                    ];

                    $render_html = \Drupal::service('renderer');
                    $share = $render_html->renderPlain($share_html);

                    // ✅ Fix: Clean and correct download URL
                    $download_url = $site_url . "/download-metadata/" . $indicator_list['indicator'][0]['iGid'];


                    $metadata_icons .= '<li>
                    <a href="' . $download_url . '">
                        <i class="fas fa-download"></i>
                        <span>Télécharger</span>
                    </a>
                </li>
                <li class="share">
                    <a class="shareIcons" href="javascript:void(0);">
                        <i class="fas fa-share-nodes"></i>
                        <span>Partager</span>
                    </a>
                    <div class="socialmedia">
                        <div class="mediaContainer">' . $share . '</div>
                    </div>
                </li>
                <li>
                    <a href="javascript:void(0);" id="print_metadata">
                        <i class="fas fa-print"></i>
                        <span>Imprimer</span>
                    </a>
                </li>';

                    foreach ($metadatas['metaData'] as $meta_val) {
                        $metaVal .= '<li>
                                    <div class="list-data">
                                        <strong>' . htmlspecialchars($meta_val['categoryName']) . '</strong>
                                        <div class="list-data-container"><p>' . $meta_val['metaDescription'] . '</p></div>
                                    </div>
                                </li>';
                    }

                    $metaTitle = $indicator_list['indicator'][0]['iName'];
                } else {
                    $metaVal .= '<p class="text-center">No data found</p>';
                }

                $metaData['noData'] = '';
                $metaData['indicator_list'] = $indicator_list['indicator'];
                $metaData['metadata_icons'] = $metadata_icons;
                $metaData['metaVal'] = $metaVal;
                $metaData['metaTitle'] = $metaTitle;
                $metaData['indGid'] = $indicator_list['indicator'][0]['iGid'];

                return new JsonResponse($metaData);
            } else {
                $metaData['noData'] = '<option selected="selected">No data found</option>';
                $metaData['indicator_list'] = '';
                $metaData['metadata_icons'] = '';
                $metaData['metaVal'] = '<p class="text-center">No data found</p>';
                $metaData['metaTitle'] = '';
                $metaData['indGid'] = '';

                return new JsonResponse($metaData);
            }
        }

        /**
         * Get metadata by indicator gid
         */
        if ($action == 'getMetadataByIndGid') {
            $indicator = \Drupal::request()->request->get('indicator');
            $url = \Drupal::request()->request->get('url');
            $data = MetaDataAPI::searchIndicatorByiGid($indicator);

            $url = explode('/', $url);
            if ($url[2] == 'ctype') {
                $uri = $url[3];

                if ($url[3] == 'sc') {
                    $uri = 'indcl';
                } else {
                    $uri = 'sdg';
                }
            } else {
                $uri = $url[2];
            }

            if (!empty($data)) {
                $metadatas = MetaDataAPI::getMetadata($data['iGid']);

                if (!empty($metadatas['metaData'])) {
                    $addtoany_data = addtoany_create_data($base_url . '/metadata/' . $uri . '/' . $indicator, $data['iName']);

                    $share_html = [
                        '#addtoany_html' => \Drupal::token()->replace($addtoany_data['addtoany_html'], ['node' => $content]),
                        '#link_url' => $addtoany_data['link_url'],
                        '#link_title' => $data['iName'],
                        '#button_setting' => $addtoany_data['button_setting'],
                        '#button_image' => $addtoany_data['button_image'],
                        '#universal_button_placement' => $addtoany_data['universal_button_placement'],
                        '#buttons_size' => $addtoany_data['buttons_size'],
                        '#theme' => 'addtoany_standard',
                        '#cache' => [
                            'contexts' => ['url'],
                        ],
                    ];

                    $render_html = \Drupal::service('renderer');
                    $share = $render_html->renderPlain($share_html);

                    $metadata_icons .= '<li><a href="' . $base_url . '/download-metadata/' . $data['iGid'] . '" ><i class="fas fa-download"></i><span>Télécharger</span></a></li>
                                        <li class="share">
                                            <a class="shareIcons" href="javascript:void(0);"><i class="fas fa-share-nodes"></i><span>Partager</span></a>
                                            <div class="socialmedia">
                                                <div class="mediaContainer">' . $share . '</div>
                                            </div>
                                        </li>
                                        <li><a href="javascript:void(0);" id="print_metadata"><i class="fas fa-print"></i><span>Imprimer</span></a></li>';

                    foreach ($metadatas['metaData'] as $meta_val) {
                        $metaVal .= '<li>
                                        <div class="list-data">
                                            <strong>' . $meta_val['categoryName'] . '</strong>
                                            <div class="list-data-container"><p>' . $meta_val['metaDescription'] . '</p></div>
                                        </div>
                                    </li>';
                    }

                    $metaTitle = $data['iName'];
                } else {
                    $metaVal .= '<p class="text-center">No data found.</p>';
                    $metaTitle = '';
                }

                $metaData['metadata_icons'] = $metadata_icons;
                $metaData['metaVal'] = $metaVal;
                $metaData['metaTitle'] = $metaTitle;
                $metaData['indGid'] = $data['iGid'];

                return new JsonResponse($metaData);
            }
        }
    }


    /**
     * Download metadata as pdf
     */
    function downloadPdf($indicator_gid)
    {
        $data = MetaDataAPI::searchIndicatorByiGid($indicator_gid);
        $html = '';

        if (!empty($data)) {
            $metadatas = MetaDataAPI::getMetadata($data['iGid']);

            if (!empty($metadatas['metaData'])) {
                $site_config = \Drupal::config('system.site');
                $site_name = $site_config->get('name');

                $request = \Drupal::request();
                $theme_path = \Drupal::theme()->getActiveTheme()->getPath();

                // Use a single explicit logo path for metadata PDF download.
                $logo_file = \Drupal::root() . '/' . $theme_path . '/guinea_logo.png';
                if (file_exists($logo_file)) {
                    $logo_url = str_replace('\\', '/', $logo_file);
                } else {
                    $logo_url = $request->getSchemeAndHttpHost() . $request->getBasePath() . '/' . $theme_path . '/guinea_logo.png';
                }

                $logo_width = 140;
                $html .= '<table class="logo" style="width: 100%; margin-bottom: 0; border: none;"><tr>
                            <td style="border: none; vertical-align: middle; width: ' . $logo_width . 'px; padding-right: 16px;"><img src="' . $logo_url . '" width="' . $logo_width . '" style="max-width: ' . $logo_width . 'px; height: auto;"></td>
                            <td style="border: none; vertical-align: middle; text-align: center;"><span style="font-size: 30px; font-weight: 600; color: #3A7D33; font-family: sans-serif; letter-spacing: 0.05em;">METADATA</span></td>
                            <td style="border: none; vertical-align: middle; width: ' . $logo_width . 'px;"></td>
                        </tr></table>
            
                        <div id="metaTitle" class="row">
                            <p style="font-size: 30px; font-weight: 600; color: #3A7D33; padding: 0; margin: 14px 0; font-family: sans-serif;">' . $data['iName'] . '</p>

                        </div>';

                foreach ($metadatas['metaData'] as $meta_val) {
                    $html .= '<div id="metadata" class="scrollDiv">
                    <h4 style="font-size: 24px; font-weight: 600; color: #3A7D33; padding: 0; margin: 0 0 0 0; font-family: sans-serif;">' . $meta_val['categoryName'] . '</h4>
                    <p style="font-size: 16px; margin: 0 0 6px 0; font-family: sans-serif;">' . $meta_val['metaDescription'] . '</p>
                </div>';
                }

                $site_url = $request->getSchemeAndHttpHost() . $request->getBasePath();
                $html .= '<div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 12px; color: #666; font-family: sans-serif;">' . $site_url . '</div>';

                $mpdf = new Mpdf(array('c', 'A4', '', '', 32, 25, 27, 25, 16, 13));
                $mpdf->SetDisplayMode('fullpage');
                $mpdf->list_indent_first_level = 0;
                $mpdf->WriteHTML($html);
                $mpdf->Output($data['iName'] . '.pdf', 'D');

                return [];
            }
        }
    }

    function keyExists($array, $key, $val)
    {
        foreach ($array as $item)
            if (isset($item[$key]) && $item[$key] == $val)
                return true;
        return false;
    }
}
