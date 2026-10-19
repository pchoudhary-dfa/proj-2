<?php
/**
 * @file
 * Contains \Drupal\custom_settings\Controller\CustomTitle.
 */

namespace Drupal\custom_settings\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Link;
use Drupal\taxonomy\Entity\Term;
use Drupal\metadata_api\Controller\MetaDataAPI;

class CustomTitle extends ControllerBase {
    /**
     * Title for Metadata Classification types's indicator
     */
    public function ctypeTitle($ctype) {
        $data = MetaDataAPI::getClassificationType($ctype);

        if(isset($data['error']) && !empty($data['error'])) {
            return '';
        } else {
            if(!empty($data)) {
                $indicator_list = MetaDataAPI::searchIndicatorByIcGid($data['ic'][0]['gid']);
                
                if(isset($indicator_list['error']) && !empty($indicator_list['error'])) {
                    $indicator_name = '';
                } else {
                    $indicator_name = $indicator_list['indicator'][0]['iName'];
                }
    
                return $indicator_name;
            }
        }
    }

    /**
     * Title for Metadata SDG's indicator
     */
    public function metaSDGTitle($sdg) {
        $indicator_list = MetaDataAPI::searchIndicatorByIcGid($sdg);
        
        if(isset($indicator_list['error']) && !empty($indicator_list['error'])) {
            return '';
        } else {
            return $indicator_list['indicator'][0]['iName'];
        }
    }

    /**
     * Title for Metadata Indicator
     */
    public function metaIndclTitle($indcl) {
        $data = MetaDataAPI::searchIndicatorByiGid($indcl);

        if(!empty($data)) {
            return $data['iName'];
        }
    }
}