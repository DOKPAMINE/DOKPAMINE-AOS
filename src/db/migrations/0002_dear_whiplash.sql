CREATE TABLE `sync_rejections` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`book_id` text NOT NULL,
	`local_version` integer NOT NULL,
	`message` text NOT NULL
);
