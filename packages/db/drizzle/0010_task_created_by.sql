-- Who raised a task.
--
-- The list could say what needed doing and who had picked it up, but never who
-- asked for it — so a coach looking at "Doctor review Day 21" had no way to
-- tell whether a person had judged it necessary or a flow had fired, and no
-- way to go and ask.
--
-- Both columns are nullable and neither is backfilled: for tasks that already
-- exist the answer is genuinely unknown, and inventing one would be worse than
-- showing "—".
--
-- Hand-authored in the style of 0006–0009. Additive only.

ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;--> statement-breakpoint

-- The automation run behind it, when a flow raised it. Deliberately not a
-- foreign key — matching communication_message.run_id, so pruning old runs
-- never deletes the tasks they produced.
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "created_by_run_id" text;--> statement-breakpoint

ALTER TABLE "task"
  ADD CONSTRAINT "task_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;
