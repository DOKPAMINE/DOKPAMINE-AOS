UPDATE `books` SET `genre` = '소설/시' WHERE `genre` IN ('소설', 'SF');--> statement-breakpoint
UPDATE `books` SET `genre` = '에세이' WHERE `genre` = '시/에세이';--> statement-breakpoint
UPDATE `books` SET `genre` = '인문/사회' WHERE `genre` IN ('인문', '역사', '사회/정치');--> statement-breakpoint
UPDATE `books` SET `genre` = '과학/IT' WHERE `genre` = '과학';
