CREATE TABLE `edu_deck_visibility` (
	`course_id` text NOT NULL,
	`level` text NOT NULL,
	`status` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`course_id`, `level`),
	CONSTRAINT "edu_deck_visibility_status" CHECK("edu_deck_visibility"."status" IN ('review', 'ready'))
);
