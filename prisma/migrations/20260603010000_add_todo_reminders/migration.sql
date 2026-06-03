ALTER TABLE "todos"
ADD COLUMN "reminder_date_time" TIMESTAMPTZ(6),
ADD COLUMN "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_todos_reminder_due"
ON "todos" ("reminder_sent", "reminder_date_time");
