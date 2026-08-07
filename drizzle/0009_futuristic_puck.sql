CREATE TABLE "agent_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"scope" text DEFAULT 'agent' NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"source_chat_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"platforms" jsonb,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skill" ADD CONSTRAINT "agent_skill_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_skill_agentId_idx" ON "agent_skill" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_skill_ownerId_idx" ON "agent_skill" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skill_agentId_name_uidx" ON "agent_skill" USING btree ("agent_id","name");