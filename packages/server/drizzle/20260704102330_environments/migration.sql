CREATE TABLE `environments` (
	`environment_id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`endpoint` text NOT NULL,
	`descriptor_json` text,
	`browser_token_scopes_json` text NOT NULL,
	`admin_token_encrypted` blob NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
