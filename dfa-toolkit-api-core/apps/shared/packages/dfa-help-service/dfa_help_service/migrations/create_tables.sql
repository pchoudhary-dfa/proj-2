-- SQL script to create DFA Help Service tables with "dfahelp_" prefix
-- This script can be run manually in your database management tool

-- Create dfahelp_adaptations table
CREATE TABLE IF NOT EXISTS `dfahelp_adaptations` (
    `id` BIGINT(20) AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(4) UNIQUE NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `desc` LONGTEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `dfahelp_adaptations_code_idx` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create dfahelp_adaptation_keys table
CREATE TABLE IF NOT EXISTS `dfahelp_adaptation_keys` (
    `id` BIGINT(20) AUTO_INCREMENT PRIMARY KEY,
    `adaptation_id` BIGINT(20) NOT NULL,
    `key` VARCHAR(255) UNIQUE NULL,
    `code` VARCHAR(255) NULL,
    `related_keys` LONGTEXT NULL,
    `parent_id` BIGINT(20) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (`adaptation_id`) REFERENCES `dfahelp_adaptations`(`id`) ON DELETE CASCADE,
    INDEX `dfahelp_adaptation_keys_adaptation_id_idx` (`adaptation_id`),
    INDEX `dfahelp_adaptation_keys_parent_id_idx` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create dfahelp_adaptation_keys_i18n table
CREATE TABLE IF NOT EXISTS `dfahelp_adaptation_keys_i18n` (
    `id` BIGINT(20) AUTO_INCREMENT PRIMARY KEY,
    `adaptation_key_id` BIGINT(20) NOT NULL,
    `locale` VARCHAR(3) NOT NULL,
    `title` VARCHAR(255) NULL,
    `desc` LONGTEXT NULL,
    `purpose` LONGTEXT NULL,
    FOREIGN KEY (`adaptation_key_id`) REFERENCES `dfahelp_adaptation_keys`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `dfahelp_adaptation_keys_i18n_key_locale_idx` (`adaptation_key_id`, `locale`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT INTO `dfahelp_adaptations` (`code`, `name`, `desc`) VALUES 
('BYD', 'DFA Dashboard', 'This is the description of DFA Monitoring.')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `desc` = VALUES(`desc`);

-- Get the adaptation ID for sample keys
SET @adaptation_id = (SELECT id FROM `dfahelp_adaptations` WHERE `code` = 'BYD' LIMIT 1);

-- Insert sample key
INSERT INTO `dfahelp_adaptation_keys` (`adaptation_id`, `key`, `code`, `related_keys`, `parent_id`) VALUES 
(@adaptation_id, 'sample_key', 'SAMPLE_CODE', '[]', NULL)
ON DUPLICATE KEY UPDATE `key` = VALUES(`key`), `code` = VALUES(`code`);

-- Get the key ID for sample i18n
SET @key_id = (SELECT id FROM `dfahelp_adaptation_keys` WHERE `key` = 'sample_key' LIMIT 1);

-- Insert sample i18n data
INSERT INTO `dfahelp_adaptation_keys_i18n` (`adaptation_key_id`, `locale`, `title`, `desc`, `purpose`) VALUES 
(@key_id, 'en', 'Sample Key Title', 'A sample key description in English', 'This key is used for testing purposes')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `desc` = VALUES(`desc`), `purpose` = VALUES(`purpose`);
