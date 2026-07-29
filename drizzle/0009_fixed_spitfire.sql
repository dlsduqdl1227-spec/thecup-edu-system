PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_manual_compliance` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`frequency_months` integer NOT NULL,
	`completed_date` text,
	`updated_by` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_manual_compliance`("key", "title", "frequency_months", "completed_date", "updated_by", "updated_at") SELECT "key", "title", "frequency_months", "completed_date", "updated_by", "updated_at" FROM `manual_compliance`;--> statement-breakpoint
DROP TABLE `manual_compliance`;--> statement-breakpoint
ALTER TABLE `__new_manual_compliance` RENAME TO `manual_compliance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;