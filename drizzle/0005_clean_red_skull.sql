ALTER TABLE `inventory_items` ADD `lot` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `process` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `expiry_date` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `legacy_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_legacy_key_unique` ON `inventory_items` (`legacy_key`);