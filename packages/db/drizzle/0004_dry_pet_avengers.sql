ALTER TABLE "appointment" ADD COLUMN "cal_booking_uid" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "meeting_location" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cal_booking_uid_unique" UNIQUE("cal_booking_uid");