CREATE TABLE `accounts` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `chr_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`organization_unit_id` text NOT NULL,
	`document_number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`recommendation` text,
	`unit_response` text,
	`created_by` text NOT NULL,
	`issued_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_unit_id`) REFERENCES `organization_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chr_documents_cycle_org_idx` ON `chr_documents` (`cycle_id`,`organization_unit_id`);--> statement-breakpoint
CREATE TABLE `chr_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`chr_document_id` text NOT NULL,
	`rka_item_id` text,
	`item_key` text,
	`work_unit_id` text,
	`rule_id` text,
	`category` text NOT NULL,
	`text` text NOT NULL,
	`expectation` text NOT NULL,
	`status` text DEFAULT 'draf' NOT NULL,
	`justification` text,
	`justified_by` text,
	`closed_by` text,
	`closed_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chr_document_id`) REFERENCES `chr_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rka_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_unit_id`) REFERENCES `work_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`justified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chr_notes_doc_idx` ON `chr_notes` (`chr_document_id`);--> statement-breakpoint
CREATE INDEX `chr_notes_status_idx` ON `chr_notes` (`status`);--> statement-breakpoint
CREATE INDEX `chr_notes_work_unit_idx` ON `chr_notes` (`work_unit_id`);--> statement-breakpoint
CREATE TABLE `chr_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`chr_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chr_id`) REFERENCES `chr_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chr_versions_idx` ON `chr_versions` (`chr_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `dismiss_reasons` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `follow_up_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`document_id` text NOT NULL,
	`matched_item_id` text,
	`result` text NOT NULL,
	`evidence` text NOT NULL,
	`checked_at` integer NOT NULL,
	`reviewer_action` text,
	`reviewer_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	FOREIGN KEY (`note_id`) REFERENCES `chr_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `rka_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `follow_up_checks_note_idx` ON `follow_up_checks` (`note_id`);--> statement-breakpoint
CREATE TABLE `organization_units` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`short_name` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_units_code_unique` ON `organization_units` (`code`);--> statement-breakpoint
CREATE TABLE `public_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`organization_unit_label` text NOT NULL,
	`category` text NOT NULL,
	`notes_total` integer NOT NULL,
	`closed_before_deadline` integer NOT NULL,
	`median_days_to_close` real,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `public_metrics_cycle_idx` ON `public_metrics` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `review_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`fiscal_year` integer NOT NULL,
	`stage` text NOT NULL,
	`name` text NOT NULL,
	`adk_deadline` integer,
	`dipa_issued_at` integer,
	`status` text DEFAULT 'aktif' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_cycles_year_stage_idx` ON `review_cycles` (`fiscal_year`,`stage`);--> statement-breakpoint
CREATE TABLE `reviewer_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`rka_item_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason_category` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rka_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reason_category`) REFERENCES `dismiss_reasons`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_decisions_rka_item_id_unique` ON `reviewer_decisions` (`rka_item_id`);--> statement-breakpoint
CREATE TABLE `risk_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`rka_item_id` text NOT NULL,
	`risk_config_id` text NOT NULL,
	`score` integer NOT NULL,
	`category` text NOT NULL,
	`factors` text NOT NULL,
	`peer_stats` text,
	`data_completeness` text NOT NULL,
	`assessed_at` integer NOT NULL,
	FOREIGN KEY (`rka_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`risk_config_id`) REFERENCES `risk_config`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `risk_assessments_item_config_idx` ON `risk_assessments` (`rka_item_id`,`risk_config_id`);--> statement-breakpoint
CREATE INDEX `risk_assessments_score_idx` ON `risk_assessments` (`score`);--> statement-breakpoint
CREATE TABLE `risk_config` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`weights` text NOT NULL,
	`thresholds` text NOT NULL,
	`params` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `risk_config_version_unique` ON `risk_config` (`version`);--> statement-breakpoint
CREATE TABLE `rka_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`organization_unit_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`label` text NOT NULL,
	`source_file_name` text NOT NULL,
	`file_hash` text NOT NULL,
	`row_count` integer NOT NULL,
	`header_rows_skipped` integer DEFAULT 0 NOT NULL,
	`imported_by` text,
	`imported_at` integer NOT NULL,
	`diff_summary` text,
	FOREIGN KEY (`cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_unit_id`) REFERENCES `organization_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`imported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rka_documents_file_hash_unique` ON `rka_documents` (`file_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `rka_documents_version_idx` ON `rka_documents` (`cycle_id`,`organization_unit_id`,`version_no`);--> statement-breakpoint
CREATE INDEX `rka_documents_org_idx` ON `rka_documents` (`organization_unit_id`);--> statement-breakpoint
CREATE TABLE `rka_items` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`work_unit_id` text NOT NULL,
	`program_code` text NOT NULL,
	`activity_code` text NOT NULL,
	`output_code` text NOT NULL,
	`suboutput_code` text NOT NULL,
	`component_code` text NOT NULL,
	`subcomponent_code` text NOT NULL,
	`subcomponent_name` text,
	`account_code` text NOT NULL,
	`description` text NOT NULL,
	`cons_item` text,
	`nomor_item` text,
	`quantity` real NOT NULL,
	`unit` text,
	`unit_price` integer NOT NULL,
	`total_amount` integer NOT NULL,
	`volume_detail` text,
	`blokir_code` text,
	`blokir_amount` integer,
	`item_key` text NOT NULL,
	`sipeka_id_item` text,
	`change_type` text DEFAULT 'baru' NOT NULL,
	`previous_item_id` text,
	FOREIGN KEY (`document_id`) REFERENCES `rka_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_unit_id`) REFERENCES `work_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rka_items_doc_key_idx` ON `rka_items` (`document_id`,`item_key`);--> statement-breakpoint
CREATE INDEX `rka_items_work_unit_idx` ON `rka_items` (`work_unit_id`);--> statement-breakpoint
CREATE INDEX `rka_items_account_idx` ON `rka_items` (`account_code`);--> statement-breakpoint
CREATE INDEX `rka_items_previous_idx` ON `rka_items` (`previous_item_id`);--> statement-breakpoint
CREATE TABLE `rule_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`rka_item_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rka_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_hits_item_rule_idx` ON `rule_hits` (`rka_item_id`,`rule_id`);--> statement-breakpoint
CREATE INDEX `rule_hits_rule_idx` ON `rule_hits` (`rule_id`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`params` text NOT NULL,
	`reason_template` text NOT NULL,
	`source` text NOT NULL,
	`default_expectation` text,
	`active` integer DEFAULT true NOT NULL,
	`valid_year` integer,
	`validation_note` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_code_unique` ON `rules` (`code`);--> statement-breakpoint
CREATE TABLE `satker_finding_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`work_unit_code` text NOT NULL,
	`theme` text NOT NULL,
	`count_total` integer NOT NULL,
	`count_open` integer NOT NULL,
	`latest_year` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `satker_finding_stats_idx` ON `satker_finding_stats` (`work_unit_code`,`theme`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_scopes` (
	`user_id` text NOT NULL,
	`organization_unit_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `organization_unit_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_unit_id`) REFERENCES `organization_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `work_units` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_unit_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_unit_id`) REFERENCES `organization_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_units_code_unique` ON `work_units` (`code`);--> statement-breakpoint
CREATE INDEX `work_units_org_idx` ON `work_units` (`organization_unit_id`);