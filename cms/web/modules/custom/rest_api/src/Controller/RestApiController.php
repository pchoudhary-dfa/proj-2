<?php

namespace Drupal\rest_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\RequestStack;
use Drupal\Core\Routing\ResettableStackedRouteMatchInterface;
use Drupal\rest_api\Service\RestApi;
use Symfony\Component\DependencyInjection\ContainerInterface;
use \Drupal\Core\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Drupal\Core\Database\Database;
use Symfony\Component\HttpFoundation\JsonResponse;
use \Drupal\node\Entity\Node;
use \Drupal\file\Entity\File;
use Symfony\Component\HttpFoundation\Request;
use \Drupal\taxonomy\Entity\Term;
use Drupal\rest\Plugin\ResourceBase;
use Drupal\rest\ResourceResponse;
use Drupal\user\Entity\User;
use GuzzleHttp\RequestOptions;
use Drupal\Core\File\FileSystem;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\File\FileSystemInterface;
use Drupal\Core\File\FileExists;

define('TBL_WEBHOOK', 'webhooks');
define('TBL_WEBHOOK_EVENTS', 'webhook_events');

class RestApiController extends ControllerBase implements RestApiControllerInterface
{

    /**
     * The Current Route Match
     *
     * @var \Drupal\Core\Routing\RouteMatchInterface
     */
    protected $currentRequest;
    protected $currentRouteMatch;
    protected $requestStack;
    protected $request_options = [];

    /**
     * Create an RestApiController object
     *
     * @param \Drupal\Core\Routing\RouteMatchInterface $currentRouteMatch
     *   The Current Route Match
     */
    public function __construct(RequestStack $requestStack)
    {
        $this->requestStack = $requestStack;
        $this->currentRequest = $this->requestStack->getCurrentRequest();
    }


    /**
     * {@inheritdoc}
     */
    public static function create(ContainerInterface $container)
    {
        return new static(
            $container->get('request_stack')
        );
    }


    /**
     * {@inheritdoc}
     */
    public function apiInit()
    {
        $this->currentRequest = $this->requestStack->getCurrentRequest();

        if (!$this->currentRequest instanceof Request) {
            return $this->sendResponse([
                'success' => false,
                'err' => ['code' => 'INVALID_REQUEST', 'msg' => 'Invalid request object']
            ]);
        }

        // Logging - AFTER getting request
        \Drupal::logger('file_operations')->notice('RAW Request Body: @body', ['@body' => $this->currentRequest->getContent()]);
        \Drupal::logger('file_operations')->notice('RAW Request Query Params: @query', ['@query' => print_r($this->currentRequest->query->all(), true)]);
        \Drupal::logger('file_operations')->notice('RAW Request Form Params: @form', ['@form' => print_r($this->currentRequest->request->all(), true)]);
        \Drupal::logger('file_operations')->notice('Content-Type: @type', ['@type' => $this->currentRequest->headers->get('Content-Type')]);
        \Drupal::logger('file_operations')->notice('HTTP Method: @method', ['@method' => $this->currentRequest->getMethod()]);

        // Extract fileInfo safely
        $networkData = [];
        if ($this->currentRequest->getContentTypeFormat() === 'json') {
            $decodedData = json_decode($this->currentRequest->getContent(), true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                \Drupal::logger('file_operations')->error('JSON Decode Error: @error', ['@error' => json_last_error_msg()]);
                return $this->sendResponse([
                    'success' => false,
                    'err' => ['code' => 'INVALID_JSON', 'msg' => json_last_error_msg()]
                ]);
            }

            $networkData = $decodedData['fileInfo'] ?? [];
        } else {
            $allRequestData = $this->currentRequest->request->all();
            $networkData = $allRequestData['fileInfo'] ?? [];

            // If `fileInfo` is a JSON-encoded string, decode it
            if (!empty($networkData) && is_string($networkData)) {
                $decodedNetworkData = json_decode($networkData, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $networkData = $decodedNetworkData;
                }
            }
        }

        // Convert nested arrays to JSON strings for logging
        if (!empty($networkData) && is_array($networkData)) {
            array_walk_recursive($networkData, function (&$value) {
                if (is_array($value)) {
                    $value = json_encode($value);
                }
            });
        }

        \Drupal::logger('file_operations')->notice('Processed File Info: @data', ['@data' => print_r($networkData, true)]);

        // Handle file actions
        $fileAction = $this->currentRequest->query->get('file-action');
        if (!empty($fileAction)) {
            if (in_array($fileAction, ['create', 'update', 'delete'], true) && !$this->validateFileRequest()) {
                return $this->sendResponse([
                    'success' => false,
                    'err' => ['code' => 'UNAUTHORIZED_ACCESS', 'msg' => 'UNAUTHORIZED_ACCESS']
                ]);
            }

            switch ($fileAction) {
                case 'create':
                    return $this->manageFile();
                case 'update':
                    return !empty($networkData) ? $this->updateFile($networkData) : $this->sendResponse([
                        'success' => false,
                        'err' => ['code' => 'FILE_ID_OR_DATA', 'msg' => 'FILE_ID_OR_DATA_NOT_VALID']
                    ]);
                case 'delete':
                    return !empty($networkData) ? $this->unlinkFile($networkData) : $this->sendResponse([
                        'success' => false,
                        'err' => ['code' => 'FILE_ID', 'msg' => 'FILE_ID_NOT_VALID']
                    ]);
                    case 'download':
                        $fileId = $this->currentRequest->query->get('fileId');
                        if (empty($fileId)) {
                            return $this->sendResponse([
                                'success' => false,
                                'err' => ['code' => 'FILE_ID', 'msg' => 'FILE_ID_NOT_VALID']
                            ]);
                        }
                        return $this->downloadFile($fileId, \Drupal::currentUser()->id());
            }
        }

        // Handle user logout
        $redirect_url = $this->currentRequest->query->get('redirect_url');
        $user = $this->currentRequest->query->get('servicelogout') ?? $this->currentRequest->request->get('servicelogout');

        if (!empty($user)) {
            return $this->logOutUserByUserName($user, $redirect_url);
        }

        // Handle SLO (Single Logout)
        $slo = $this->currentRequest->query->get('slo');
        if (!empty($slo) && in_array($slo, [true, 'true', 1], true)) {
            return $this->performSLO();
        }

        // Final response if no action was processed
        return $this->sendResponse([
            'success' => true,
            'data' => $networkData
        ]);
    }


