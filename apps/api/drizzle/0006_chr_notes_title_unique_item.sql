ALTER TABLE `chr_notes` ADD `title` text;--> statement-breakpoint
CREATE UNIQUE INDEX `chr_notes_item_idx` ON `chr_notes` (`rka_item_id`) WHERE "chr_notes"."rka_item_id" is not null;