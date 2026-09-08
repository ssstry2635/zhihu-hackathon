CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`active_key` text,
	`result_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_analysis_jobs_active` ON `analysis_jobs` (`active_key`);--> statement-breakpoint
CREATE INDEX `idx_analysis_jobs_cache` ON `analysis_jobs` (`fingerprint`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_analysis_jobs_expiry` ON `analysis_jobs` (`status`,`expires_at`);