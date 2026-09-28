CREATE TABLE `edu_member_courses` (
	`member_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`approval_stamp` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`member_id`, `course_id`),
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Only education grants are removed. Booking records and permissions are unchanged.
CREATE TRIGGER `edu_member_courses_revoke`
AFTER UPDATE OF `approval_status`, `deleted_at` ON `booking_members`
WHEN NEW.approval_status <> 'APPROVED' OR NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM `edu_member_courses` WHERE `member_id` = NEW.id;
END;
