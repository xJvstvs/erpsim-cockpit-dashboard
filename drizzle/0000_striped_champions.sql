CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`game` text NOT NULL,
	`company` text NOT NULL,
	`kind` text NOT NULL,
	`idempotency` text NOT NULL,
	`hash` text NOT NULL,
	`base_version` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_idempotency` ON `actions` (`user_id`,`idempotency`);--> statement-breakpoint
CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event` text NOT NULL,
	`detail` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`base_version` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `game`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `locks` (
	`scope` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`game` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`warning` text
);
--> statement-breakpoint
CREATE TABLE `source_states` (
	`game` text NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`game`, `source`)
);