    /**
     * To perform SLO
     */
    private function performSLO()
    {
        $user = \Drupal\user\Entity\User::load(\Drupal::currentUser()->id());
        if (!empty($user)) {
            $userName = $user->get('name')->value;
            $userName = (string) $userName;
            user_logout();
            $this->domainLogout($userName);
            $this->triggerWebhook($userName);
        }

        //global $base_url
        $base_url = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';
        //$base_url='https://tunisia.dataforall.org';

        $response = new RedirectResponse($base_url);
        $response->send();
    }

    /**
     * To webhook logout
     * http://dfa-monitoring/api?slo=true
     * http://moz.dfa-monitoring/api?slo=true
     */
    private function triggerWebhook(string $userName)
    {
        if (!empty($userName)) {
            $eventKey = 'logout';
            $status = 1;
            $webhooks = TBL_WEBHOOK;
            $webhookEvents = TBL_WEBHOOK_EVENTS;
            $connection = \Drupal\Core\Database\Database::getConnection();
            $sqlQry = "SELECT {$webhooks}.url, {$webhooks}.method 
      FROM {$webhookEvents} 
      INNER JOIN webhooks ON {$webhookEvents}.webhook_id={$webhooks}.id 
      WHERE {$webhookEvents}.event_key='{$eventKey}' 
      AND {$webhooks}.status='{$status}'
      AND {$webhooks}.method <> ''
      AND {$webhooks}.url <> '';";
            $sth = $connection->prepare($sqlQry);
            $sth->execute();
            $result = $sth->fetchAll(\PDO::FETCH_ASSOC);
            $client = \Drupal::httpClient();
            if (!empty($result)) {
                foreach ($result as $apiInfo) {
                    $url = str_replace('{username}', $userName, $apiInfo['url']);
                    $response = $client->request(strtoupper($apiInfo['method']), $url, $this->request_options);
                }
            }
        }
        return true;
    }

