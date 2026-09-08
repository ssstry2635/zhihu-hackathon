ALTER TABLE `visitors` ADD `session_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_visitors_session` ON `visitors` (`session_hash`);