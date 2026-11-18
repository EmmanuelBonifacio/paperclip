-- paperclip:migration-compat online_compatible: new table only; previous release does not read or write agent_sdk_keys
CREATE TABLE "agent_sdk_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_user_id" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sdk_keys" ADD CONSTRAINT "agent_sdk_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sdk_keys_key_hash_idx" ON "agent_sdk_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "agent_sdk_keys_company_idx" ON "agent_sdk_keys" USING btree ("company_id");
