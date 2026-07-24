CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3),
	"refresh_token_expires_at" timestamp (3),
	"scope" text,
	"password" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '',
	"price" integer DEFAULT 0,
	"description" text DEFAULT '',
	"status" text DEFAULT 'active',
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"owner_id" text,
	"role_id" text DEFAULT 'owner' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"avatar" text,
	"app_id" text NOT NULL,
	"app_secret_cipher" text NOT NULL,
	"lark_cli_profile" text NOT NULL,
	"system_prompt" text NOT NULL,
	"llm_model_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_log" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"chat_id" text,
	"type" text NOT NULL,
	"message_content" text,
	"response_content" text,
	"tool_calls" jsonb,
	"tokens_used" integer,
	"duration_ms" integer,
	"status" text DEFAULT 'success' NOT NULL,
	"error" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_retry_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"chat_id" text,
	"chat_type" text,
	"failed_argv" jsonb,
	"pending_scopes" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"chat_type" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_active_at" timestamp (3) DEFAULT now() NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_trigger" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"prompt" text NOT NULL,
	"target_chat_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"workdays_only" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_user_auth" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'pending_start' NOT NULL,
	"device_code" text,
	"verification_url" text,
	"user_open_id" text,
	"user_name" text,
	"granted_scopes" jsonb,
	"token_expires_at" timestamp with time zone,
	"error_msg" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_model" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_cipher" text NOT NULL,
	"model_name" text NOT NULL,
	"temperature" real DEFAULT 0.7,
	"max_tokens" integer DEFAULT 4096,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_llm_model_id_llm_model_id_fk" FOREIGN KEY ("llm_model_id") REFERENCES "public"."llm_model"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_log" ADD CONSTRAINT "agent_log_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_retry_queue" ADD CONSTRAINT "agent_retry_queue_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trigger" ADD CONSTRAINT "agent_trigger_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_user_auth" ADD CONSTRAINT "agent_user_auth_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_ownerId_idx" ON "product" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "role_ownerId_idx" ON "role" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_ownerId_name_uidx" ON "role" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_ownerId_idx" ON "user" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "user_roleId_idx" ON "user" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agent_ownerId_idx" ON "agent" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_ownerId_name_uidx" ON "agent" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "agent_log_agentId_idx" ON "agent_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_log_createdAt_idx" ON "agent_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_retry_queue_agentId_idx" ON "agent_retry_queue" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_retry_queue_status_idx" ON "agent_retry_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_session_agentId_idx" ON "agent_session" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_session_chatId_idx" ON "agent_session" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_agentId_chatId_uidx" ON "agent_session" USING btree ("agent_id","chat_id");--> statement-breakpoint
CREATE INDEX "agent_trigger_agentId_idx" ON "agent_trigger" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_user_auth_agentId_idx" ON "agent_user_auth" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_user_auth_status_idx" ON "agent_user_auth" USING btree ("status");--> statement-breakpoint
CREATE INDEX "llm_model_ownerId_idx" ON "llm_model" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_model_ownerId_name_uidx" ON "llm_model" USING btree ("owner_id","name");