    /**
     * To log out a user by userName
     */
    private function logOutUserByUserName(string $userName, $redirect_url)
    {
        //global $base_url
        $base_url = isset($_ENV['APP_URL']) ? trim($_ENV['APP_URL']) : '';
        //$base_url='https://tunisia.dataforall.org';

        $exUserInfo = User::loadByUsername($userName);

        if (!empty($exUserInfo) && $exUserInfo->id() > 0) {
            $userId = $exUserInfo->id();
            $this->destoryUserSession($userId);

            if (!empty($redirect_url)) {
                $response = new RedirectResponse($redirect_url);
                $response->send();
            } else {
                $response = new RedirectResponse($base_url);
                $response->send();
            }
        }
    }
    /**
     * To destory user session
     * TODO : workspace's user session need to be delete
     */
    private function destoryUserSession(int $uid)
    {
        user_logout();
    }

    /**
     * To logout a user across all domain
     */
    private function domainLogout(string $userName)
    {
        $sloUrls = [];
        $sloUrls = $this->getUserWorkspaces($userName);
        if (!empty($sloUrls)) {
            array_walk(
                $sloUrls,
                function ($url) use (&$sloUrls, &$userName) {
                    $sloUrl = $url . "/api?servicelogout={$userName}&single=true";
                    $client = \Drupal::httpClient();
                    $response = $client->request('GET', $sloUrl, $this->request_options);
                }
            );
        }
    }

    /**
     * To get user workspaces
     * Note: Of this function un till user workspace relationship is not decided
     */
    private function getUserWorkspaces(string $userName)
    {
        $resp = [];
        /*$resp = [
        'http://dfa-monitoring',
        'http://tza.dfa-monitoring',
        'http://moz.dfa-monitoring',
        'http://sdn.dfa-monitoring',
        ];*/
        return $resp;
    }


    public function manageFile()
    {
        \Drupal::logger('file_operations')->notice('manageFile() function called.');

        $response = [
            'success' => false,
            'err' => ['code' => 'FILE_NOT_UPLOADED', 'msg' => 'FILE_NOT_UPLOADED']
        ];

        $allowedExtensions = ["docx", "jpeg", "pdf", "doc", "png", "mp4", "jpg", "gif", "mp3", "xls", "xlsx", "ppt", "zip", "odt", "pptx"];

        // Detect request format
        if (\Drupal::request()->headers->get('Content-Type') === 'application/json') {
            $data = json_decode(\Drupal::request()->getContent(), true);
        } else {
            $data = \Drupal::request()->request->all();
        }

        \Drupal::logger('my_module')->notice('Received request: ' . print_r($data, TRUE));

        if (!isset($data['fileInfo']) || !is_array($data['fileInfo'])) {
            \Drupal::logger('my_module')->error('fileInfo missing or invalid');
            return $this->sendResponse([
                'success' => false,
                'err' => ['code' => 'INVALID_FILE_INFO', 'msg' => 'fileInfo missing or invalid']
            ]);
        }

        $workspaceName = $data['fileInfo']['workspace']['wname'] ?? '';
        $fileCategory = $data['fileInfo']['file_cat']['catname'] ?? '';
        $doc_Titlee = $data['fileInfo']['doc_title']['value'] ?? '';
        $usernameee = $data['fileInfo']['username'] ?? '';

        if (!empty($usernameee)) {
            // Load the user entity by username
            $users = \Drupal::entityTypeManager()
                ->getStorage('user')
                ->loadByProperties(['name' => $usernameee]);

            $user = reset($users); // Get the first user found

            if ($user) {
                $docUserID = $user->id(); // Get user ID
            }
        }
        \Drupal::logger('my_module')->error('User: ' . $usernameee . ' userid' . $docUserID);

        // File processing
        if (isset($_FILES['fileInfo']['tmp_name']['doc_file'])) {
            $fileDt = $_FILES['fileInfo'];
            $file_doc_size = $fileDt['size']['doc_file'];
            $actual_file_size = number_format($file_doc_size / 1048576, 2);

            $fileUploadExt = pathinfo($doc_Titlee, PATHINFO_EXTENSION);
            $fileName = time() . '_' . str_replace(' ', '_', $doc_Titlee);
            $fileDefScheme = 'public';

            // Define destination
            $destination = $fileDefScheme . '://documents/' . $workspaceName . '/';
            \Drupal::service('file_system')->prepareDirectory($destination, \Drupal\Core\File\FileSystemInterface::CREATE_DIRECTORY);

            // ✅ Use file_save_data() instead of move_uploaded_file/file_put_contents
            $tmpFile = $fileDt['tmp_name']['doc_file'];
            $data = file_get_contents($tmpFile);

            if ($data === false) {
                \Drupal::logger('my_module')->error('Could not read uploaded file data.');
                return $this->sendResponse([
                    'success' => false,
                    'err' => ['code' => 'FILE_READ_FAILED', 'msg' => 'Could not read uploaded file']
                ]);
            }

            $file = \Drupal::service('file.repository')->writeData(
                $data,
                $destination . $fileName,
                FileExists::Rename
            );
            
            if (!$file) {
                \Drupal::logger('my_module')->error('file_save_data() failed.');
                return $this->sendResponse([
                    'success' => false,
                    'err' => ['code' => 'FILE_SAVE_FAILED', 'msg' => 'File could not be saved']
                ]);
            }

            // Assign file ownership
            $file->setOwnerId($docUserID);
            $file->setPermanent();
            $file->save();

            // Save the node with the file
            $node = Node::create([
                'type' => 'documents',
                'title' => $doc_Titlee,
                'field_upload_document' => ['target_id' => $file->id(), 'display' => 1],
                'field_workspace_list' => ['target_id' => 1], // Replace with actual workspace ID
                'field_doc_category' => ['target_id' => 1],   // Replace with actual category ID
                'field_doc_tags' => [],                       // Replace with tag IDs
                'uid' => $docUserID,
            ]);
            $node->save();

            \Drupal::logger('my_module')->notice('Node created successfully with ID: ' . $node->id());

            $response['success'] = true;
            $response['data']['doc']['doc_id'] = $node->id();
            $response['data']['file']['fid'] = $file->id();
            $response['data']['file']['file_uuid'] = $file->uuid();
        } else {
            \Drupal::logger('my_module')->error('No file detected in the request.');
            $response['err'] = ['code' => 'NO_FILE_UPLOADED', 'msg' => 'No file detected in the request'];
        }

        return $this->sendResponse($response);
    }




