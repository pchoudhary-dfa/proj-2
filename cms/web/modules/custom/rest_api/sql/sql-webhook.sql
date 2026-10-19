/*Table structure for table `webhook_events` */

CREATE TABLE `webhook_events` (
  `webhook_id` int(11) NOT NULL,
  `event_key` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`webhook_id`,`event_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='This table contains the list of webhook events';

/*Data for the table `webhook_events` */

insert  into `webhook_events`(`webhook_id`,`event_key`) values 
(1,'logout');

/*Table structure for table `webhooks` */

CREATE TABLE `webhooks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` int(1) NOT NULL COMMENT '0 -> Inactive, 1 -> Active',
  `url` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'POST -> HTTP Post Method, GET -> HTTP Get Method, PUT -> HTTP Put Method, DELETE -> HTTP Delete Method, PATCH -> HTTP Patch Method',
  `description` text COLLATE utf8mb4_unicode_ci,
  `modified_user_id` int(11) DEFAULT NULL,
  `modified` datetime DEFAULT NULL,
  `created_user_id` int(11) NOT NULL,
  `created` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='This table contains the list of webhooks';

/*Data for the table `webhooks` */

insert  into `webhooks`(`id`,`name`,`status`,`url`,`method`,`description`,`modified_user_id`,`modified`,`created_user_id`,`created`) values 
(1,'Monitoring Logout',1,'http://dfa-monitoring/monitoring/Users/logout/{username}','GET',NULL,1,'2018-03-16 14:59:34',1,'2018-03-16 14:59:38');