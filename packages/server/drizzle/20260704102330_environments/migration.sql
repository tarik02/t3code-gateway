CREATE TABLE `device_sessions` (
	`id` text PRIMARY KEY,
	`device_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`environment_session_id` text,
	`bearer_token_encrypted` blob NOT NULL,
	`scopes_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_device_sessions_environment_id_environments_environment_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`environment_id`) ON DELETE CASCADE,
	CONSTRAINT `device_sessions_device_id_environment_id_unique` UNIQUE(`device_id`,`environment_id`)
);
--> statement-breakpoint
CREATE TABLE `environments` (
	`environment_id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`internal_http_base_url` text NOT NULL,
	`internal_ws_base_url` text NOT NULL,
	`public_http_base_url` text NOT NULL,
	`public_ws_base_url` text NOT NULL,
	`descriptor_json` text,
	`browser_token_scopes_json` text NOT NULL,
	`admin_token_encrypted` blob NOT NULL,
	`admin_token_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_health_status` text,
	`last_health_checked_at` text,
	`last_health_error` text,
	`last_catalog_sync_status` text,
	`last_catalog_synced_at` text,
	`last_catalog_sync_error` text
);
