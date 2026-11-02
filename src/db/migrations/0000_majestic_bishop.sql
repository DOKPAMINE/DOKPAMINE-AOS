CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`sync_pending` integer DEFAULT true NOT NULL,
	`local_version` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`isbn` text,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`publisher` text,
	`total_pages` integer NOT NULL,
	`genre` text NOT NULL,
	`cover_url` text,
	`status` text DEFAULT 'READING' NOT NULL,
	`current_page` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "books_total_pages" CHECK("books"."total_pages" >= 1),
	CONSTRAINT "books_current_page" CHECK("books"."current_page" >= 0 AND "books"."current_page" <= "books"."total_pages"),
	CONSTRAINT "books_status" CHECK("books"."status" IN ('WANT', 'READING', 'DONE'))
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`sync_pending` integer DEFAULT true NOT NULL,
	`local_version` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`book_id` text NOT NULL,
	`text` text NOT NULL,
	`page` integer,
	`memo` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quotes_length" CHECK(length("quotes"."text") BETWEEN 1 AND 1000 AND length(coalesce("quotes"."memo", '')) <= 500),
	CONSTRAINT "quotes_page" CHECK("quotes"."page" IS NULL OR "quotes"."page" >= 0)
);
--> statement-breakpoint
CREATE INDEX `quotes_book_id` ON `quotes` (`book_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`sync_pending` integer DEFAULT true NOT NULL,
	`local_version` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`book_id` text NOT NULL,
	`one_line` text,
	`body` text,
	`visibility` text DEFAULT 'PRIVATE' NOT NULL,
	`published_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reviews_length" CHECK(length(coalesce("reviews"."one_line", '')) <= 100 AND length(coalesce("reviews"."body", '')) <= 5000),
	CONSTRAINT "reviews_content" CHECK(length(trim(coalesce("reviews"."one_line", ''))) > 0 OR length(trim(coalesce("reviews"."body", ''))) > 0),
	CONSTRAINT "reviews_visibility" CHECK("reviews"."visibility" IN ('PRIVATE', 'PUBLIC'))
);
--> statement-breakpoint
CREATE INDEX `reviews_book_id` ON `reviews` (`book_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`sync_pending` integer DEFAULT true NOT NULL,
	`local_version` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`book_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`active_seconds` integer NOT NULL,
	`start_page` integer NOT NULL,
	`end_page` integer,
	`source` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_pages" CHECK("sessions"."start_page" >= 0 AND ("sessions"."end_page" IS NULL OR "sessions"."end_page" >= 0)),
	CONSTRAINT "sessions_time" CHECK("sessions"."active_seconds" >= 0 AND "sessions"."ended_at" >= "sessions"."started_at"),
	CONSTRAINT "sessions_source" CHECK("sessions"."source" IN ('TIMER', 'MANUAL'))
);
--> statement-breakpoint
CREATE INDEX `sessions_book_id` ON `sessions` (`book_id`);