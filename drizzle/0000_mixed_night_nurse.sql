CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`inventory_movement_id` integer,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`reorder_level` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`movement_type` text NOT NULL,
	`quantity` real NOT NULL,
	`movement_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`class_name` text DEFAULT '' NOT NULL,
	`cost_amount` integer DEFAULT 0 NOT NULL,
	`receipt_key` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`identifier_hash` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_finance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`baseline_expense` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_finance_period_idx` ON `monthly_finance` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `roasting_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`seconds` integer NOT NULL,
	`bean_temp` real NOT NULL,
	`gas_pressure` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `roasting_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roasting_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bean_name` text NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`process` text DEFAULT '' NOT NULL,
	`batch_weight` real NOT NULL,
	`charge_temp` real NOT NULL,
	`yellowing_seconds` integer NOT NULL,
	`first_crack_seconds` integer NOT NULL,
	`drop_temp` real NOT NULL,
	`total_seconds` integer NOT NULL,
	`development_seconds` integer NOT NULL,
	`development_ratio` real NOT NULL,
	`gas_notes` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`staff_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_last4` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_phone_hash_unique` ON `staff` (`phone_hash`);
--> statement-breakpoint
CREATE TRIGGER `inventory_nonnegative_update`
BEFORE UPDATE OF `quantity` ON `inventory_items`
WHEN NEW.`quantity` < 0
BEGIN
  SELECT RAISE(ABORT, 'inventory_quantity_negative');
END;
