CREATE TABLE "ability_log" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"log_type" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"source" text DEFAULT 'whatsapp' NOT NULL,
	"logged_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "address" (
	"user_id" text PRIMARY KEY NOT NULL,
	"address_line1" text,
	"city" text,
	"state" text,
	"pincode" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"doctor_user_id" text,
	"type" text DEFAULT 'consultation' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_member" (
	"id" text PRIMARY KEY NOT NULL,
	"audience_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"added_at" timestamp NOT NULL,
	CONSTRAINT "audience_member_audience_id_contact_id_unique" UNIQUE("audience_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "automation_flow" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger_event_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_flow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"flow_version_id" text NOT NULL,
	"domain_event_id" text,
	"contact_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"current_node_id" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resume_at" timestamp,
	"waiting_for_reply" boolean DEFAULT false NOT NULL,
	"waiting_for_event_type" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "automation_flow_version" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "automation_flow_version_flow_id_version_number_unique" UNIQUE("flow_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "automation_node_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"type" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "automation_trigger_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_event_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"run_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "automation_trigger_execution_domain_event_id_flow_id_unique" UNIQUE("domain_event_id","flow_id")
);
--> statement-breakpoint
CREATE TABLE "biological_age_result" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"report_id" text,
	"chronological_age" double precision NOT NULL,
	"composite_score" double precision NOT NULL,
	"delta_age" double precision NOT NULL,
	"biological_age" double precision NOT NULL,
	"calculated_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biomarker" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"description" text,
	"unit" text,
	"range_min" double precision,
	"range_max" double precision,
	"direction" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biomarker_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"description" text,
	"k" double precision DEFAULT 1 NOT NULL,
	"risk_normal_max" double precision,
	"risk_moderate_max" double precision,
	"risk_severe_max" double precision,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "biomarker_category_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "biomarker_domain" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_code" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "biomarker_domain_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "biomarker_reading" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"report_id" text,
	"biomarker_id" text NOT NULL,
	"value" double precision NOT NULL,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_domain_map" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"risk_normal_max" double precision,
	"risk_moderate_max" double precision,
	"risk_severe_max" double precision,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "category_domain_map_category_id_domain_id_unique" UNIQUE("category_id","domain_id")
);
--> statement-breakpoint
CREATE TABLE "communication_channel_config" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "communication_channel_config_channel_unique" UNIQUE("channel")
);
--> statement-breakpoint
CREATE TABLE "communication_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp,
	"assigned_to" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "communication_conversation_contact_id_channel_unique" UNIQUE("contact_id","channel")
);
--> statement-breakpoint
CREATE TABLE "communication_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"template_id" text,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"sent_by" text,
	"idempotency_key" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_template" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"provider_template_name" text,
	"variables_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta_buttons" jsonb,
	"header_media_url" text,
	"header_media_type" text,
	"waba_category" text,
	"language" text DEFAULT 'en_US',
	"header_type" text DEFAULT 'NONE',
	"header_text" text,
	"body_text" text,
	"body_examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footer_text" text,
	"submission_status" text DEFAULT 'draft' NOT NULL,
	"waba_template_id" text,
	"rejection_reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "communication_template_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'LEAD' NOT NULL,
	"source" text,
	"source_platform" text,
	"campaign" text,
	"campaign_id" text,
	"referral_code" text,
	"first_touch_at" timestamp,
	"last_touch_at" timestamp,
	"score" double precision,
	"user_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "contact_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "contact_communication_preference" (
	"contact_id" text PRIMARY KEY NOT NULL,
	"marketing" boolean DEFAULT true NOT NULL,
	"appointment_reminders" boolean DEFAULT true NOT NULL,
	"medical_reminders" boolean DEFAULT true NOT NULL,
	"transactional" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_age_result" (
	"id" text PRIMARY KEY NOT NULL,
	"result_id" text NOT NULL,
	"domain_id" text NOT NULL,
	"mean_abs_z" double precision NOT NULL,
	"biomarker_count" integer NOT NULL,
	"weight_used" double precision NOT NULL,
	"alpha_used" double precision NOT NULL,
	"contribution" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_biomarker_map" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"biomarker_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "domain_biomarker_map_domain_id_biomarker_id_unique" UNIQUE("domain_id","biomarker_id")
);
--> statement-breakpoint
CREATE TABLE "domain_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"contact_id" text,
	"payload" text DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"public_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"asset_type" text NOT NULL,
	"size_bytes" integer,
	"uploaded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"address_type" text DEFAULT 'home' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"pincode" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"date_of_birth" date,
	"mobile_number" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_no" serial NOT NULL,
	"patient_code" text NOT NULL,
	"user_id" text,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"gender" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"blood_group" text,
	"mobile_number" text NOT NULL,
	"alternate_mobile" text,
	"email" text,
	"profile_photo" text,
	"marital_status" text,
	"nationality" text,
	"language" text,
	"condition_type" text,
	"patient_track" text,
	"onboarded_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "patients_patient_code_unique" UNIQUE("patient_code"),
	CONSTRAINT "patients_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text,
	"report_type" text,
	"uploaded_by" text,
	"uploaded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"assigned_role" text,
	"assigned_user_id" text,
	"due_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ability_log" ADD CONSTRAINT "ability_log_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address" ADD CONSTRAINT "address_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctor_user_id_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_member" ADD CONSTRAINT "audience_member_audience_id_audience_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_member" ADD CONSTRAINT "audience_member_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_flow_run" ADD CONSTRAINT "automation_flow_run_flow_id_automation_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_flow_run" ADD CONSTRAINT "automation_flow_run_flow_version_id_automation_flow_version_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."automation_flow_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_flow_run" ADD CONSTRAINT "automation_flow_run_domain_event_id_domain_event_id_fk" FOREIGN KEY ("domain_event_id") REFERENCES "public"."domain_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_flow_run" ADD CONSTRAINT "automation_flow_run_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_flow_version" ADD CONSTRAINT "automation_flow_version_flow_id_automation_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_node_execution" ADD CONSTRAINT "automation_node_execution_run_id_automation_flow_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_flow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_trigger_execution" ADD CONSTRAINT "automation_trigger_execution_domain_event_id_domain_event_id_fk" FOREIGN KEY ("domain_event_id") REFERENCES "public"."domain_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_trigger_execution" ADD CONSTRAINT "automation_trigger_execution_flow_id_automation_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_trigger_execution" ADD CONSTRAINT "automation_trigger_execution_run_id_automation_flow_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_flow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biological_age_result" ADD CONSTRAINT "biological_age_result_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biological_age_result" ADD CONSTRAINT "biological_age_result_category_id_biomarker_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."biomarker_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biological_age_result" ADD CONSTRAINT "biological_age_result_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_reading" ADD CONSTRAINT "biomarker_reading_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_reading" ADD CONSTRAINT "biomarker_reading_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_reading" ADD CONSTRAINT "biomarker_reading_biomarker_id_biomarker_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarker"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_domain_map" ADD CONSTRAINT "category_domain_map_category_id_biomarker_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."biomarker_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_domain_map" ADD CONSTRAINT "category_domain_map_domain_id_biomarker_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."biomarker_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversation" ADD CONSTRAINT "communication_conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversation" ADD CONSTRAINT "communication_conversation_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_conversation_id_communication_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_template_id_communication_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_communication_preference" ADD CONSTRAINT "contact_communication_preference_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_age_result" ADD CONSTRAINT "domain_age_result_result_id_biological_age_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."biological_age_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_age_result" ADD CONSTRAINT "domain_age_result_domain_id_biomarker_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."biomarker_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_biomarker_map" ADD CONSTRAINT "domain_biomarker_map_domain_id_biomarker_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."biomarker_domain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_biomarker_map" ADD CONSTRAINT "domain_biomarker_map_biomarker_id_biomarker_id_fk" FOREIGN KEY ("biomarker_id") REFERENCES "public"."biomarker"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event" ADD CONSTRAINT "domain_event_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_addresses" ADD CONSTRAINT "patient_addresses_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_flow_version_one_active_per_flow" ON "automation_flow_version" USING btree ("flow_id") WHERE "automation_flow_version"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "communication_message_idempotency_key_unique" ON "communication_message" USING btree ("idempotency_key") WHERE "communication_message"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_phone_unique" ON "contact" USING btree ("phone") WHERE "contact"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_email_unique" ON "contact" USING btree ("email") WHERE "contact"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_idempotency_key_unique" ON "domain_event" USING btree ("idempotency_key") WHERE "domain_event"."idempotency_key" is not null;