/*!40101 SET NAMES utf8 */;

/*!40101 SET SQL_MODE=''*/;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

/*Table structure for table `db_available_databases` */

DROP TABLE IF EXISTS `db_available_databases`;

CREATE TABLE `db_available_databases` (
  `avldb_nid` int(11) NOT NULL AUTO_INCREMENT,
  `avldb_name` varchar(255) DEFAULT NULL,
  `avldb_prefix` varchar(3) DEFAULT NULL,
  `avldb_default` tinyint(1) NOT NULL DEFAULT '0',
  `usr_name` varchar(50) DEFAULT NULL,
  `usr_pwd` varchar(50) DEFAULT NULL,
  `usr_protection` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`avldb_nid`),
  KEY `avldb_nid` (`avldb_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `db_version` */

DROP TABLE IF EXISTS `db_version`;

CREATE TABLE `db_version` (
  `version_nid` int(11) NOT NULL AUTO_INCREMENT,
  `version_number` varchar(50) DEFAULT NULL,
  `version_change_date` varchar(50) DEFAULT NULL,
  `version_comments` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`version_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_ageperiod_en` */

DROP TABLE IF EXISTS `ut_ageperiod_en`;

CREATE TABLE `ut_ageperiod_en` (
  `ageperiod_nid` int(11) NOT NULL AUTO_INCREMENT,
  `ageperiod` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`ageperiod_nid`),
  KEY `ageperiod_nid` (`ageperiod_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_feature_type_en` */

DROP TABLE IF EXISTS `ut_area_feature_type_en`;

CREATE TABLE `ut_area_feature_type_en` (
  `feature_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `feature_type` varchar(255) NOT NULL,
  PRIMARY KEY (`feature_type_nid`),
  KEY `feature_type_nid` (`feature_type_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_feature_type_fr` */

DROP TABLE IF EXISTS `ut_area_feature_type_fr`;

CREATE TABLE `ut_area_feature_type_fr` (
  `feature_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `feature_type` varchar(255) NOT NULL,
  PRIMARY KEY (`feature_type_nid`),
  KEY `feature_type_nid` (`feature_type_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_feature_type_ar` */

DROP TABLE IF EXISTS `ut_area_feature_type_ar`;

CREATE TABLE `ut_area_feature_type_ar` (
  `feature_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `feature_type` varchar(255) NOT NULL,
  PRIMARY KEY (`feature_type_nid`),
  KEY `feature_type_nid` (`feature_type_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_feature_type_es` */

DROP TABLE IF EXISTS `ut_area_feature_type_es`;

CREATE TABLE `ut_area_feature_type_es` (
  `feature_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `feature_type` varchar(255) NOT NULL,
  PRIMARY KEY (`feature_type_nid`),
  KEY `feature_type_nid` (`feature_type_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_feature_type_ru` */

DROP TABLE IF EXISTS `ut_area_feature_type_ru`;

CREATE TABLE `ut_area_feature_type_ru` (
  `feature_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `feature_type` varchar(255) NOT NULL,
  PRIMARY KEY (`feature_type_nid`),
  KEY `feature_type_nid` (`feature_type_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_level_en` */

DROP TABLE IF EXISTS `ut_area_level_en`;

CREATE TABLE `ut_area_level_en` (
  `level_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_level` int(11) NOT NULL DEFAULT '0',
  `area_level_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`level_nid`),
  KEY `level_nid` (`level_nid`),
  UNIQUE KEY `dmuniq_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_level_fr` */

DROP TABLE IF EXISTS `ut_area_level_fr`;

CREATE TABLE `ut_area_level_fr` (
  `level_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_level` int(11) NOT NULL DEFAULT '0',
  `area_level_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`level_nid`),
  KEY `level_nid` (`level_nid`),
  UNIQUE KEY `dmuniq_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_level_ar` */

DROP TABLE IF EXISTS `ut_area_level_ar`;

CREATE TABLE `ut_area_level_ar` (
  `level_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_level` int(11) NOT NULL DEFAULT '0',
  `area_level_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`level_nid`),
  KEY `level_nid` (`level_nid`),
  UNIQUE KEY `dmuniq_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_level_es` */

DROP TABLE IF EXISTS `ut_area_level_es`;

CREATE TABLE `ut_area_level_es` (
  `level_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_level` int(11) NOT NULL DEFAULT '0',
  `area_level_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`level_nid`),
  KEY `level_nid` (`level_nid`),
  UNIQUE KEY `dmuniq_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_level_ru` */

DROP TABLE IF EXISTS `ut_area_level_ru`;

CREATE TABLE `ut_area_level_ru` (
  `level_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_level` int(11) NOT NULL DEFAULT '0',
  `area_level_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`level_nid`),
  KEY `level_nid` (`level_nid`),
  UNIQUE KEY `dmuniq_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map` */

DROP TABLE IF EXISTS `ut_area_map`;

CREATE TABLE `ut_area_map` (
  `area_map_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_nid` int(11) DEFAULT '0',
  `feature_layer` tinyint(1) DEFAULT '0',
  `feature_type_nid` int(11) DEFAULT '0',
  `layer_nid` int(11) DEFAULT '0',
  PRIMARY KEY (`area_map_nid`),
  KEY `area_nid` (`area_nid`),
  KEY `area_map_nid` (`area_map_nid`),
  KEY `feature_type_nid` (`feature_type_nid`),
  KEY `layer_nid` (`layer_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_metadata_en` */

DROP TABLE IF EXISTS `ut_area_map_metadata_en`;

CREATE TABLE `ut_area_map_metadata_en` (
  `metadata_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_nid` int(11) DEFAULT '0',
  `metadata_text` longtext,
  `layer_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`metadata_nid`),
  KEY `layer_nid` (`layer_nid`),
  KEY `metadata_nid` (`metadata_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_metadata_fr` */

DROP TABLE IF EXISTS `ut_area_map_metadata_fr`;

CREATE TABLE `ut_area_map_metadata_fr` (
  `metadata_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_nid` int(11) DEFAULT '0',
  `metadata_text` longtext,
  `layer_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`metadata_nid`),
  KEY `layer_nid` (`layer_nid`),
  KEY `metadata_nid` (`metadata_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_metadata_ar` */

DROP TABLE IF EXISTS `ut_area_map_metadata_ar`;

CREATE TABLE `ut_area_map_metadata_ar` (
  `metadata_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_nid` int(11) DEFAULT '0',
  `metadata_text` longtext,
  `layer_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`metadata_nid`),
  KEY `layer_nid` (`layer_nid`),
  KEY `metadata_nid` (`metadata_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_metadata_es` */

DROP TABLE IF EXISTS `ut_area_map_metadata_es`;

CREATE TABLE `ut_area_map_metadata_es` (
  `metadata_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_nid` int(11) DEFAULT '0',
  `metadata_text` longtext,
  `layer_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`metadata_nid`),
  KEY `layer_nid` (`layer_nid`),
  KEY `metadata_nid` (`metadata_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_metadata_ru` */

DROP TABLE IF EXISTS `ut_area_map_metadata_ru`;

CREATE TABLE `ut_area_map_metadata_ru` (
  `metadata_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_nid` int(11) DEFAULT '0',
  `metadata_text` longtext,
  `layer_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`metadata_nid`),
  KEY `layer_nid` (`layer_nid`),
  KEY `metadata_nid` (`metadata_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_en` */

DROP TABLE IF EXISTS `ut_area_en`;

CREATE TABLE `ut_area_en` (
  `area_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_parent_nid` int(11) DEFAULT '0',
  `area_id` varchar(255) DEFAULT NULL,
  `area_name` varchar(60) NOT NULL,
  `area_gid` varchar(60) NOT NULL,
  `area_level` int(11) DEFAULT '0',
  `area_map` varchar(60) DEFAULT NULL,
  `area_block` longtext,
  `area_global` tinyint(1) NOT NULL DEFAULT '0',
  `data_exist` tinyint(1) DEFAULT '0',
  `areashortname` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`area_nid`),
  KEY `area_nid` (`area_nid`),
  UNIQUE KEY `dmuniq_area_id` (`area_id`),
  KEY `idx_area_name` (`area_name`),
  KEY `idx_area_parent_nid` (`area_parent_nid`),
  KEY `idx_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_fr` */

DROP TABLE IF EXISTS `ut_area_fr`;

CREATE TABLE `ut_area_fr` (
  `area_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_parent_nid` int(11) DEFAULT '0',
  `area_id` varchar(255) DEFAULT NULL,
  `area_name` varchar(60) NOT NULL,
  `area_gid` varchar(60) NOT NULL,
  `area_level` int(11) DEFAULT '0',
  `area_map` varchar(60) DEFAULT NULL,
  `area_block` longtext,
  `area_global` tinyint(1) NOT NULL DEFAULT '0',
  `data_exist` tinyint(1) DEFAULT '0',
  `areashortname` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`area_nid`),
  KEY `area_nid` (`area_nid`),
  UNIQUE KEY `dmuniq_area_id` (`area_id`),
  KEY `idx_area_name` (`area_name`),
  KEY `idx_area_parent_nid` (`area_parent_nid`),
  KEY `idx_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_ar` */

DROP TABLE IF EXISTS `ut_area_ar`;

CREATE TABLE `ut_area_ar` (
  `area_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_parent_nid` int(11) DEFAULT '0',
  `area_id` varchar(255) DEFAULT NULL,
  `area_name` varchar(60) NOT NULL,
  `area_gid` varchar(60) NOT NULL,
  `area_level` int(11) DEFAULT '0',
  `area_map` varchar(60) DEFAULT NULL,
  `area_block` longtext,
  `area_global` tinyint(1) NOT NULL DEFAULT '0',
  `data_exist` tinyint(1) DEFAULT '0',
  `areashortname` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`area_nid`),
  KEY `area_nid` (`area_nid`),
  UNIQUE KEY `dmuniq_area_id` (`area_id`),
  KEY `idx_area_name` (`area_name`),
  KEY `idx_area_parent_nid` (`area_parent_nid`),
  KEY `idx_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_es` */

DROP TABLE IF EXISTS `ut_area_es`;

CREATE TABLE `ut_area_es` (
  `area_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_parent_nid` int(11) DEFAULT '0',
  `area_id` varchar(255) DEFAULT NULL,
  `area_name` varchar(60) NOT NULL,
  `area_gid` varchar(60) NOT NULL,
  `area_level` int(11) DEFAULT '0',
  `area_map` varchar(60) DEFAULT NULL,
  `area_block` longtext,
  `area_global` tinyint(1) NOT NULL DEFAULT '0',
  `data_exist` tinyint(1) DEFAULT '0',
  `areashortname` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`area_nid`),
  KEY `area_nid` (`area_nid`),
  UNIQUE KEY `dmuniq_area_id` (`area_id`),
  KEY `idx_area_name` (`area_name`),
  KEY `idx_area_parent_nid` (`area_parent_nid`),
  KEY `idx_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_ru` */

DROP TABLE IF EXISTS `ut_area_ru`;

CREATE TABLE `ut_area_ru` (
  `area_nid` int(11) NOT NULL AUTO_INCREMENT,
  `area_parent_nid` int(11) DEFAULT '0',
  `area_id` varchar(255) DEFAULT NULL,
  `area_name` varchar(60) NOT NULL,
  `area_gid` varchar(60) NOT NULL,
  `area_level` int(11) DEFAULT '0',
  `area_map` varchar(60) DEFAULT NULL,
  `area_block` longtext,
  `area_global` tinyint(1) NOT NULL DEFAULT '0',
  `data_exist` tinyint(1) DEFAULT '0',
  `areashortname` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`area_nid`),
  KEY `area_nid` (`area_nid`),
  UNIQUE KEY `dmuniq_area_id` (`area_id`),
  KEY `idx_area_name` (`area_name`),
  KEY `idx_area_parent_nid` (`area_parent_nid`),
  KEY `idx_area_level` (`area_level`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_latlong` */

DROP TABLE IF EXISTS `ut_area_latlong`;

CREATE TABLE `ut_area_latlong` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `area_id` varchar(255) DEFAULT NULL,
  `area_nid` int(11) DEFAULT NULL,
  `area_lat` varchar(100) DEFAULT NULL,
  `area_long` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `modified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `area_id` (`area_id`),
  KEY `area_nid` (`area_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_assistant_topic_en` */

DROP TABLE IF EXISTS `ut_assistant_topic_en`;

CREATE TABLE `ut_assistant_topic_en` (
  `topic_nid` int(11) NOT NULL AUTO_INCREMENT,
  `topic_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(255) DEFAULT NULL,
  `topic_intro` longtext,
  PRIMARY KEY (`topic_nid`),
  KEY `indicator_gid` (`indicator_gid`),
  KEY `topic_nid` (`topic_nid`),
  KEY `topic_name` (`topic_name`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_assistant_ebook_en` */

DROP TABLE IF EXISTS `ut_assistant_ebook_en`;

CREATE TABLE `ut_assistant_ebook_en` (
  `ebook_nid` int(11) NOT NULL AUTO_INCREMENT,
  `ebook` longblob,
  PRIMARY KEY (`ebook_nid`),
  KEY `ebook_nid` (`ebook_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_assistant_en` */

DROP TABLE IF EXISTS `ut_assistant_en`;

CREATE TABLE `ut_assistant_en` (
  `assistant_nid` int(11) NOT NULL AUTO_INCREMENT,
  `topic_nid` int(11) NOT NULL DEFAULT '0',
  `assistant` longtext NOT NULL,
  `assistant_type` varchar(3) NOT NULL,
  `assistant_order` int(11) DEFAULT '0',
  PRIMARY KEY (`assistant_nid`),
  KEY `assistant_type` (`assistant_type`),
  KEY `assistant_nid` (`assistant_nid`),
  KEY `topic_nid` (`topic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_cf_flowchart` */

DROP TABLE IF EXISTS `ut_cf_flowchart`;

CREATE TABLE `ut_cf_flowchart` (
  `cf_flowchart_nid` int(11) NOT NULL AUTO_INCREMENT,
  `cf_flowchart` longtext,
  PRIMARY KEY (`cf_flowchart_nid`),
  KEY `cf_flowchart_nid` (`cf_flowchart_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_dbmetadata_en` */

DROP TABLE IF EXISTS `ut_dbmetadata_en`;

CREATE TABLE `ut_dbmetadata_en` (
  `dbmtd_nid` int(11) NOT NULL AUTO_INCREMENT,
  `dbmtd_desc` longtext,
  `dbmtd_pubname` varchar(50) DEFAULT NULL,
  `dbmtd_pubdate` datetime DEFAULT NULL,
  `dbmtd_pubcountry` varchar(50) DEFAULT NULL,
  `dbmtd_pubregion` varchar(50) DEFAULT NULL,
  `dbmtd_puboffice` varchar(50) DEFAULT NULL,
  `dbmtd_areacnt` double DEFAULT NULL,
  `dbmtd_indcnt` double DEFAULT NULL,
  `dbmtd_iuscnt` double DEFAULT NULL,
  `dbmtd_timecnt` double DEFAULT NULL,
  `dbmtd_srccnt` double DEFAULT NULL,
  `dbmtd_datacnt` double DEFAULT NULL,
  PRIMARY KEY (`dbmtd_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_dbmetadata_fr` */

DROP TABLE IF EXISTS `ut_dbmetadata_fr`;

CREATE TABLE `ut_dbmetadata_fr` (
  `dbmtd_nid` int(11) NOT NULL AUTO_INCREMENT,
  `dbmtd_desc` longtext,
  `dbmtd_pubname` varchar(50) DEFAULT NULL,
  `dbmtd_pubdate` datetime DEFAULT NULL,
  `dbmtd_pubcountry` varchar(50) DEFAULT NULL,
  `dbmtd_pubregion` varchar(50) DEFAULT NULL,
  `dbmtd_puboffice` varchar(50) DEFAULT NULL,
  `dbmtd_areacnt` double DEFAULT NULL,
  `dbmtd_indcnt` double DEFAULT NULL,
  `dbmtd_iuscnt` double DEFAULT NULL,
  `dbmtd_timecnt` double DEFAULT NULL,
  `dbmtd_srccnt` double DEFAULT NULL,
  `dbmtd_datacnt` double DEFAULT NULL,
  PRIMARY KEY (`dbmtd_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_dbmetadata_ar` */

DROP TABLE IF EXISTS `ut_dbmetadata_ar`;

CREATE TABLE `ut_dbmetadata_ar` (
  `dbmtd_nid` int(11) NOT NULL AUTO_INCREMENT,
  `dbmtd_desc` longtext,
  `dbmtd_pubname` varchar(50) DEFAULT NULL,
  `dbmtd_pubdate` datetime DEFAULT NULL,
  `dbmtd_pubcountry` varchar(50) DEFAULT NULL,
  `dbmtd_pubregion` varchar(50) DEFAULT NULL,
  `dbmtd_puboffice` varchar(50) DEFAULT NULL,
  `dbmtd_areacnt` double DEFAULT NULL,
  `dbmtd_indcnt` double DEFAULT NULL,
  `dbmtd_iuscnt` double DEFAULT NULL,
  `dbmtd_timecnt` double DEFAULT NULL,
  `dbmtd_srccnt` double DEFAULT NULL,
  `dbmtd_datacnt` double DEFAULT NULL,
  PRIMARY KEY (`dbmtd_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_dbmetadata_es` */

DROP TABLE IF EXISTS `ut_dbmetadata_es`;

CREATE TABLE `ut_dbmetadata_es` (
  `dbmtd_nid` int(11) NOT NULL AUTO_INCREMENT,
  `dbmtd_desc` longtext,
  `dbmtd_pubname` varchar(50) DEFAULT NULL,
  `dbmtd_pubdate` datetime DEFAULT NULL,
  `dbmtd_pubcountry` varchar(50) DEFAULT NULL,
  `dbmtd_pubregion` varchar(50) DEFAULT NULL,
  `dbmtd_puboffice` varchar(50) DEFAULT NULL,
  `dbmtd_areacnt` double DEFAULT NULL,
  `dbmtd_indcnt` double DEFAULT NULL,
  `dbmtd_iuscnt` double DEFAULT NULL,
  `dbmtd_timecnt` double DEFAULT NULL,
  `dbmtd_srccnt` double DEFAULT NULL,
  `dbmtd_datacnt` double DEFAULT NULL,
  PRIMARY KEY (`dbmtd_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_dbmetadata_ru` */

DROP TABLE IF EXISTS `ut_dbmetadata_ru`;

CREATE TABLE `ut_dbmetadata_ru` (
  `dbmtd_nid` int(11) NOT NULL AUTO_INCREMENT,
  `dbmtd_desc` longtext,
  `dbmtd_pubname` varchar(50) DEFAULT NULL,
  `dbmtd_pubdate` datetime DEFAULT NULL,
  `dbmtd_pubcountry` varchar(50) DEFAULT NULL,
  `dbmtd_pubregion` varchar(50) DEFAULT NULL,
  `dbmtd_puboffice` varchar(50) DEFAULT NULL,
  `dbmtd_areacnt` double DEFAULT NULL,
  `dbmtd_indcnt` double DEFAULT NULL,
  `dbmtd_iuscnt` double DEFAULT NULL,
  `dbmtd_timecnt` double DEFAULT NULL,
  `dbmtd_srccnt` double DEFAULT NULL,
  `dbmtd_datacnt` double DEFAULT NULL,
  PRIMARY KEY (`dbmtd_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_data` */

DROP TABLE IF EXISTS `ut_data`;

CREATE TABLE `ut_data` (
  `data_nid` int(11) NOT NULL AUTO_INCREMENT,
  `iusnid` int(11) DEFAULT '0',
  `timeperiod_nid` int(11) DEFAULT '0',
  `area_nid` int(11) DEFAULT '0',
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `data_denominator` int(11) DEFAULT '0',
  `footnote_nid` int(11) DEFAULT '0',
  `source_nid` int(11) DEFAULT '0',
  `indicator_nid` double DEFAULT NULL,
  `unit_nid` double DEFAULT NULL,
  `subgroup_val_nid` double DEFAULT NULL,
  `ic_ius_order` double DEFAULT NULL,
  `textual_data_value` longtext DEFAULT NULL,
  `istextualdata` tinyint(1) DEFAULT '0',
  `ismrd` tinyint(1) DEFAULT '0',
  `isplannedvalue` tinyint(1) DEFAULT '0',
  `iunid` varchar(255) DEFAULT NULL,
  `confidenceintervalupper` double DEFAULT NULL,
  `confidenceintervallower` double DEFAULT NULL,
  `multiplesource` tinyint(1) DEFAULT '0',
  `data_value` double DEFAULT NULL,
  PRIMARY KEY (`data_nid`),
  UNIQUE KEY `dmuniq_tp_area_src_ius` (`iusnid`, `timeperiod_nid`, `area_nid`, `source_nid`),
  KEY `area_nid` (`area_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `area_nid_2` (`area_nid`),
  KEY `iusnid` (`iusnid`),
  KEY `iusnid_2` (`iusnid`),
  KEY `data_nid` (`data_nid`),
  KEY `source_nid` (`source_nid`),
  KEY `timeperiod_nid` (`timeperiod_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_database_log` */

DROP TABLE IF EXISTS `ut_database_log`;

CREATE TABLE `ut_database_log` (
  `db_nid` int(11) NOT NULL AUTO_INCREMENT,
  `db_timestamp` datetime DEFAULT NULL,
  `db_name` varchar(255) DEFAULT NULL,
  `db_action` varchar(50) DEFAULT NULL,
  `db_user` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`db_nid`),
  KEY `db_nid` (`db_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_document` */

DROP TABLE IF EXISTS `ut_document`;

CREATE TABLE `ut_document` (
  `document_nid` int(11) NOT NULL AUTO_INCREMENT,
  `document_type` varchar(4) DEFAULT NULL,
  `element_type` varchar(2) DEFAULT NULL,
  `element_nid` double DEFAULT NULL,
  `element_document` longblob,
  PRIMARY KEY (`document_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_element_xslt` */

DROP TABLE IF EXISTS `ut_element_xslt`;

CREATE TABLE `ut_element_xslt` (
  `element_xslt_nid` int(11) NOT NULL AUTO_INCREMENT,
  `element_nid` int(11) DEFAULT '0',
  `element_type` varchar(50) DEFAULT NULL,
  `xslt_nid` int(11) DEFAULT '0',
  PRIMARY KEY (`element_xslt_nid`),
  KEY `element_nid` (`element_nid`),
  KEY `element_xslt_nid` (`element_xslt_nid`),
  KEY `xslt_nid` (`xslt_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_footnote_en` */

DROP TABLE IF EXISTS `ut_footnote_en`;

CREATE TABLE `ut_footnote_en` (
  `footnote_nid` int(11) NOT NULL AUTO_INCREMENT,
  `footnote` longtext,
  `footnote_gid` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`footnote_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `footnote_gid` (`footnote_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_footnote_fr` */

DROP TABLE IF EXISTS `ut_footnote_fr`;

CREATE TABLE `ut_footnote_fr` (
  `footnote_nid` int(11) NOT NULL AUTO_INCREMENT,
  `footnote` longtext,
  `footnote_gid` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`footnote_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `footnote_gid` (`footnote_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_footnote_ar` */

DROP TABLE IF EXISTS `ut_footnote_ar`;

CREATE TABLE `ut_footnote_ar` (
  `footnote_nid` int(11) NOT NULL AUTO_INCREMENT,
  `footnote` longtext,
  `footnote_gid` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`footnote_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `footnote_gid` (`footnote_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_footnote_es` */

DROP TABLE IF EXISTS `ut_footnote_es`;

CREATE TABLE `ut_footnote_es` (
  `footnote_nid` int(11) NOT NULL AUTO_INCREMENT,
  `footnote` longtext,
  `footnote_gid` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`footnote_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `footnote_gid` (`footnote_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_footnote_ru` */

DROP TABLE IF EXISTS `ut_footnote_ru`;

CREATE TABLE `ut_footnote_ru` (
  `footnote_nid` int(11) NOT NULL AUTO_INCREMENT,
  `footnote` longtext,
  `footnote_gid` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`footnote_nid`),
  KEY `footnote_nid` (`footnote_nid`),
  KEY `footnote_gid` (`footnote_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_icons` */

DROP TABLE IF EXISTS `ut_icons`;

CREATE TABLE `ut_icons` (
  `icon_nid` int(11) NOT NULL AUTO_INCREMENT,
  `icon_type` varchar(3) DEFAULT NULL,
  `icon_dim_w` int(11) DEFAULT '0',
  `icon_dim_h` int(11) DEFAULT '0',
  `element_type` varchar(2) DEFAULT NULL,
  `element_nid` int(11) DEFAULT '0',
  `element_icon` longblob,
  PRIMARY KEY (`icon_nid`),
  KEY `icon_nid` (`icon_nid`),
  KEY `element_nid` (`element_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_classifications_en` */

DROP TABLE IF EXISTS `ut_indicator_classifications_en`;

CREATE TABLE `ut_indicator_classifications_en` (
  `ic_nid` int(11) NOT NULL,
  `ic_parent_nid` int(11) NOT NULL DEFAULT '0',
  `ic_gid` varchar(60) DEFAULT NULL,
  `ic_name` longtext NOT NULL,
  `ic_global` tinyint(1) NOT NULL DEFAULT '0',
  `ic_info` longtext,
  `ic_type` varchar(2) DEFAULT NULL,
  `ic_short_name` varchar(50) DEFAULT NULL,
  `publisher` varchar(100) DEFAULT NULL,
  `title` longtext,
  `diyear` varchar(10) DEFAULT NULL,
  `sourcelink1` varchar(255) DEFAULT NULL,
  `sourcelink2` varchar(255) DEFAULT NULL,
  `ic_order` int(11) DEFAULT NULL,
  `isbn` varchar(255) DEFAULT NULL,
  `nature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_nid`),
  KEY `ic_nid` (`ic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_classifications_fr` */

DROP TABLE IF EXISTS `ut_indicator_classifications_fr`;

CREATE TABLE `ut_indicator_classifications_fr` (
  `ic_nid` int(11) NOT NULL,
  `ic_parent_nid` int(11) NOT NULL DEFAULT '0',
  `ic_gid` varchar(60) DEFAULT NULL,
  `ic_name` longtext NOT NULL,
  `ic_global` tinyint(1) NOT NULL DEFAULT '0',
  `ic_info` longtext,
  `ic_type` varchar(2) DEFAULT NULL,
  `ic_short_name` varchar(50) DEFAULT NULL,
  `publisher` varchar(100) DEFAULT NULL,
  `title` longtext,
  `diyear` varchar(10) DEFAULT NULL,
  `sourcelink1` varchar(255) DEFAULT NULL,
  `sourcelink2` varchar(255) DEFAULT NULL,
  `ic_order` int(11) DEFAULT NULL,
  `isbn` varchar(255) DEFAULT NULL,
  `nature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_nid`),
  KEY `ic_nid` (`ic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_classifications_ar` */

DROP TABLE IF EXISTS `ut_indicator_classifications_ar`;

CREATE TABLE `ut_indicator_classifications_ar` (
  `ic_nid` int(11) NOT NULL,
  `ic_parent_nid` int(11) NOT NULL DEFAULT '0',
  `ic_gid` varchar(60) DEFAULT NULL,
  `ic_name` longtext NOT NULL,
  `ic_global` tinyint(1) NOT NULL DEFAULT '0',
  `ic_info` longtext,
  `ic_type` varchar(2) DEFAULT NULL,
  `ic_short_name` varchar(50) DEFAULT NULL,
  `publisher` varchar(100) DEFAULT NULL,
  `title` longtext,
  `diyear` varchar(10) DEFAULT NULL,
  `sourcelink1` varchar(255) DEFAULT NULL,
  `sourcelink2` varchar(255) DEFAULT NULL,
  `ic_order` int(11) DEFAULT NULL,
  `isbn` varchar(255) DEFAULT NULL,
  `nature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_nid`),
  KEY `ic_nid` (`ic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_classifications_es` */

DROP TABLE IF EXISTS `ut_indicator_classifications_es`;

CREATE TABLE `ut_indicator_classifications_es` (
  `ic_nid` int(11) NOT NULL,
  `ic_parent_nid` int(11) NOT NULL DEFAULT '0',
  `ic_gid` varchar(60) DEFAULT NULL,
  `ic_name` longtext NOT NULL,
  `ic_global` tinyint(1) NOT NULL DEFAULT '0',
  `ic_info` longtext,
  `ic_type` varchar(2) DEFAULT NULL,
  `ic_short_name` varchar(50) DEFAULT NULL,
  `publisher` varchar(100) DEFAULT NULL,
  `title` longtext,
  `diyear` varchar(10) DEFAULT NULL,
  `sourcelink1` varchar(255) DEFAULT NULL,
  `sourcelink2` varchar(255) DEFAULT NULL,
  `ic_order` int(11) DEFAULT NULL,
  `isbn` varchar(255) DEFAULT NULL,
  `nature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_nid`),
  KEY `ic_nid` (`ic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_classifications_ru` */

DROP TABLE IF EXISTS `ut_indicator_classifications_ru`;

CREATE TABLE `ut_indicator_classifications_ru` (
  `ic_nid` int(11) NOT NULL,
  `ic_parent_nid` int(11) NOT NULL DEFAULT '0',
  `ic_gid` varchar(60) DEFAULT NULL,
  `ic_name` longtext NOT NULL,
  `ic_global` tinyint(1) NOT NULL DEFAULT '0',
  `ic_info` longtext,
  `ic_type` varchar(2) DEFAULT NULL,
  `ic_short_name` varchar(50) DEFAULT NULL,
  `publisher` varchar(100) DEFAULT NULL,
  `title` longtext,
  `diyear` varchar(10) DEFAULT NULL,
  `sourcelink1` varchar(255) DEFAULT NULL,
  `sourcelink2` varchar(255) DEFAULT NULL,
  `ic_order` int(11) DEFAULT NULL,
  `isbn` varchar(255) DEFAULT NULL,
  `nature` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_nid`),
  KEY `ic_nid` (`ic_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_unit_subgroup` */

DROP TABLE IF EXISTS `ut_indicator_unit_subgroup`;

CREATE TABLE `ut_indicator_unit_subgroup` (
  `iusnid` int(11) NOT NULL AUTO_INCREMENT,
  `indicator_nid` int(11) DEFAULT '0',
  `unit_nid` int(11) DEFAULT '0',
  `subgroup_val_nid` int(11) DEFAULT '0',
  `min_value` double DEFAULT '0',
  `max_value` double DEFAULT '0',
  `subgroup_nids` varchar(50) DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `isdefaultsubgroup` tinyint(1) DEFAULT '0',
  `avlmindatavalue` double DEFAULT NULL,
  `avlmaxdatavalue` double DEFAULT NULL,
  `avlmintimeperiod` varchar(60) DEFAULT NULL,
  `avlmaxtimeperiod` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`iusnid`),
  UNIQUE KEY `dmuniq_ius_nid` (`indicator_nid`, `unit_nid`, `subgroup_val_nid`),
  KEY `indicator_nid` (`indicator_nid`),
  KEY `iusnid` (`iusnid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_en` */

DROP TABLE IF EXISTS `ut_indicator_en`;

CREATE TABLE `ut_indicator_en` (
  `indicator_nid` int(11) NOT NULL,
  `indicator_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(60) DEFAULT NULL,
  `indicator_info` longtext,
  `indicator_global` tinyint(1) NOT NULL DEFAULT '0',
  `short_name` varchar(50) DEFAULT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `indicator_order` double DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `highisgood` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`indicator_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_fr` */

DROP TABLE IF EXISTS `ut_indicator_fr`;

CREATE TABLE `ut_indicator_fr` (
  `indicator_nid` int(11) NOT NULL,
  `indicator_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(60) DEFAULT NULL,
  `indicator_info` longtext,
  `indicator_global` tinyint(1) NOT NULL DEFAULT '0',
  `short_name` varchar(50) DEFAULT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `indicator_order` double DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `highisgood` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`indicator_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_ar` */

DROP TABLE IF EXISTS `ut_indicator_ar`;

CREATE TABLE `ut_indicator_ar` (
  `indicator_nid` int(11) NOT NULL,
  `indicator_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(60) DEFAULT NULL,
  `indicator_info` longtext,
  `indicator_global` tinyint(1) NOT NULL DEFAULT '0',
  `short_name` varchar(50) DEFAULT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `indicator_order` double DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `highisgood` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`indicator_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_es` */

DROP TABLE IF EXISTS `ut_indicator_es`;

CREATE TABLE `ut_indicator_es` (
  `indicator_nid` int(11) NOT NULL,
  `indicator_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(60) DEFAULT NULL,
  `indicator_info` longtext,
  `indicator_global` tinyint(1) NOT NULL DEFAULT '0',
  `short_name` varchar(50) DEFAULT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `indicator_order` double DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `highisgood` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`indicator_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_indicator_ru` */

DROP TABLE IF EXISTS `ut_indicator_ru`;

CREATE TABLE `ut_indicator_ru` (
  `indicator_nid` int(11) NOT NULL,
  `indicator_name` varchar(255) NOT NULL,
  `indicator_gid` varchar(60) DEFAULT NULL,
  `indicator_info` longtext,
  `indicator_global` tinyint(1) NOT NULL DEFAULT '0',
  `short_name` varchar(50) DEFAULT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `indicator_order` double DEFAULT NULL,
  `data_exist` tinyint(1) DEFAULT '0',
  `highisgood` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`indicator_nid`),
  KEY `indicator_nid` (`indicator_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_language` */

DROP TABLE IF EXISTS `ut_language`;

CREATE TABLE `ut_language` (
  `language_nid` int(11) NOT NULL AUTO_INCREMENT,
  `language_name` varchar(50) DEFAULT NULL,
  `language_code` varchar(50) DEFAULT NULL,
  `language_default` tinyint(1) DEFAULT '0',
  `language_globallock` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`language_nid`),
  KEY `language_code` (`language_code`),
  KEY `language_nid` (`language_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadata_category_en` */

DROP TABLE IF EXISTS `ut_metadata_category_en`;

CREATE TABLE `ut_metadata_category_en` (
  `categorynid` int(11) NOT NULL AUTO_INCREMENT,
  `categoryname` varchar(255) DEFAULT NULL,
  `categorytype` varchar(2) DEFAULT NULL,
  `categoryorder` int(11) DEFAULT NULL,
  `parentcategorynid` double DEFAULT NULL,
  `categorygid` longtext,
  `categorydescription` longtext,
  `ispresentational` tinyint(1) DEFAULT '0',
  `ismandatory` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`categorynid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadata_category_fr` */

DROP TABLE IF EXISTS `ut_metadata_category_fr`;

CREATE TABLE `ut_metadata_category_fr` (
  `categorynid` int(11) NOT NULL AUTO_INCREMENT,
  `categoryname` varchar(255) DEFAULT NULL,
  `categorytype` varchar(2) DEFAULT NULL,
  `categoryorder` int(11) DEFAULT NULL,
  `parentcategorynid` double DEFAULT NULL,
  `categorygid` longtext,
  `categorydescription` longtext,
  `ispresentational` tinyint(1) DEFAULT '0',
  `ismandatory` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`categorynid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadata_category_ar` */

DROP TABLE IF EXISTS `ut_metadata_category_ar`;

CREATE TABLE `ut_metadata_category_ar` (
  `categorynid` int(11) NOT NULL AUTO_INCREMENT,
  `categoryname` varchar(255) DEFAULT NULL,
  `categorytype` varchar(2) DEFAULT NULL,
  `categoryorder` int(11) DEFAULT NULL,
  `parentcategorynid` double DEFAULT NULL,
  `categorygid` longtext,
  `categorydescription` longtext,
  `ispresentational` tinyint(1) DEFAULT '0',
  `ismandatory` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`categorynid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadata_category_es` */

DROP TABLE IF EXISTS `ut_metadata_category_es`;

CREATE TABLE `ut_metadata_category_es` (
  `categorynid` int(11) NOT NULL AUTO_INCREMENT,
  `categoryname` varchar(255) DEFAULT NULL,
  `categorytype` varchar(2) DEFAULT NULL,
  `categoryorder` int(11) DEFAULT NULL,
  `parentcategorynid` double DEFAULT NULL,
  `categorygid` longtext,
  `categorydescription` longtext,
  `ispresentational` tinyint(1) DEFAULT '0',
  `ismandatory` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`categorynid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadata_category_ru` */

DROP TABLE IF EXISTS `ut_metadata_category_ru`;

CREATE TABLE `ut_metadata_category_ru` (
  `categorynid` int(11) NOT NULL AUTO_INCREMENT,
  `categoryname` varchar(255) DEFAULT NULL,
  `categorytype` varchar(2) DEFAULT NULL,
  `categoryorder` int(11) DEFAULT NULL,
  `parentcategorynid` double DEFAULT NULL,
  `categorygid` longtext,
  `categorydescription` longtext,
  `ispresentational` tinyint(1) DEFAULT '0',
  `ismandatory` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`categorynid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_notes_classification_en` */

DROP TABLE IF EXISTS `ut_notes_classification_en`;

CREATE TABLE `ut_notes_classification_en` (
  `classification_nid` int(11) NOT NULL AUTO_INCREMENT,
  `classification_name` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`classification_nid`),
  KEY `classification_nid` (`classification_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_notes_data` */

DROP TABLE IF EXISTS `ut_notes_data`;

CREATE TABLE `ut_notes_data` (
  `notes_data_nid` int(11) NOT NULL AUTO_INCREMENT,
  `data_nid` int(11) DEFAULT '0',
  `notes_nid` int(11) DEFAULT '0',
  PRIMARY KEY (`notes_data_nid`),
  KEY `notes_data_nid` (`notes_data_nid`),
  KEY `data_nid` (`data_nid`),
  KEY `notes_nid` (`notes_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_notes_profile` */

DROP TABLE IF EXISTS `ut_notes_profile`;

CREATE TABLE `ut_notes_profile` (
  `profile_nid` int(11) NOT NULL AUTO_INCREMENT,
  `profile_name` varchar(100) DEFAULT NULL,
  `profile_email` varchar(150) DEFAULT NULL,
  `profile_country` varchar(100) DEFAULT NULL,
  `profile_org` varchar(100) DEFAULT NULL,
  `profile_org_type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`profile_nid`),
  KEY `profile_nid` (`profile_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_notes_en` */

DROP TABLE IF EXISTS `ut_notes_en`;

CREATE TABLE `ut_notes_en` (
  `notes_nid` int(11) NOT NULL AUTO_INCREMENT,
  `profile_nid` int(11) DEFAULT '0',
  `classification_nid` int(11) DEFAULT '0',
  `notes` longtext,
  `notes_datetime` datetime DEFAULT NULL,
  `notes_approved` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`notes_nid`),
  KEY `classification_nid` (`classification_nid`),
  KEY `notes_nid` (`notes_nid`),
  KEY `profile_nid` (`profile_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_recommendedsources_en` */

DROP TABLE IF EXISTS `ut_recommendedsources_en`;

CREATE TABLE `ut_recommendedsources_en` (
  `rsrc_nid` int(11) NOT NULL AUTO_INCREMENT,
  `data_nid` int(11) DEFAULT NULL,
  `ic_ius_label` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`rsrc_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_type_en` */

DROP TABLE IF EXISTS `ut_subgroup_type_en`;

CREATE TABLE `ut_subgroup_type_en` (
  `subgroup_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_type_name` varchar(128) DEFAULT NULL,
  `subgroup_type_gid` varchar(60) DEFAULT NULL,
  `subgroup_type_order` double DEFAULT NULL,
  `subgroup_type_global` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`subgroup_type_nid`),
  UNIQUE KEY `dmuniq_sgt_gid` (`subgroup_type_gid`),
  UNIQUE KEY `dmuniq_sgt_name` (`subgroup_type_name`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_type_fr` */

DROP TABLE IF EXISTS `ut_subgroup_type_fr`;

CREATE TABLE `ut_subgroup_type_fr` (
  `subgroup_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_type_name` varchar(128) DEFAULT NULL,
  `subgroup_type_gid` varchar(60) DEFAULT NULL,
  `subgroup_type_order` double DEFAULT NULL,
  `subgroup_type_global` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`subgroup_type_nid`),
  UNIQUE KEY `dmuniq_sgt_gid` (`subgroup_type_gid`),
  UNIQUE KEY `dmuniq_sgt_name` (`subgroup_type_name`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_type_ar` */

DROP TABLE IF EXISTS `ut_subgroup_type_ar`;

CREATE TABLE `ut_subgroup_type_ar` (
  `subgroup_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_type_name` varchar(128) DEFAULT NULL,
  `subgroup_type_gid` varchar(60) DEFAULT NULL,
  `subgroup_type_order` double DEFAULT NULL,
  `subgroup_type_global` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`subgroup_type_nid`),
  UNIQUE KEY `dmuniq_sgt_gid` (`subgroup_type_gid`),
  UNIQUE KEY `dmuniq_sgt_name` (`subgroup_type_name`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_type_es` */

DROP TABLE IF EXISTS `ut_subgroup_type_es`;

CREATE TABLE `ut_subgroup_type_es` (
  `subgroup_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_type_name` varchar(128) DEFAULT NULL,
  `subgroup_type_gid` varchar(60) DEFAULT NULL,
  `subgroup_type_order` double DEFAULT NULL,
  `subgroup_type_global` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`subgroup_type_nid`),
  UNIQUE KEY `dmuniq_sgt_gid` (`subgroup_type_gid`),
  UNIQUE KEY `dmuniq_sgt_name` (`subgroup_type_name`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_type_ru` */

DROP TABLE IF EXISTS `ut_subgroup_type_ru`;

CREATE TABLE `ut_subgroup_type_ru` (
  `subgroup_type_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_type_name` varchar(128) DEFAULT NULL,
  `subgroup_type_gid` varchar(60) DEFAULT NULL,
  `subgroup_type_order` double DEFAULT NULL,
  `subgroup_type_global` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`subgroup_type_nid`),
  UNIQUE KEY `dmuniq_sgt_gid` (`subgroup_type_gid`),
  UNIQUE KEY `dmuniq_sgt_name` (`subgroup_type_name`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_subgroup` */

DROP TABLE IF EXISTS `ut_subgroup_vals_subgroup`;

CREATE TABLE `ut_subgroup_vals_subgroup` (
  `subgroup_val_subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_val_nid` int(11) DEFAULT NULL,
  `subgroup_nid` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_subgroup_nid`),
  UNIQUE KEY `dmuniq_sgvalsg` (`subgroup_val_nid`, `subgroup_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_en` */

DROP TABLE IF EXISTS `ut_subgroup_vals_en`;

CREATE TABLE `ut_subgroup_vals_en` (
  `subgroup_val_nid` int(11) NOT NULL,
  `subgroup_val` varchar(255) DEFAULT NULL,
  `subgroup_val_gid` varchar(50) DEFAULT NULL,
  `subgroup_val_global` tinyint(1) DEFAULT '0',
  `subgroup_val_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_nid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_fr` */

DROP TABLE IF EXISTS `ut_subgroup_vals_fr`;

CREATE TABLE `ut_subgroup_vals_fr` (
  `subgroup_val_nid` int(11) NOT NULL,
  `subgroup_val` varchar(255) DEFAULT NULL,
  `subgroup_val_gid` varchar(50) DEFAULT NULL,
  `subgroup_val_global` tinyint(1) DEFAULT '0',
  `subgroup_val_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_nid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_ar` */

DROP TABLE IF EXISTS `ut_subgroup_vals_ar`;

CREATE TABLE `ut_subgroup_vals_ar` (
  `subgroup_val_nid` int(11) NOT NULL,
  `subgroup_val` varchar(255) DEFAULT NULL,
  `subgroup_val_gid` varchar(50) DEFAULT NULL,
  `subgroup_val_global` tinyint(1) DEFAULT '0',
  `subgroup_val_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_nid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_es` */

DROP TABLE IF EXISTS `ut_subgroup_vals_es`;

CREATE TABLE `ut_subgroup_vals_es` (
  `subgroup_val_nid` int(11) NOT NULL,
  `subgroup_val` varchar(255) DEFAULT NULL,
  `subgroup_val_gid` varchar(50) DEFAULT NULL,
  `subgroup_val_global` tinyint(1) DEFAULT '0',
  `subgroup_val_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_nid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_vals_ru` */

DROP TABLE IF EXISTS `ut_subgroup_vals_ru`;

CREATE TABLE `ut_subgroup_vals_ru` (
  `subgroup_val_nid` int(11) NOT NULL,
  `subgroup_val` varchar(255) DEFAULT NULL,
  `subgroup_val_gid` varchar(50) DEFAULT NULL,
  `subgroup_val_global` tinyint(1) DEFAULT '0',
  `subgroup_val_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_val_nid`),
  KEY `subgroup_val_nid` (`subgroup_val_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_en` */

DROP TABLE IF EXISTS `ut_subgroup_en`;

CREATE TABLE `ut_subgroup_en` (
  `subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_name` varchar(128) NOT NULL,
  `subgroup_gid` varchar(255) DEFAULT NULL,
  `subgroup_global` tinyint(1) NOT NULL DEFAULT '0',
  `subgroup_type` int(11) NOT NULL DEFAULT '0',
  `subgroup_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_nid`),
  UNIQUE KEY `dmuniq_sg_gid` (`subgroup_gid`),
  KEY `subgroup_nid` (`subgroup_nid`),
  KEY `subgroup_gid` (`subgroup_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_fr` */

DROP TABLE IF EXISTS `ut_subgroup_fr`;

CREATE TABLE `ut_subgroup_fr` (
  `subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_name` varchar(128) NOT NULL,
  `subgroup_gid` varchar(255) DEFAULT NULL,
  `subgroup_global` tinyint(1) NOT NULL DEFAULT '0',
  `subgroup_type` int(11) NOT NULL DEFAULT '0',
  `subgroup_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_nid`),
  UNIQUE KEY `dmuniq_sg_gid` (`subgroup_gid`),
  KEY `subgroup_nid` (`subgroup_nid`),
  KEY `subgroup_gid` (`subgroup_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_ar` */

DROP TABLE IF EXISTS `ut_subgroup_ar`;

CREATE TABLE `ut_subgroup_ar` (
  `subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_name` varchar(128) NOT NULL,
  `subgroup_gid` varchar(255) DEFAULT NULL,
  `subgroup_global` tinyint(1) NOT NULL DEFAULT '0',
  `subgroup_type` int(11) NOT NULL DEFAULT '0',
  `subgroup_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_nid`),
  UNIQUE KEY `dmuniq_sg_gid` (`subgroup_gid`),
  KEY `subgroup_nid` (`subgroup_nid`),
  KEY `subgroup_gid` (`subgroup_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_es` */

DROP TABLE IF EXISTS `ut_subgroup_es`;

CREATE TABLE `ut_subgroup_es` (
  `subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_name` varchar(128) NOT NULL,
  `subgroup_gid` varchar(255) DEFAULT NULL,
  `subgroup_global` tinyint(1) NOT NULL DEFAULT '0',
  `subgroup_type` int(11) NOT NULL DEFAULT '0',
  `subgroup_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_nid`),
  UNIQUE KEY `dmuniq_sg_gid` (`subgroup_gid`),
  KEY `subgroup_nid` (`subgroup_nid`),
  KEY `subgroup_gid` (`subgroup_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_subgroup_ru` */

DROP TABLE IF EXISTS `ut_subgroup_ru`;

CREATE TABLE `ut_subgroup_ru` (
  `subgroup_nid` int(11) NOT NULL AUTO_INCREMENT,
  `subgroup_name` varchar(128) NOT NULL,
  `subgroup_gid` varchar(255) DEFAULT NULL,
  `subgroup_global` tinyint(1) NOT NULL DEFAULT '0',
  `subgroup_type` int(11) NOT NULL DEFAULT '0',
  `subgroup_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`subgroup_nid`),
  UNIQUE KEY `dmuniq_sg_gid` (`subgroup_gid`),
  KEY `subgroup_nid` (`subgroup_nid`),
  KEY `subgroup_gid` (`subgroup_gid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_template_log` */

DROP TABLE IF EXISTS `ut_template_log`;

CREATE TABLE `ut_template_log` (
  `tpl_nid` int(11) NOT NULL AUTO_INCREMENT,
  `tpl_timestamp` datetime DEFAULT NULL,
  `tpl_name` varchar(255) DEFAULT NULL,
  `tpl_action` varchar(50) DEFAULT NULL,
  `tpl_user` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`tpl_nid`),
  KEY `tpl_nid` (`tpl_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_timeperiod` */

DROP TABLE IF EXISTS `ut_timeperiod`;

CREATE TABLE `ut_timeperiod` (
  `timeperiod_nid` int(11) NOT NULL AUTO_INCREMENT,
  `timeperiod` varchar(30) DEFAULT NULL,
  `startdate` datetime DEFAULT NULL,
  `enddate` datetime DEFAULT NULL,
  `periodicity` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`timeperiod_nid`),
  UNIQUE KEY `dmuniq_tp` (`timeperiod`),
  KEY `timeperiod_nid` (`timeperiod_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_unit_en` */

DROP TABLE IF EXISTS `ut_unit_en`;

CREATE TABLE `ut_unit_en` (
  `unit_nid` int(11) NOT NULL,
  `unit_name` varchar(128) NOT NULL,
  `unit_gid` varchar(60) DEFAULT NULL,
  `unit_global` tinyint(1) NOT NULL DEFAULT '0',
  `unit_format` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unit_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_unit_fr` */

DROP TABLE IF EXISTS `ut_unit_fr`;

CREATE TABLE `ut_unit_fr` (
  `unit_nid` int(11) NOT NULL,
  `unit_name` varchar(128) NOT NULL,
  `unit_gid` varchar(60) DEFAULT NULL,
  `unit_global` tinyint(1) NOT NULL DEFAULT '0',
  `unit_format` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unit_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_unit_ar` */

DROP TABLE IF EXISTS `ut_unit_ar`;

CREATE TABLE `ut_unit_ar` (
  `unit_nid` int(11) NOT NULL,
  `unit_name` varchar(128) NOT NULL,
  `unit_gid` varchar(60) DEFAULT NULL,
  `unit_global` tinyint(1) NOT NULL DEFAULT '0',
  `unit_format` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unit_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_unit_es` */

DROP TABLE IF EXISTS `ut_unit_es`;

CREATE TABLE `ut_unit_es` (
  `unit_nid` int(11) NOT NULL,
  `unit_name` varchar(128) NOT NULL,
  `unit_gid` varchar(60) DEFAULT NULL,
  `unit_global` tinyint(1) NOT NULL DEFAULT '0',
  `unit_format` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unit_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_unit_ru` */

DROP TABLE IF EXISTS `ut_unit_ru`;

CREATE TABLE `ut_unit_ru` (
  `unit_nid` int(11) NOT NULL,
  `unit_name` varchar(128) NOT NULL,
  `unit_gid` varchar(60) DEFAULT NULL,
  `unit_global` tinyint(1) NOT NULL DEFAULT '0',
  `unit_format` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`unit_nid`),
  KEY `unit_nid` (`unit_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_xslt` */

DROP TABLE IF EXISTS `ut_xslt`;

CREATE TABLE `ut_xslt` (
  `xslt_nid` int(11) NOT NULL AUTO_INCREMENT,
  `xslt_text` longtext,
  `xslt_file` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`xslt_nid`),
  KEY `xslt_nid` (`xslt_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_ic_ius` */

DROP TABLE IF EXISTS `ut_ic_ius`;

CREATE TABLE `ut_ic_ius` (
  `ic_iusnid` int(11) NOT NULL AUTO_INCREMENT,
  `ic_nid` int(11) DEFAULT NULL,
  `iusnid` int(11) DEFAULT NULL,
  `recommendedsource` tinyint(1) DEFAULT '0',
  `ic_ius_order` double DEFAULT NULL,
  `ic_ius_label` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ic_iusnid`),
  UNIQUE KEY `dmuniq_ic_iusnid` (`ic_nid`, `iusnid`),
  KEY `ic_iusnid` (`ic_iusnid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_area_map_layer` */

DROP TABLE IF EXISTS `ut_area_map_layer`;

CREATE TABLE `ut_area_map_layer` (
  `layer_nid` int(11) NOT NULL AUTO_INCREMENT,
  `layer_size` varchar(100) DEFAULT NULL,
  `layer_shp` blob,
  `layer_shx` blob,
  `layer_dbf` blob,
  `layer_type` int(11) DEFAULT '0',
  `minx` double DEFAULT '0',
  `miny` double DEFAULT '0',
  `maxx` double DEFAULT '0',
  `maxy` double DEFAULT '0',
  `start_date` datetime DEFAULT '0000-00-00 00:00:00',
  `end_date` datetime DEFAULT '0000-00-00 00:00:00',
  `metadata_nid` int(11) DEFAULT '0',
  `update_timestamp` datetime DEFAULT NULL,
  `map_geojson` longtext,
  PRIMARY KEY (`layer_nid`)
) ENGINE=MyISAM AUTO_INCREMENT=0 DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadatareport_en` */

DROP TABLE IF EXISTS `ut_metadatareport_en`;

CREATE TABLE `ut_metadatareport_en` (
  `metadatareport_nid` int(11) NOT NULL,
  `target_nid` int(11) DEFAULT NULL,
  `category_nid` int(11) DEFAULT NULL,
  `metadata` longtext,
  PRIMARY KEY (`metadatareport_nid`),
  KEY `metadatareport_nid` (`metadatareport_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadatareport_fr` */

DROP TABLE IF EXISTS `ut_metadatareport_fr`;

CREATE TABLE `ut_metadatareport_fr` (
  `metadatareport_nid` int(11) NOT NULL,
  `target_nid` int(11) DEFAULT NULL,
  `category_nid` int(11) DEFAULT NULL,
  `metadata` longtext,
  PRIMARY KEY (`metadatareport_nid`),
  KEY `metadatareport_nid` (`metadatareport_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadatareport_ar` */

DROP TABLE IF EXISTS `ut_metadatareport_ar`;

CREATE TABLE `ut_metadatareport_ar` (
  `metadatareport_nid` int(11) NOT NULL,
  `target_nid` int(11) DEFAULT NULL,
  `category_nid` int(11) DEFAULT NULL,
  `metadata` longtext,
  PRIMARY KEY (`metadatareport_nid`),
  KEY `metadatareport_nid` (`metadatareport_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadatareport_es` */

DROP TABLE IF EXISTS `ut_metadatareport_es`;

CREATE TABLE `ut_metadatareport_es` (
  `metadatareport_nid` int(11) NOT NULL,
  `target_nid` int(11) DEFAULT NULL,
  `category_nid` int(11) DEFAULT NULL,
  `metadata` longtext,
  PRIMARY KEY (`metadatareport_nid`),
  KEY `metadatareport_nid` (`metadatareport_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_metadatareport_ru` */

DROP TABLE IF EXISTS `ut_metadatareport_ru`;

CREATE TABLE `ut_metadatareport_ru` (
  `metadatareport_nid` int(11) NOT NULL,
  `target_nid` int(11) DEFAULT NULL,
  `category_nid` int(11) DEFAULT NULL,
  `metadata` longtext,
  PRIMARY KEY (`metadatareport_nid`),
  KEY `metadatareport_nid` (`metadatareport_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Table structure for table `ut_sdmxuser` */

DROP TABLE IF EXISTS `ut_sdmxuser`;

CREATE TABLE `ut_sdmxuser` (
  `sender_nid` int(11) NOT NULL AUTO_INCREMENT,
  `issender` tinyint(1) DEFAULT '0',
  `id` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `contactname` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `telephone` varchar(50) DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `fax` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`sender_nid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

/*Default Data for ut_language */
insert into `ut_language` (`language_nid`, `language_name`, `language_code`, `language_default`, `language_globallock`) values('1','di_english [en]','en','1','0');

/*Default Data for ut_footnote_en */
insert into `ut_footnote_en` (`footnote_nid`, `footnote`, `footnote_gid`) values('-1','','');

/*Set latest database version with indexes and lowercase */
insert into `db_version` (version_number, version_comments) values ('7.0.0.2', 'Database is generated in lowercase including table and columns');

/*Set def record in db metadata table */
insert into `ut_dbmetadata_en` (dbmtd_areacnt, dbmtd_indcnt, dbmtd_iuscnt, dbmtd_timecnt, dbmtd_srccnt, dbmtd_datacnt) values (0, 0, 0, 0, 0, 0);

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

