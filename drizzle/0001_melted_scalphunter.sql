ALTER TABLE `staff` ADD `can_finance` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `can_inventory` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `can_roasting` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `staff`
SET `can_finance` = 1, `can_inventory` = 1, `can_roasting` = 1
WHERE `role` IN ('admin', 'employee');--> statement-breakpoint
UPDATE `inventory_items`
SET `name` = '더컵 볶은 원두', `updated_at` = CURRENT_TIMESTAMP
WHERE `category` = 'roasted' AND `name` = '더컵 로스팅 원두';
