-- Telling a therapy day from a consultation.
--
-- appointment.type was consultation | review | tele_consult, so a patient
-- coming in for day 9 of a 42-day course was booked as a "Consultation" and
-- looked identical to a first-time enquiry.
--
-- The fix is not a fourth type. A visit IS a therapy day when a plan_sitting
-- points at it — a fact with a course, a day number and a paid-for place behind
-- it, which cannot be set wrong. plan_sitting.appointment_id already existed
-- for this and nothing ever wrote to it; the booking path now does.
--
-- What the sitting link cannot express is a mid-course REVIEW consultation:
-- a check a week or so in that belongs to the course but must not consume one
-- of the days the patient paid for. Hence enrollment_id on the appointment —
-- set for both, so "every visit on this course" is one query, while only the
-- sitting link means a day was used.
ALTER TABLE "appointment"
  ADD COLUMN IF NOT EXISTS "enrollment_id" text;--> statement-breakpoint

-- SET NULL, not cascade: deleting a course must not delete the record that the
-- patient came in.
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_enrollment_id_plan_enrollment_id_fk"
  FOREIGN KEY ("enrollment_id") REFERENCES "public"."plan_enrollment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "appointment_enrollment_idx"
  ON "appointment" ("enrollment_id");--> statement-breakpoint

-- When the sample was taken, which is not when the PDF arrived.
--
-- Blood tests are optional and happen on their own schedule: at a review, or on
-- a day with no appointment at all, and the result may reach us a week later.
-- The biological clock plots a trend, and a trend dated by upload time is the
-- wrong shape. Nullable because most reports are not blood tests and older rows
-- have no such date.
ALTER TABLE "report"
  ADD COLUMN IF NOT EXISTS "collected_on" date;