    public function sendResponse(array $params, bool $halt = true)
    {
        echo json_encode($params);
        if ($halt === true) {
            exit();
        }
    }
    public function downloadFile($fid, $loggedinUserId)
    {
        $connection = Database::getConnection();
        $fileId = $fid;
        $fileData = $connection->query("SELECT node__field_upload_document.field_upload_document_target_id AS fid FROM {node__field_upload_document} node__field_upload_document WHERE (node__field_upload_document.entity_id LIKE '" . $fileId . "') LIMIT 11 OFFSET 0")->fetchAssoc();
        $file_path = $connection->query("SELECT file_managed.uri AS fileURI, file_managed.uid AS fileUserId FROM {file_managed} file_managed WHERE (file_managed.fid LIKE '" . $fileData['fid'] . "') LIMIT 11 OFFSET 0")->fetchAssoc();
        if (!empty($file_path) && $file_path['fileUserId'] == $loggedinUserId) {
            $file_rel_path = ($file_path['fileURI']);
            $this->outFile($file_rel_path);
            exit();
        } else {
            $response['success'] = false;
            $response['err']['cde'] = 'FILE_ID';
            $response['err']['msg'] = 'FILE_ID_NOT_VALID';
            $this->sendResponse($response);
        }
    }

    public function unlinkFile(array $data)
    {
        $fileId = $data['fileId'];
        $storageHandler = \Drupal::entityTypeManager()->getStorage("node");
        $nodeEntity = $storageHandler->loadMultiple([$fileId]); // Deleting the node.
        if (!empty($nodeEntity)) {
            $storageHandler->delete($nodeEntity);
            $response['success'] = true;
            $response['err']['code'] = '';
            $response['err']['msg'] = '';
            $response['data'] = 'Document Deleted';
        } else {
            $response['success'] = false;
            $response['err']['code'] = 'DOC_NOT_FOUND';
            $response['err']['msg'] = 'Current Document not exist';
        }
        $this->sendResponse($response);
    }
    public function updateFile(array $data)
    {

        $nid = $data['fileId'];
        $connection = Database::getConnection();
        $docTitle = '';
        if (!empty($data['doc_title']['value'])) {
            $docTitle = $data['doc_title']['value'];
        }
        /* ****** start code to get all registered tags ***********/
        // here tags_array where all tags is coming from the database that are all in lowercase
        $tags = $connection->query("SELECT taxonomy_term_field_data.tid AS tid, taxonomy_term_field_data.name AS tname FROM {taxonomy_term_field_data} taxonomy_term_field_data WHERE (taxonomy_term_field_data.vid IN ('doc_tags'))")->fetchAll();
        $tags_array = array();
        foreach ($tags as $key => $value) {
            $tags_array[$value->tid] = strtolower($value->tname);
        }

        /* ****** End code ***********/

        /************
         * start code register parent if not  
         ************/
        $parry = [];
        foreach ($data['file_tags'] as $pkey => $pvalue) {
            $parry[] = strtolower($pkey);
        }
        $pdiff = array_diff($parry, $tags_array);
        $parent_create_arr = [];
        if (!empty($pdiff)) {
            foreach ($pdiff as $dkey => $dvalue) {
                $term = Term::create(
                    [
                        'name' => $dvalue,
                        'vid' => 'doc_tags',
                    ]
                )->save();
            }
            foreach ($parry as $dkey => $dvalue) {
                $term_storage = \Drupal::entityTypeManager()->getStorage('taxonomy_term');
                $pterm_id = $term_storage->getQuery()
                    ->accessCheck(FALSE)
                    ->condition('name', $dvalue)
                    ->execute();
                $fpterm_id = array_keys($pterm_id);
                $parent_create_arr[$dvalue] = $fpterm_id[0];
            }
            foreach ($data['file_tags'] as $origKey => $value) {
                // New key that we will insert into $newArray with
                $lwr_case_origKey = strtolower($origKey);
                $newKey = $parent_create_arr[$lwr_case_origKey];
                $newArray[$newKey] = $value;
            }
        } else {
            foreach ($parry as $dkey => $dvalue) {
                $term_storage = \Drupal::entityTypeManager()->getStorage('taxonomy_term');
                $pterm_id = $term_storage->getQuery()
                    ->accessCheck(FALSE)
                    ->condition('name', $dvalue)
                    ->execute();
                $fpterm_id = array_keys($pterm_id);
                $parent_create_arr[$dvalue] = $fpterm_id[0];
            }
            foreach ($data['file_tags'] as $origKey => $value) {
                // New key that we will insert into $newArray with
                $lwr_case_origKey = strtolower($origKey);
                $newKey = $parent_create_arr[$lwr_case_origKey];
                $newArray[$newKey] = $value;
            }
        }
        $sent_arry['tags'] = $newArray;
        $sent_final_arr = [];
        foreach ($sent_arry['tags'] as $sent_key => $sent_value) {
            foreach ($sent_value as $skey => $svalue) {
                $search_value = strtolower($svalue);
                $diff = in_array($search_value, $tags_array);
                //print_r($sent_key);
                if (empty($diff)) {

                    $term = Term::create(
                        [
                            'name' => $search_value,
                            'vid' => 'doc_tags',
                            'parent' => array($sent_key),
                        ]
                    )->save();
                }
            }
        }
        $tags_array = array();
        $tags = $connection->query("SELECT taxonomy_term_field_data.tid AS tid, taxonomy_term_field_data.name AS tname FROM {taxonomy_term_field_data} taxonomy_term_field_data WHERE (taxonomy_term_field_data.vid IN ('doc_tags'))")->fetchAll();

        foreach ($tags as $key => $value) {
            $tags_array[$value->tid] = strtolower($value->tname);
        }
        $final_arr = [];
        $res_arr = array_values($tags_array);
        $matchArry = [];
        foreach ($data['file_tags'] as $matchkey => $matchvalue) {
            //$matchArry []=$matchkey;
            foreach ($matchvalue as $childkey => $childvalue) {
                $matchArry[] = $childvalue;
            }
        }
        foreach ($matchArry as $rkey => $rvalue) {
            if (in_array(strtolower($rvalue), $res_arr)) {
                $final_arr[] = array_search(strtolower($rvalue), $tags_array);
            }
        }
        //$nid = \Drupal::routeMatch()->getParameter('node');
        $node = Node::load($nid);
        if (!empty($node)) {
            $node->field_doc_tags = $final_arr;
            $node->title = $docTitle;
            $node->save();
            $node_storage = \Drupal::entityTypeManager()->getStorage('node');
            $node = $node_storage->load($nid);
            $tags = $node->get('field_doc_tags')->getValue();
            //$response['data'] = $tags;
            $response['success'] = true;
            $response['err']['code'] = '';
            $response['err']['msg'] = '';
            $response['data'] = 'Document Updated';
            $this->sendResponse($response);
        } else {
            $response['success'] = false;
            $response['err']['code'] = 'DOC_NOT_FOUND';
            $response['err']['msg'] = 'Current Document not exist';
            $this->sendResponse($response);
        }
    }

