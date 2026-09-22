CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_category_id` integer,
	`name` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_sql_category_id_unique` ON `categories` (`sql_category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_claim_id` integer,
	`distributor_id` text NOT NULL,
	`order_id` text,
	`variant_id` text NOT NULL,
	`quantity` integer DEFAULT 0,
	`pieces_qty` integer DEFAULT 0,
	`reason` text,
	`image_binary` blob,
	`status` text DEFAULT 'PENDING',
	`created_at` integer,
	FOREIGN KEY (`distributor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claims_sql_claim_id_unique` ON `claims` (`sql_claim_id`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_setting_id` integer,
	`address` text,
	`mobile_number` text,
	`state` text,
	`gst_number` text,
	`fssai_number` text,
	`claim_window_days` integer DEFAULT 7,
	`cgst_rate` real DEFAULT 2.5,
	`sgst_rate` real DEFAULT 2.5,
	`qr_code_image` blob,
	`qr_code_mimetype` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `credit_note_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_cn_item_id` integer,
	`credit_note_id` text NOT NULL,
	`variant_id` text,
	`quantity` integer NOT NULL,
	`pieces_qty` integer DEFAULT 0,
	`reason` text,
	`price_at_order` real NOT NULL,
	`item_total` real NOT NULL,
	FOREIGN KEY (`credit_note_id`) REFERENCES `credit_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_credit_note_id` integer,
	`distributor_id` text NOT NULL,
	`cn_number` text,
	`total_amount` real NOT NULL,
	`reason` text,
	`created_at` integer,
	FOREIGN KEY (`distributor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_notes_sql_credit_note_id_unique` ON `credit_notes` (`sql_credit_note_id`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_inventory_id` integer,
	`variant_id` text NOT NULL,
	`stock_quantity` integer DEFAULT 0,
	`low_stock_threshold` integer DEFAULT 10,
	`updated_at` integer,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_sql_inventory_id_unique` ON `inventory` (`sql_inventory_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_variant_id_unique` ON `inventory` (`variant_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_invoice_id` integer,
	`order_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`subtotal` real NOT NULL,
	`cgst_amount` real NOT NULL,
	`sgst_amount` real NOT NULL,
	`grand_total` real NOT NULL,
	`credit_applied` real DEFAULT 0,
	`extra_discount` real DEFAULT 0,
	`discount_reason` text,
	`paid_amount` real DEFAULT 0,
	`payment_status` text DEFAULT 'UNPAID',
	`pdf_url` text,
	`created_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_sql_invoice_id_unique` ON `invoices` (`sql_invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_order_item_id` integer,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`executed_qty` integer DEFAULT 0,
	`unit_price` real NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_order_id` integer,
	`distributor_id` text NOT NULL,
	`status` text DEFAULT 'PENDING',
	`apply_wallet` integer DEFAULT false,
	`order_date` integer,
	`execution_date` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`distributor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_sql_order_id_unique` ON `orders` (`sql_order_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_payment_id` integer,
	`distributor_id` text NOT NULL,
	`invoice_id` text,
	`amount` real NOT NULL,
	`payment_mode` text NOT NULL,
	`reference_number` text,
	`notes` text,
	`payment_date` integer,
	`created_at` integer,
	FOREIGN KEY (`distributor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_sql_payment_id_unique` ON `payments` (`sql_payment_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_product_id` integer,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`hsn_code` text,
	`gst_percent` real DEFAULT 18,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sql_product_id_unique` ON `products` (`sql_product_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_user_id` integer,
	`phone` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`firm_name` text,
	`owner_name` text,
	`gst_number` text,
	`address` text,
	`wallet_balance` real DEFAULT 0,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_sql_user_id_unique` ON `users` (`sql_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`sql_variant_id` integer,
	`product_id` text NOT NULL,
	`pack_size` text NOT NULL,
	`uom` text,
	`distributor_rate` real DEFAULT 0,
	`retailer_rate` real DEFAULT 0,
	`mrp` real DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sql_variant_id_unique` ON `variants` (`sql_variant_id`);