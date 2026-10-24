CREATE TABLE `advertisers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`airline_code` text,
	`category` text
);
--> statement-breakpoint
CREATE TABLE `aircraft_types` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seats` text NOT NULL,
	`total_seats` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`brand_safe` integer DEFAULT true NOT NULL,
	`competitor_group` text,
	`segment_weights` text NOT NULL,
	`hard_filters` text NOT NULL,
	`placement` text NOT NULL,
	`budget` text NOT NULL,
	`triggers` text NOT NULL,
	`creative_ids` text NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`name` text NOT NULL,
	`orientation` text NOT NULL,
	`template` text NOT NULL,
	`copy` text NOT NULL,
	`bg_color` text NOT NULL,
	`fg_color` text NOT NULL,
	`approval_status` text NOT NULL,
	`ai_generated` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`slot_at` text NOT NULL,
	`winner_campaign_id` text,
	`engine` text NOT NULL,
	`winning_reason` text NOT NULL,
	`crowd_profile` text NOT NULL,
	`candidates` text NOT NULL,
	`verification` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flight_events` (
	`id` text PRIMARY KEY NOT NULL,
	`flight_id` text NOT NULL,
	`type` text NOT NULL,
	`at` text NOT NULL,
	`change` text NOT NULL,
	`evidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flights` (
	`id` text PRIMARY KEY NOT NULL,
	`airline_code` text NOT NULL,
	`flight_number` text NOT NULL,
	`direction` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`via` text,
	`domestic_international` text NOT NULL,
	`aircraft_type_code` text NOT NULL,
	`pax_count` integer NOT NULL,
	`scheduled_time` text NOT NULL,
	`estimated_time` text,
	`actual_time` text,
	`tobt` text,
	`tsat` text,
	`aibt` text,
	`aobt` text,
	`stand` text,
	`gate` text,
	`checkin_counters` text,
	`belt` text,
	`status` text NOT NULL,
	`delay_code` text,
	`delay_minutes` integer DEFAULT 0 NOT NULL,
	`terminal_id` text NOT NULL,
	`zone_id` text,
	`profile` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`at` text NOT NULL,
	`pax_estimate` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`entity_id` text NOT NULL,
	`message` text NOT NULL,
	`owner` text,
	`raised_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`advertiser_id` text NOT NULL,
	`name` text NOT NULL,
	`zone_id` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`code` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text NOT NULL,
	`linked_flight_id` text,
	`parent_code` text,
	`redeemed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`checkpoint_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`at` text NOT NULL,
	`queue_length` integer NOT NULL,
	`wait_minutes` real NOT NULL,
	`throughput_per_min` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promo_code_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`at` text NOT NULL,
	`segment` text NOT NULL,
	`channel` text NOT NULL,
	`value_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `screens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`zone_id` text NOT NULL,
	`nearest_gates` text NOT NULL,
	`size_inches` integer NOT NULL,
	`orientation` text NOT NULL,
	`status` text NOT NULL,
	`last_seen` text NOT NULL,
	`latency_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`concourses` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `zones` (
	`id` text PRIMARY KEY NOT NULL,
	`terminal_id` text NOT NULL,
	`name` text NOT NULL,
	`gates` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL
);
