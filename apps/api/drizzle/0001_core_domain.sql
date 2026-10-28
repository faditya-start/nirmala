CREATE TABLE `organization_units` (`id` text PRIMARY KEY NOT NULL, `code` text NOT NULL UNIQUE, `name` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `work_units` (`id` text PRIMARY KEY NOT NULL, `organization_unit_id` text NOT NULL REFERENCES `organization_units`(`id`), `code` text NOT NULL UNIQUE, `name` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `rka_documents` (`id` text PRIMARY KEY NOT NULL, `fiscal_year` integer NOT NULL, `organization_unit_id` text NOT NULL REFERENCES `organization_units`(`id`), `work_unit_id` text NOT NULL REFERENCES `work_units`(`id`), `revision_number` integer NOT NULL DEFAULT 0, `status` text NOT NULL DEFAULT 'draft', `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `rka_items` (`id` text PRIMARY KEY NOT NULL, `document_id` text NOT NULL REFERENCES `rka_documents`(`id`), `bas_code` text NOT NULL, `program` text NOT NULL, `activity` text NOT NULL, `description` text NOT NULL, `quantity` real NOT NULL, `unit` text NOT NULL, `unit_price` integer NOT NULL, `total_amount` integer NOT NULL, `evaluation_status` text NOT NULL DEFAULT 'pending', `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `price_references` (`id` text PRIMARY KEY NOT NULL, `fiscal_year` integer NOT NULL, `item_name` text NOT NULL, `unit` text NOT NULL, `reference_price` integer NOT NULL, `source_name` text NOT NULL, `is_synthetic` integer NOT NULL DEFAULT 1, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `risk_assessments` (`id` text PRIMARY KEY NOT NULL, `rka_item_id` text NOT NULL UNIQUE REFERENCES `rka_items`(`id`), `score` integer NOT NULL, `category` text NOT NULL, `engine_version` text NOT NULL, `data_completeness` text NOT NULL, `assessed_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `audit_logs` (`id` text PRIMARY KEY NOT NULL, `actor_user_id` text REFERENCES `users`(`id`), `action` text NOT NULL, `entity_type` text NOT NULL, `entity_id` text NOT NULL, `detail` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `work_units_org_idx` ON `work_units` (`organization_unit_id`);
--> statement-breakpoint
CREATE INDEX `rka_items_document_idx` ON `rka_items` (`document_id`);
--> statement-breakpoint
CREATE INDEX `rka_items_status_idx` ON `rka_items` (`evaluation_status`);
--> statement-breakpoint
CREATE INDEX `risk_assessment_category_idx` ON `risk_assessments` (`category`);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);
