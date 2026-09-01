CREATE TABLE `course_applicants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`applicant_name` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_last4` text NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course_openings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_course_applicants_course_phone` ON `course_applicants` (`course_id`,`phone_hash`);--> statement-breakpoint
CREATE INDEX `idx_course_applicants_course_status` ON `course_applicants` (`course_id`,`status`);--> statement-breakpoint
CREATE TABLE `course_openings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`course_month` text NOT NULL,
	`opening_minimum` integer NOT NULL,
	`capacity` integer,
	`recruitment_start_date` text,
	`recruitment_end_date` text,
	`is_public` integer DEFAULT true NOT NULL,
	`status_override` text DEFAULT 'AUTO' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`duration_hours` integer DEFAULT 0 NOT NULL,
	`tuition` integer DEFAULT 0 NOT NULL,
	`fee_note` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_openings_public_id_unique` ON `course_openings` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_course_openings_public_month` ON `course_openings` (`course_month`,`is_public`,`display_order`);