<?php

/**
 * @file
 * Contains \Drupal\metadata_api\Controller\MetaDataAPI.
 */

namespace Drupal\metadata_api\Controller;

use Psr\Http\Message\ResponseInterface;
use Drupal\Core\Controller\ControllerBase;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class MetaDataAPI extends ControllerBase
{
    /**
     * Get Metadata Configuration Settings Data
     */
    public static function getMetaConfigDetails()
    {
        $config = \Drupal::config('metadata.adminsettings');
        $metaConfig['api_url'] = $config->get('api_url');
        $metaConfig['api_username'] = $config->get('api_username');
        $metaConfig['api_password'] = $config->get('api_password');
        $metaConfig['api_db_id'] = $config->get('api_db_id');

        return $metaConfig;
    }

    /**
     * Get Authorization Token
     */
    public static function getToken()
    {
        $metaConfig = self::getMetaConfigDetails();

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $metaConfig['api_url'] . 'token',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => array(
                'username' => $metaConfig['api_username'],
                'password' => $metaConfig['api_password']
            ),

        ));

        $response = curl_exec($curl);
        if ($response === false) {
            \Drupal::logger('metadata_api')->error('getToken cURL error: ' . curl_error($curl));
            curl_close($curl);
            return null;
        }

        curl_close($curl);
        $body = json_decode($response, true);

        if (!isset($body['data']['token'])) {
            \Drupal::logger('metadata_api')->error('Token missing in response: ' . $response);
            return null;
        }

        return $body['data']['token'];
    }


    /**
     * Get Indicators List Without Filters
     */
    public static function getIndicatorsList($icgid)
    {
        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $languageCode = 'fr';

        if ($icgid != '') {
            $query_params = http_build_query([
                'dbId' => $metaConfig['api_db_id'],
                'icgid' => $icgid,
                'lang' => $languageCode,
                'indorder' => 'database',
                'sort' => 'asc',
                'isMetadata' => 'true'
            ]);
        } else {
            $query_params = http_build_query([
                'dbId' => $metaConfig['api_db_id'],
                'lang' => $languageCode,
                'indorder' => 'database',
                'sort' => 'asc',
                'isMetadata' => 'true'
            ]);
        }

        $url = $metaConfig['api_url'] . 'ind?' . $query_params;

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
            ),
        ));

        $response = curl_exec($curl);
        curl_close($curl);

        $body = json_decode($response, true);
        return $body['indicator'] ?? [];
    }


    /**
     * Search Indicator By keyword
     */
    public static function searchIndicatorByKeyword($keyword)
    {
        $languageCode = 'fr';

        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $query_params = http_build_query([
            'dbId' => $metaConfig['api_db_id'],
            'keyword' => $keyword,
            'lang' => $languageCode,
            'indorder' => 'database',
            'sort' => 'asc',
            'isMetadata' => 'true'
        ]);

        $url = $metaConfig['api_url'] . 'ind?' . $query_params;

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
            ),
        ));

        $response = curl_exec($curl);
        curl_close($curl);

        $body = json_decode($response, true);
        return $body;
    }


    /**
     * Search Indicator By igid
     */
    public static function searchIndicatorByiGid($igid)
    {
        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $languageCode = 'fr';

        $query_params = http_build_query([
            'dbId' => $metaConfig['api_db_id'],
            'iGid' => $igid,
            'enableIcInfo' => 'true',
            'lang' => $languageCode,
            'indorder' => 'database',
            'sort' => 'asc',
            'isMetadata' => 'true'
        ]);

        $url = $metaConfig['api_url'] . 'ind?' . $query_params;

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
            ),
        ));

        $response = curl_exec($curl);
        curl_close($curl);

        $body = json_decode($response, true);
        return $body['indicator'][0] ?? null;
    }


    /**
     * Get Indicator By Classification Gid
     * Get indicator on change of classification
     */
    public static function searchIndicatorByIcGid($gid)
    {
        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $languageCode = 'fr';

        $query_params = http_build_query([
            'dbId' => $metaConfig['api_db_id'],
            'icGid' => $gid,
            'lang' => $languageCode,
            'indorder' => 'database',
            'sort' => 'asc',
            'isMetadata' => 'true'
        ]);

        $url = $metaConfig['api_url'] . 'ind?' . $query_params;

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
            ),
        ));

        $body = curl_exec($curl);
        curl_close($curl);

        return json_decode($body, true);
    }


    /**
     * Get Classification By Type
     */
    public static function getClassificationType($type)
    {
        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $client = new Client();
        $languageCode = 'fr';

        $url = $metaConfig['api_url'] . 'ic?dbId=' . $metaConfig['api_db_id'] . '&icType=' . $type . '&indorder=database&sort=ASC&lang=' . $languageCode;

        $curl = curl_init();

        curl_setopt_array($curl, array(
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'GET',
        ));

        $response = curl_exec($curl);

        $body = json_decode($response, true);
        return $body;
        curl_close($curl);
    }

    /**
     * Get Metadata by indicator and classification
     */
    public static function getMetadata($indcl)
    {
        $languageCode = 'fr';

        $metaConfig = self::getMetaConfigDetails();
        $token = self::getToken();
        if (!$token) {
            \Drupal::logger('metadata_api')->error('Token is null, aborting API call.');
            return []; // Or return null if that's more appropriate
        }

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_URL => $metaConfig['api_url'] . 'metadata',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => array(
                'dbId' => $metaConfig['api_db_id'],
                'metaType' => 'Ind',
                'iGid' => $indcl,
                'catorder' => 'database',
                'lang' => $languageCode
            ),
            CURLOPT_HTTPHEADER => array(
                'Authorization: Bearer ' . $token,
            ),

        ));
        $response = curl_exec($curl);
        $body = json_decode($response, true);
        return $body['metadata']['0'];
        curl_close($curl);
    }
}
