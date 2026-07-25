CREATE TABLE "agent_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"category" text,
	"note" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_agentId_idx" ON "agent_memory" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_memory_ownerId_idx" ON "agent_memory" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_agentId_key_uidx" ON "agent_memory" USING btree ("agent_id","key");