CREATE TABLE `follow_up_tasks` (`id` text PRIMARY KEY NOT NULL, `chr_id` text NOT NULL UNIQUE REFERENCES `chr_documents`(`id`), `status` text NOT NULL DEFAULT 'awaiting_revision', `last_check_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `closed_at` integer);
--> statement-breakpoint
CREATE INDEX `follow_up_tasks_status_idx` ON `follow_up_tasks` (`status`);
--> statement-breakpoint
CREATE TABLE `rka_revisions` (`id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL REFERENCES `follow_up_tasks`(`id`), `revision_number` integer NOT NULL, `proposed_unit_price` integer NOT NULL, `note` text NOT NULL, `created_at` integer NOT NULL, UNIQUE(`task_id`,`revision_number`));
--> statement-breakpoint
CREATE TABLE `tracker_checks` (`id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL REFERENCES `follow_up_tasks`(`id`), `revision_id` text NOT NULL REFERENCES `rka_revisions`(`id`), `result` text NOT NULL, `reason` text NOT NULL, `checked_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `tracker_checks_task_idx` ON `tracker_checks` (`task_id`);
--> statement-breakpoint
CREATE TABLE `integration_logs` (`id` text PRIMARY KEY NOT NULL, `chr_id` text NOT NULL REFERENCES `chr_documents`(`id`), `status` text NOT NULL, `message` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `integration_logs_chr_idx` ON `integration_logs` (`chr_id`);
