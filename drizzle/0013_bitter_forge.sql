ALTER TABLE `booking_members` ADD `login_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_members_login_id_unique` ON `booking_members` (`login_id`);