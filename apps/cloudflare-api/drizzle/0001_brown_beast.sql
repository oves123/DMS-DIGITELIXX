ALTER TABLE `variants` ADD `old_distributor_rate` real;--> statement-breakpoint
ALTER TABLE `variants` ADD `old_retailer_rate` real;--> statement-breakpoint
ALTER TABLE `variants` ADD `pieces_per_box` integer DEFAULT 1;