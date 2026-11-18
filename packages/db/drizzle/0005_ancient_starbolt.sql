CREATE TABLE "doctor_slot_template" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_user_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_message" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "doctor_slot_template" ADD CONSTRAINT "doctor_slot_template_doctor_user_id_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;