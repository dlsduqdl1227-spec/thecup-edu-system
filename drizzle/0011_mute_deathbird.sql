CREATE TABLE `booking_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`reservation_id` integer,
	`message` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`admin_reply` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `booking_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_last4` text NOT NULL,
	`approval_status` text DEFAULT 'PENDING' NOT NULL,
	`consultation_status` text DEFAULT 'REQUESTED' NOT NULL,
	`desired_station_type` text DEFAULT '' NOT NULL,
	`consultation_memo` text DEFAULT '' NOT NULL,
	`admin_memo` text DEFAULT '' NOT NULL,
	`approved_by` integer,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`approved_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_members_phone_hash_unique` ON `booking_members` (`phone_hash`);--> statement-breakpoint
CREATE TABLE `booking_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`reservation_id` integer,
	`pass_id` integer,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'UNPAID' NOT NULL,
	`paid_at` text,
	`recorded_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pass_id`) REFERENCES `member_passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_payments_member_idx` ON `booking_payments` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `booking_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station_id` integer NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`block_reason` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_slots_station_start_unique` ON `booking_slots` (`station_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `booking_slots_start_status_idx` ON `booking_slots` (`start_at`,`status`);--> statement-breakpoint
CREATE TABLE `internal_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`evaluator_id` integer,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`technical_score` integer,
	`consistency_score` integer,
	`sensory_score` integer,
	`rule_score` integer,
	`ethics_status` text DEFAULT 'PENDING' NOT NULL,
	`result` text DEFAULT 'PENDING' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`evaluated_at` text,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evaluator_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `member_passes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`type` text NOT NULL,
	`valid_month` text NOT NULL,
	`price` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`max_active_bookings` integer,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `member_passes_member_month_idx` ON `member_passes` (`member_id`,`valid_month`,`status`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_sessions_member_idx` ON `member_sessions` (`member_id`);--> statement-breakpoint
CREATE TABLE `opportunity_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'TRAINING' NOT NULL,
	`conflict_note` text DEFAULT '' NOT NULL,
	`final_decision_by` integer,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`final_decision_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunity_candidates_member_type_unique` ON `opportunity_candidates` (`member_id`,`type`);--> statement-breakpoint
CREATE TABLE `practice_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`reservation_id` integer NOT NULL,
	`station_type` text NOT NULL,
	`recipe_data` text DEFAULT '' NOT NULL,
	`sensory_note` text DEFAULT '' NOT NULL,
	`reflection` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_logs_member_reservation_unique` ON `practice_logs` (`member_id`,`reservation_id`);--> statement-breakpoint
CREATE TABLE `public_request_limits` (
	`identifier_hash` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`slot_id` integer NOT NULL,
	`slot_start_at` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`purpose` text NOT NULL,
	`material_plan` text NOT NULL,
	`open_to_peer_practice` integer DEFAULT false NOT NULL,
	`user_memo` text DEFAULT '' NOT NULL,
	`admin_memo` text DEFAULT '' NOT NULL,
	`rejection_reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text,
	`cancelled_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `booking_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reservations_member_created_idx` ON `reservations` (`member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_slot_status_idx` ON `reservations` (`slot_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_active_member_slot_unique` ON `reservations` (`member_id`,`slot_id`) WHERE status IN ('REQUESTED', 'CONFIRMED');--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_confirmed_slot_unique` ON `reservations` (`slot_id`) WHERE status = 'CONFIRMED';--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_confirmed_member_time_unique` ON `reservations` (`member_id`,`slot_start_at`) WHERE status = 'CONFIRMED';--> statement-breakpoint
CREATE TABLE `stations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stations_name_unique` ON `stations` (`name`);