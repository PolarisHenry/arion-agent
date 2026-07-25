ALTER TABLE "agent_log" ADD COLUMN "stop_reason" text;--> statement-breakpoint
ALTER TABLE "llm_model" ADD COLUMN "enable_1m_context" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_model" ADD COLUMN "loop_max_tokens" integer;