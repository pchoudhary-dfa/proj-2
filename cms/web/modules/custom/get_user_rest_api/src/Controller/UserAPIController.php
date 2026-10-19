<?php

/**
 * @file
 * Contains \Drupal\get_user_rest_api\Controller\UserAPIController.
 */

namespace Drupal\get_user_rest_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Drupal\Core\Database\Database;
use \Drupal\taxonomy\Entity\Term;
use Drupal\user\Entity\User;

/**
 * Controller routines for test_api routes.
 */
class UserAPIController extends ControllerBase {

	/**
	 * Callback for `/getusers` API method.
	 */
	public function get_users( Request $request ) {
		$ids = \Drupal::entityQuery('user')
		            ->accessCheck(TRUE)
	    			->condition('status', 1)
					->execute();
		$users = User::loadMultiple($ids);
		
		foreach($users as $account) {
			$userName = $account->getAccountName();
			
			$mailData = $account->mail->value;
			$timeStamp = $account->get('created')->value;
			$userCreated = gmdate("Y-m-d H:i:s", $timeStamp);
			$userFirstName = $mailData;
			$userSurName = '';
			$userRoles = $account->getRoles();
			// if(in_array("administrator", $userRoles)!==false)
			// 	continue;
				
	      		$userStatus = $account->get('status')->value;
	      		$data[$userName]['username'] = $userName;
	      		$data[$userName]['email'] = $mailData;
	      		$data[$userName]['user_registered'] = $userCreated;
	      		$data[$userName]['first_name'] = $userFirstName;
	      		$data[$userName]['last_name'] = $userSurName;
	      		$data[$userName]['is_active'] = $userStatus;
	      		$data[$userName]['role'] = $userRoles;
	      		$data[$userName]['contact_number'] = '';
	      		$data[$userName]['address'] = '';
    		} 
	    	$response['success']= TRUE;
			$response['err']['code']= '';
			$response['err']['msg']= '';
			$response['data'] = $data;
    	return new JsonResponse( $response );
  	}
}