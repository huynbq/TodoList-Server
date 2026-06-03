CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TYPE "todo_status" AS ENUM ('pending', 'completed');

CREATE TABLE "todos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "status" "todo_status" NOT NULL DEFAULT 'pending',
  "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "due_date_time" TIMESTAMPTZ(6) NOT NULL,
  "start_date_time" TIMESTAMPTZ(6) NOT NULL,
  "color" VARCHAR(32) NOT NULL DEFAULT '#3b82f6',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "todos" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "idx_todos_status_order_id" ON "todos"("status", "order", "id");
CREATE INDEX "idx_todos_order_id" ON "todos"("order", "id");
CREATE INDEX "idx_todos_title_trgm" ON "todos" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "idx_todos_description_trgm" ON "todos" USING GIN ("description" gin_trgm_ops);
