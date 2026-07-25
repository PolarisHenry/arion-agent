ALTER TABLE "agent_memory" ADD COLUMN "importance" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD COLUMN "expires_at" timestamp (3);