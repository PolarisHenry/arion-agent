ALTER TABLE "agent" ADD COLUMN "platform" text DEFAULT 'lark' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "platform_config" jsonb;