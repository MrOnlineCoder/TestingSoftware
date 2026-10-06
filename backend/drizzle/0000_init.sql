CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exam_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`test_id` text NOT NULL,
	`answer` text,
	`is_correct` integer,
	`score_awarded` real,
	`locked` integer DEFAULT false NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_answers_session_test_idx` ON `exam_answers` (`session_id`,`test_id`);--> statement-breakpoint
CREATE TABLE `exam_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text,
	`collection_title` text NOT NULL,
	`student_name` text NOT NULL,
	`student_id` text,
	`settings` text NOT NULL,
	`status` text NOT NULL,
	`origin` text NOT NULL,
	`tests_snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`submitted_at` integer,
	`total_score` real,
	`max_score` real NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `exam_sessions_collection_idx` ON `exam_sessions` (`collection_id`);--> statement-breakpoint
CREATE TABLE `offline_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text,
	`collection_title` text NOT NULL,
	`tests_snapshot` text NOT NULL,
	`layout` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offline_exams_collection_idx` ON `offline_exams` (`collection_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`score` real NOT NULL,
	`options` text NOT NULL,
	`correct_answer` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tests_collection_position_idx` ON `tests` (`collection_id`,`position`);