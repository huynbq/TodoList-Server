ALTER TABLE "todos"
ADD COLUMN "user_id" UUID;

CREATE INDEX "idx_todos_user_status_order_id"
ON "todos" ("user_id", "status", "order", "id");

CREATE INDEX "idx_todos_user_order_id"
ON "todos" ("user_id", "order", "id");

CREATE TABLE "reminder_notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES auth.users("id") ON DELETE CASCADE,
  "todo_id" UUID NOT NULL REFERENCES "todos"("id") ON DELETE CASCADE,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "reminder_notifications" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reminder notifications"
ON "reminder_notifications"
FOR SELECT
TO authenticated
USING ((select auth.uid()) = "user_id");

CREATE INDEX "idx_reminder_notifications_user_unread"
ON "reminder_notifications" ("user_id", "read_at", "created_at");

CREATE INDEX "idx_reminder_notifications_todo_id"
ON "reminder_notifications" ("todo_id");

ALTER PUBLICATION supabase_realtime ADD TABLE "reminder_notifications";
