<?php

/**
 * @file
 * Contains \Drupal\cms_settings\Controller\Sdg.
 */

namespace Drupal\custom_settings\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\taxonomy\Entity\Term;
use Drupal\Core\Url;
use Drupal\file\Entity\File;
use Symfony\Component\HttpFoundation\JsonResponse;
use Drupal\node\Entity\Node;

class Sdg extends ControllerBase
{
  public function sdgDetail($sdg_val)
  {
    $sdg_val = base64_decode($sdg_val);
    $sdg_data = array();

    $tids = \Drupal::entityQuery('taxonomy_term')
      ->accessCheck(TRUE)
      ->condition('vid', 'sdg')
      ->condition('tid', $sdg_val, '=')
      ->sort('weight', 'ASC')
      ->execute();

    if (!empty($tids)) {
      $libraries_data = array();
      $tids = reset($tids);

      $term = Term::load($tids);

      $sdg_no = (int) filter_var($term->getName(), FILTER_SANITIZE_NUMBER_INT);

      $sdg_data['sdg_no'] = abs($sdg_no);
      $sdg_data['heading'] = $term->field_sdg_heading->value;

      $sdg_data['metadata_link'] = (isset($term->field_metadata_link->uri) ? Url::fromUri($term->field_metadata_link->uri, array("absolute" => TRUE))->toString() : '');
      $sdg_data['metadata_title'] = (isset($term->field_metadata_link->title) ? $term->field_metadata_link->title : '');

      $file_id = $term->field_sdg_file->target_id;
      $sdg_data['file'] = isset($file_id) ? file_create_url($term->field_sdg_file->entity->uri->value) : '';
      $sdg_data['description'] = $term->description->value;
      $sdg_data['bottom_desc'] = $term->field_sdg_bottom_description->value;

      $library_ids = \Drupal::entityQuery('node')
        ->accessCheck(TRUE)
        ->condition('type', 'library', '=')
        ->condition('field_sdg', $term->id(), '=')
        ->condition('status', 1)
        ->range(0, 2)
        ->execute();

      if (!empty($library_ids)) {
        $libraries = Node::loadMultiple($library_ids);

        foreach ($libraries as $library) {
          $library_data['library_image'] = file_create_url($library->get('field_library_image')->entity->uri->value);
          // $library_data['library_image_alt'] = $library->get('field_library_image')->alt;
          $library_data['library_file'] = file_create_url($library->get('field_library_document')->entity->uri->value);
          $libraries_data[] = $library_data;
        }
      }

      return [
        '#theme' => 'sdg-detail',
        '#sdg_data' => $sdg_data,
        '#libraries' => $libraries_data,
        '#attached' => [
          'library' => ['custom_settings/sdg_js'],
          'drupalSettings' => [
            'sdg_no' => $sdg_data['sdg_no']
          ]
        ]
      ];
    } else {
      throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
    }
  }

  public function sdgAjax()
  {
    $action = \Drupal::request()->request->get('action');
    $sdgNo = \Drupal::request()->request->get('sdgNo');
    $sdgId = \Drupal::request()->request->get('sdgId');
    $sdgId = base64_decode($sdgId);

    if ($action == 'getSdgData') {
      $sdg_data = '';
      $libraries_data = '';
      $sdg = array();

      $tids = \Drupal::entityQuery('taxonomy_term')
        ->accessCheck(TRUE)
        ->condition('vid', 'sdg')
        ->condition('tid', $sdgId, '=')
        ->sort('weight', 'ASC')
        ->execute();

      if (!empty($tids)) {
        $tids = reset($tids);
        $term = Term::load($tids);

        $sdg_no = (int) filter_var($term->getName(), FILTER_SANITIZE_NUMBER_INT);
        $sdg_no = abs($sdg_no);

        $file_id = $term->field_sdg_file->target_id;
        $file = isset($file_id) ? file_create_url($term->field_sdg_file->entity->uri->value) : '';

        $sdg_data .= '<div id="tabSdg-' . $sdg_no . '" class="tab-pane fade show active" role="tabpanel">
                        <div class="panelBox bgSdg-' . $sdg_no . '">
                          <div class="panelHeader">
                            <h2 data-aos="fade-up" data-aos-duration="1500" class="aos-init aos-animate">' . $term->field_sdg_heading->value . '</h2>
                          </div>
                          <div class="panelBody imgSdg sdg-' . $sdg_no . '">
                            <article>
                              <div class="sdgLink" class="aos-init aos-animate" data-aos="fade-up" data-aos-duration="1900">
                                ' . (($file != '') ? '<a href="' . $file . '" class="downloadSdg">' . t('Download SDG') . ' <i class="fas fa-download"></i></a>' : '') . '
                              </div>
                              <div class="customScroll" class="aos-init aos-animate" data-aos="fade-up" data-aos-duration="2100">
                                ' . $term->description->value . '
                              </div>
                            </article>
                          </div>
                        </div>
                      </div>';

        // $sdg_data .= '<section class="latest-publication-bx sdg-left">
        //                <div class="container">
        //               <div class="item aos-init aos-animate" data-aos="fade-down-right"></div>
        //                <div class="aboutus-data-bx">
        //               <div class="head-bx">
        //                </div>
        //               <div class="about-contnt sdg-{{ sdg_data.sdg_no }}" id="tabSdg-{{ sdg_data.sdg_no }}">
        //               '.$term->field_sdg_bottom_description->value.'
        //                    </div>
        //                      </div>
        //                    </div>
        //                        </section>';              

        $library_ids = \Drupal::entityQuery('node')
          ->accessCheck(TRUE)
          ->condition('type', 'library', '=')
          ->condition('field_sdg', $term->id(), '=')
          ->condition('status', 1)
          ->range(0, 2)
          ->execute();

        if (!empty($library_ids)) {
          $libraries = Node::loadMultiple($library_ids);

          foreach ($libraries as $library) {
            $libraries_data .= '<div class="col-md-2 aos-init aos-animate" data-aos="fade-up" data-aos-duration="1700">
                                  <div class="thumbBx">
                                    <div class="shareBx">
                                      <a href="javascript:void(0);"><i class="fa fa-share-alt"></i></a>
                                    </div>
                                    <img src="' . file_create_url($library->get('field_library_image')->entity->uri->value) . '" alt="' . $library->get('field_library_image')->alt . '">
                                  </div>
                                  <div class="text-center">
                                    <a href="' . file_create_url($library->get('field_library_document')->entity->uri->value) . '" target="_blank" class="btn btn-danger">Lire</a>
                                  </div>
                                </div>';
          }
        } else {
          $libraries_data = '<div class="col-md-12 aos-init aos-animate" data-aos="fade-up" data-aos-duration="1700">
                                <p class="text-center">No Data Found</p>
                            </div>';
        }

        $sdg['sdg_no'] = $sdg_no;
        $sdg['sdg_data'] = $sdg_data;
        $sdg['bottom_desc'] = $term->field_sdg_bottom_description->value;
        $sdg['libraries'] = $libraries_data;

        return new JsonResponse($sdg);
      }
    }
  }
}
