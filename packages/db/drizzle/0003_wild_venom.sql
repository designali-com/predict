CREATE TABLE "ai_assistant_config" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"temperature" double precision DEFAULT 0.3 NOT NULL,
	"max_output_tokens" integer DEFAULT 600 NOT NULL,
	"additional_instructions" text DEFAULT '' NOT NULL,
	"daily_message_limit_per_user" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversation_user_id_updated_at_idx" ON "ai_conversation" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_message_conversation_id_created_at_idx" ON "ai_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "report_user_id_uploaded_at_idx" ON "report" USING btree ("user_id","uploaded_at");