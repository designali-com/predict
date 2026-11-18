-- Deleting a staff account should not be blocked by a report they uploaded.
--
-- report.uploaded_by referenced user.id with no ON DELETE rule, so Postgres
-- defaults to NO ACTION: every account that had ever uploaded a report became
-- undeletable, and the error surfaced as an opaque failure in the UI rather
-- than as anything a person could act on.
--
-- SET NULL rather than CASCADE, and the distinction matters: the report is the
-- patient's clinical record, not the uploader's. Losing "who uploaded it" when
-- that person leaves is a small loss; deleting the report itself would be a
-- clinical one. The column was already nullable, so nothing else changes.

ALTER TABLE "report" DROP CONSTRAINT IF EXISTS "report_uploaded_by_user_id_fk";--> statement-breakpoint

ALTER TABLE "report"
  ADD CONSTRAINT "report_uploaded_by_user_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;
