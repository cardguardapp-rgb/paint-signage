import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  json,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { usersTable } from "./users";
import { z } from "zod/v4";

export interface SwmsHazardEntry {
  key: string;
  label: string;
  isSelected: boolean;
  severity: "Low" | "Medium" | "High";
  controlMeasure: string;
}

export const swmsFormsTable = pgTable("swms_forms", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  templateType: text("template_type").notNull().default("SWMS"),
  title: text("title").notNull(),
  hazards: json("hazards")
    .$type<SwmsHazardEntry[]>()
    .notNull()
    .default([]),
  status: text("status").notNull().default("PendingSignatures"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const swmsSignaturesTable = pgTable("swms_signatures", {
  id: serial("id").primaryKey(),
  swmsFormId: integer("swms_form_id")
    .notNull()
    .references(() => swmsFormsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id),
  signerName: text("signer_name").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const hazardEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  isSelected: z.boolean(),
  severity: z.enum(["Low", "Medium", "High"]),
  controlMeasure: z.string(),
});

export const createSwmsSchema = z.object({
  templateType: z.enum(["SWMS", "JSA"]).optional().default("SWMS"),
  title: z.string().min(1),
});

export const updateSwmsHazardsSchema = z.object({
  hazards: z.array(hazardEntrySchema),
});

export const signSwmsSchema = z.object({
  signerName: z.string().min(1),
  userId: z.number().int().optional(),
});
