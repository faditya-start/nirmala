CREATE TABLE `reviewer_decisions` (`id` text PRIMARY KEY NOT NULL, `rka_item_id` text NOT NULL REFERENCES `rka_items`(`id`), `reviewer_user_id` text NOT NULL REFERENCES `users`(`id`), `decision` text NOT NULL, `reason` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_decisions_item_unique` ON `reviewer_decisions` (`rka_item_id`);
--> statement-breakpoint
CREATE INDEX `reviewer_decisions_reviewer_idx` ON `reviewer_decisions` (`reviewer_user_id`);
