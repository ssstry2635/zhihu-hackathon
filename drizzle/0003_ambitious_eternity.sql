CREATE TABLE `analysis_visits` (
	`visitor_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`seen_at` text NOT NULL,
	PRIMARY KEY(`visitor_id`, `analysis_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_visits_recent` ON `analysis_visits` (`visitor_id`,`seen_at`);--> statement-breakpoint
CREATE TABLE `upstream_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`day_key` text NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`finished_at` integer,
	`operation_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_calls_day` ON `upstream_calls` (`day_key`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `idx_calls_recent` ON `upstream_calls` (`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_calls_active` ON `upstream_calls` (`finished_at`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calls_operation` ON `upstream_calls` (`operation_key`);--> statement-breakpoint
ALTER TABLE `analysis_jobs` ADD `topic_id` text DEFAULT 'ai-coding' NOT NULL;
--> statement-breakpoint
INSERT INTO analysis_visits (visitor_id,analysis_id,seen_at)
SELECT j.visitor_id,j.result_id,MAX(j.updated_at) FROM analysis_jobs j JOIN analyses a ON a.id=j.result_id
WHERE j.status='succeeded' GROUP BY j.visitor_id,j.result_id;
