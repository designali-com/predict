CREATE TABLE "appointment_note" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"author_role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "appointment_id" text;--> statement-breakpoint
ALTER TABLE "appointment_note" ADD CONSTRAINT "appointment_note_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_note" ADD CONSTRAINT "appointment_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;