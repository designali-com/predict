-- Availability comes from us, not from Cal.com.
--
-- The clinic panel was asking Cal.com for open slots against a single event
-- type with no hosts and no schedule attached, so it answered with Cal.com's
-- out-of-the-box Mon–Fri 9–5 for every doctor and for no doctor. Picking a
-- doctor on the booking form changed nothing, and two doctors could be put in
-- the same 10:00 with nothing to stop it.
--
-- doctor_availability already held the real weekly pattern — the WhatsApp
-- booking flow reads it — so this makes it the one source of truth and gives it
-- the two things it was missing: how long an appointment is, and leave.
--
-- Cal.com keeps its job: it is called once a booking is made, for the
-- confirmation email and the Google Meet link. It is no longer asked anything.

-- A window is a working period, not one booking. 09:00–13:00 at 30 minutes is
-- eight slots. Existing rows default to 30, which is the length the Cal.com
-- event type was using, so nothing already booked changes shape.
ALTER TABLE "doctor_availability"
  ADD COLUMN IF NOT EXISTS "slot_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "doctor_time_off" (
  "id" text PRIMARY KEY NOT NULL,
  "doctor_user_id" text NOT NULL,
  -- Inclusive both ends, so one day off is the same date twice.
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  -- Null on both means the whole day; set them for a half day.
  "start_time" text,
  "end_time" text,
  "reason" text,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "doctor_time_off"
  ADD CONSTRAINT "doctor_time_off_doctor_user_id_user_id_fk"
  FOREIGN KEY ("doctor_user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "doctor_time_off"
  ADD CONSTRAINT "doctor_time_off_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "doctor_time_off_doctor_idx"
  ON "doctor_time_off" ("doctor_user_id", "start_date");--> statement-breakpoint

-- Booked visits are what a slot is checked against, and the check is by doctor
-- and time. Without this it is a sequential scan per slot, per doctor, per day.
CREATE INDEX IF NOT EXISTS "appointment_doctor_scheduled_idx"
  ON "appointment" ("doctor_user_id", "scheduled_at");