    public function outFile(string $file)
    {
        if (file_exists($file)) {
            header('Content-Description: File Transfer');
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . basename($file) . '"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . filesize($file));
            ob_clean();
            flush();
            readfile($file);
            exit;
        } else {
            $response['success'] = false;
            $response['err']['code'] = 'DOC_NOT_FOUND';
            $response['err']['msg'] = _('Resource not found');
            $this->sendResponse($response);
        }
    }

    /**
     * Function to decode selected string
     */
    private function decodeString($crypted_token)
    {
        list($crypted_token, $enc_iv) = explode("::", $crypted_token);;
        $cipher_method = 'aes-128-ctr';
        $enc_key = openssl_digest(php_uname(), 'SHA256', true);
        $token = openssl_decrypt($crypted_token, $cipher_method, $enc_key, 0, hex2bin($enc_iv));
        unset($crypted_token, $cipher_method, $enc_key, $enc_iv);
        return $token;
    }

    /**
     * Function to validate file upload request from monitoring
     */
    private function validateFileRequest()
    {
        \Drupal::logger('file_operations')->notice('Validating File Request');

        // Get 'Data-Origin' header
        $dataOrigin = $this->currentRequest->headers->get('Data-Origin');
        \Drupal::logger('file_operations')->notice('Raw Data-Origin Header: @dataOrigin', ['@dataOrigin' => $dataOrigin]);

        // Decode Data-Origin
        $dataOriginDecrpt = $this->decodeString($dataOrigin);
        \Drupal::logger('file_operations')->notice('Decoded Data-Origin: @decrypted', ['@decrypted' => $dataOriginDecrpt]);

        if (empty($dataOriginDecrpt)) {
            \Drupal::logger('file_operations')->error('Data-Origin header is missing or failed to decrypt.');
            return false;
        }

        // Extract components from decrypted string
        $dataOriginDecrptArr = explode('$$##', $dataOriginDecrpt);
        \Drupal::logger('file_operations')->notice('Extracted Data-Origin Array: @array', ['@array' => print_r($dataOriginDecrptArr, true)]);

        // Get fileInfo from request
        $data = $this->currentRequest->request->all();
        \Drupal::logger('file_operations')->notice('Raw Request Data: @data', ['@data' => print_r($data, true)]);

        $fileInfo = $data['fileInfo'] ?? null;
        if (empty($fileInfo)) {
            \Drupal::logger('file_operations')->error('Missing fileInfo in request.');
            return false;
        }

        $docUserName = $fileInfo['username'] ?? '';
        $workspace_name = $fileInfo['workspace']['wname'] ?? '';

        // Validate decrypted data against fileInfo
        if (
            !empty($dataOriginDecrptArr) &&
            isset($dataOriginDecrptArr[0], $dataOriginDecrptArr[1], $dataOriginDecrptArr[3]) &&
            $dataOriginDecrptArr[0] === 'monitoring' &&
            $dataOriginDecrptArr[1] === $workspace_name &&
            $dataOriginDecrptArr[3] === $docUserName
        ) {
            \Drupal::logger('file_operations')->notice('Validation passed.');
            return true;
        }

        \Drupal::logger('file_operations')->error('Validation failed. Mismatch in decrypted data.');
        return false;
    }
}
