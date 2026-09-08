CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `likes` (
	`post_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `visitor_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`category_id` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`content` text NOT NULL,
	`contribution_type` text NOT NULL,
	`parent_id` text,
	`gap_id` text,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`external_url` text,
	`origin` text NOT NULL,
	`request_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_posts_room` ON `posts` (`analysis_id`,`category_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_gap` ON `posts` (`gap_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_request` ON `posts` (`author_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `round_templates` (
	`analysis_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`payload` text NOT NULL,
	`followup_state` text DEFAULT 'unused' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rounds_owner` ON `rounds` (`analysis_id`,`visitor_id`);--> statement-breakpoint
CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
