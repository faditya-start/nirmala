CREATE TABLE `chr_documents` (`id` text PRIMARY KEY NOT NULL, `rka_item_id` text NOT NULL UNIQUE REFERENCES `rka_items`(`id`), `document_number` text UNIQUE, `title` text NOT NULL, `findings` text NOT NULL, `recommendation` text NOT NULL, `status` text NOT NULL DEFAULT 'draft', `created_by_user_id` text NOT NULL REFERENCES `users`(`id`), `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `issued_at` integer);
--> statement-breakpoint
CREATE INDEX `chr_documents_status_idx` ON `chr_documents` (`status`);
--> statement-breakpoint
CREATE TABLE `chr_versions` (`id` text PRIMARY KEY NOT NULL, `chr_id` text NOT NULL REFERENCES `chr_documents`(`id`), `version_number` integer NOT NULL, `title` text NOT NULL, `findings` text NOT NULL, `recommendation` text NOT NULL, `created_by_user_id` text NOT NULL REFERENCES `users`(`id`), `created_at` integer NOT NULL, UNIQUE(`chr_id`,`version_number`));
