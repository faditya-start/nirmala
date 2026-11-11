ALTER TABLE `rka_documents` ADD `import_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `rka_documents` ADD `row_error_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rka_documents` ADD `row_errors` text;