CREATE TABLE `answer_key_items` (
	`id` text PRIMARY KEY NOT NULL,
	`set_code` text NOT NULL,
	`rka_item_id` text,
	`item_key` text NOT NULL,
	`organization_unit_id` text NOT NULL,
	`snapshot_label` text NOT NULL,
	FOREIGN KEY (`set_code`) REFERENCES `answer_key_sets`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rka_item_id`) REFERENCES `rka_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_unit_id`) REFERENCES `organization_units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_key_items_unique_idx` ON `answer_key_items` (`set_code`,`organization_unit_id`,`snapshot_label`,`item_key`);--> statement-breakpoint
CREATE INDEX `answer_key_items_set_idx` ON `answer_key_items` (`set_code`);--> statement-breakpoint
CREATE TABLE `answer_key_sets` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`metric` text NOT NULL,
	`n` integer,
	`note` text,
	`synthetic` integer DEFAULT true NOT NULL
);
