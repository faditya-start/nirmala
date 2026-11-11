ALTER TABLE `chr_documents` ADD `unit_response_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `chr_documents` ADD `unit_response_at` integer;--> statement-breakpoint
ALTER TABLE `chr_documents` ADD `issued_by` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `chr_documents_number_idx` ON `chr_documents` (`document_number`) WHERE "chr_documents"."document_number" is not null;