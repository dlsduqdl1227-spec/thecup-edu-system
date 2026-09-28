CREATE TABLE `edu_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`sha256` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `edu_member_levels` (
	`member_id` integer NOT NULL,
	`course_id` text NOT NULL,
	`level` text NOT NULL,
	`approval_stamp` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`member_id`, `course_id`, `level`),
	FOREIGN KEY (`member_id`) REFERENCES `booking_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Migrate existing grants to their currently available levels, never future courses.
INSERT INTO edu_member_levels (member_id, course_id, level, approval_stamp, updated_by, updated_at)
SELECT g.member_id, g.course_id, l.level, g.approval_stamp, g.updated_by, g.updated_at
FROM edu_member_courses g JOIN booking_members m ON m.id = g.member_id
JOIN (SELECT 'Foundation' AS level UNION ALL SELECT 'Intermediate' UNION ALL SELECT 'Professional' UNION ALL SELECT 'Introduction') l
WHERE m.approval_status = 'APPROVED' AND m.deleted_at IS NULL
  AND g.approval_stamp = COALESCE(m.approved_at, m.created_at)
  AND ((g.course_id = 'introduction' AND l.level = 'Introduction')
    OR (g.course_id IN ('barista-skills','brewing','green-coffee','roasting','sensory-skills') AND l.level <> 'Introduction'));
--> statement-breakpoint
CREATE TRIGGER edu_member_levels_revoke
AFTER UPDATE OF approval_status, deleted_at ON booking_members
WHEN NEW.approval_status <> 'APPROVED' OR NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM edu_member_levels WHERE member_id = NEW.id;
END;
