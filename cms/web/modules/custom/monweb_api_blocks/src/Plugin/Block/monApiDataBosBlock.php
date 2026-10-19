<?php

/**
 * @file
 * Contains \Drupal\monweb_api_blocks\Plugin\Block\monApiDataBlock.
 */

namespace Drupal\monweb_api_blocks\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Database\Database;
use Drupal\taxonomy\Entity\Term;
use Drupal\user\Entity\User;
use GuzzleHttp\Client;

/**
 * Provides a 'monApiDataBosBlock' Block
 *
 * @Block(
 *   id = "monApiDataBosBlock",
 *   admin_label = @Translation("monApiDataBosBlock"),
 * )
 */
class monApiDataBosBlock extends BlockBase
{

  /**
   * {@inheritdoc}
   */
  public function build()
  {

    $returnData = $this->callBosGetRestService();
    $abc = is_array($returnData) ? count($returnData) : 0;
    $array = array();

    return [
      '#theme' => 'apidatabos_template',
      '#test_var' => $abc,
      '#myvariable' => isset($returnData['data']) ? $returnData['data'] : '',
    ];
  }

  public function callBosGetRestService()
  {
    $host = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';
    if ($host === '') {
      $request = \Drupal::request();
      $host = $request ? $request->getSchemeAndHttpHost() : '';
    }
    if (stripos($host, 'http://') === 0) {
      $host = 'https://' . substr($host, 7);
    }
    $host = rtrim($host, '/');
    //$host = 'https://tunisia.dataforall.org';
    $user = User::load(\Drupal::currentUser()->id());
    $user_name = $user->get('name')->value;
    $lang = $user->get('langcode')->value;
    $currSiteLang = getSelectedLanguageCode(); //\Drupal::languageManager()->getCurrentLanguage()->getId();
    $uid = $user->get('uid')->value;

    $connection = Database::getConnection();
    $listOfWorkspaces = $connection->query("SELECT field_workspaces_target_id as workspacelist FROM {user__field_workspaces} WHERE entity_id = '" . $uid . "'")->fetchAll();
    $explode_res = [];
    $arry = [];
    if (!empty($listOfWorkspaces)) {
      foreach ($listOfWorkspaces as $listOfWorkspaces1) {
        $explode_res[] = $listOfWorkspaces1->workspacelist;
      }
    }
    $count_result = 0;
    if (!empty($explode_res)) {
      $count_result = count($explode_res);
      $arry = [];
      foreach ($explode_res as $exkey => $exvalue) {
        $term = Term::load($exvalue);
        $termname = $term->getName();
        $term_guid = $term->field_wrkspc_uni_gid->value;
        $arry['data'][$term_guid]['cap'] = $termname;
        $arry['data'][$term_guid]['url'] = $host . MONITORING_CORE_AUTO_LOGIN_WORKSPACE_URL . $term_guid . BOS_SECTION;
      }
    }

    if ($count_result == '1' || $count_result == '0') {
      if ($count_result <= 0) {
        $workspace = 'GLOBAL';
      } else {
        $workspace = $term_guid;
      }

      if ($host === '') {
        return $arry;
      }
      $user_name = str_replace(" ", "%20", $user_name);
      $mon_url = $host . MON_API . $workspace . '/' . $currSiteLang . MON_MODULES . $user_name;

      $client = new Client(['verify' => false]);
      try {
        $response = $client->request('GET', $mon_url);
        $body = $response->getBody()->getContents();
        $resp = json_decode($body, true);
      }
      catch (\Exception $e) {
        return $arry;
      }

      if (is_array($resp) && isset($resp['data']['rc']['REPORTS'])) {
        unset($resp['data']['rc']['REPORTS']);
      }

      $apiResponse = array();
      $dmConfig = getDataManagerQueryServiceConfig($host);

      if (is_array($resp) && isset($resp['data']['rc']) && is_array($resp['data']['rc'])) {
        foreach ($resp['data']['rc'] as $rkey => $rvalue) {
          foreach ($rvalue as $tkey => $tvalue) {
            $chkArr = is_array($tvalue);
            if ($chkArr == TRUE && ($rkey == 'PLANS_MONITORING' || $rkey == 'PLANS_PLANNING')) {
              $resp_url  = $rvalue['url'];
              $replaced_term = ["{MON_URL}", "{DM_URL}", "{WORKSPACE_GID}"];
              $target_term   = [$host . MONITORING_CORE_AUTO_LOGIN_URL, $host . DATA_MANAGER_AUTO_LOGIN_URL, $workspace];
              $newPhrase = str_replace($replaced_term, $target_term, $resp_url);
              $apiResponse['data'][$rkey]['cap'] =  $rvalue['cap'];
              $apiResponse['data'][$rkey]['url'] = $newPhrase;
              $apiResponse['data'][$rkey]['target'] = (isset($rvalue['target']) ? $rvalue['target'] : '');
              $child_url = $tvalue['url'];
              $childPhrase = str_replace($replaced_term, $target_term, $child_url);
              $apiResponse['data'][$rkey][$rvalue['cap']][$tkey]['childCap'] = $tvalue['cap'];
              $apiResponse['data'][$rkey][$rvalue['cap']][$tkey]['childUrl'] = $childPhrase;
              $apiResponse['data'][$rkey][$rvalue['cap']][$tkey]['childTarget'] = $tvalue['target'];
            } else {
              $resp_url  = $rvalue['url'];
              $replaced_term = ["{MON_URL}", "{DM_URL}", "{WORKSPACE_GID}"];
              $target_term   = [$host . MONITORING_CORE_AUTO_LOGIN_URL, $host . DATA_MANAGER_AUTO_LOGIN_URL, $workspace];
              $newPhrase = str_replace($replaced_term, $target_term, $resp_url);
              if ($rkey === 'INDICATORS') {
                // URL from DM_VERSION (queryService/920) + lang/workspace from modules API template.
                $newPhrase = buildIndicatorUrl($host, $currSiteLang, $workspace, $dmConfig, $resp_url);
              }
              $apiResponse['data'][$rkey]['cap'] =  $rvalue['cap'];
              $apiResponse['data'][$rkey]['url'] = $newPhrase;
              $apiResponse['data'][$rkey]['target'] = ($rkey === 'INDICATORS') ? '_blank' : (isset($rvalue['target']) ? $rvalue['target'] : '');
            }
          }
        }
      }


      return $apiResponse;
    } else {
      return $arry;
    }
  }
}
