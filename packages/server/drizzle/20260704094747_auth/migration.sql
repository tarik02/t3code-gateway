CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`session_token_hash` text NOT NULL UNIQUE,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`password_changed_at` text
);
