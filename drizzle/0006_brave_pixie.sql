ALTER TABLE "agent_trigger" ALTER COLUMN "cron" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_trigger" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_trigger" ADD COLUMN "kind" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_trigger" ADD COLUMN "fire_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_trigger" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "agent_trigger" ADD COLUMN "completed_at" timestamp (3);