CREATE TABLE `receipt_files` (
	`movement_id` integer PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`movement_id`) REFERENCES `inventory_movements`(`id`) ON UPDATE no action ON DELETE cascade
);
