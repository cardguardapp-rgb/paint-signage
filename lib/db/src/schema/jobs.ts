import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  integer,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const jobStageEnum = pgEnum("job_stage", [
  "Lead",
  "Quoting",
  "Approved",
  "Scheduled",
  "InProgress",
  "ComplianceReview",
  "Invoiced",
  "Closed",
]);

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  stage: jobStageEnum("stage").notNull().default("Lead"),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
  siteAddress: text("site_address"),
  notes: text("notes"),
  hasApprovedEstimate: boolean("has_approved_estimate").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

// Valid stage transitions (state machine)
export const STAGE_ORDER: Record<string, string[]> = {
  Lead: ["Quoting"],
  Quoting: ["Lead", "Approved"],
  Approved: ["Scheduled", "Quoting"],
  Scheduled: ["InProgress", "Approved"],
  InProgress: ["ComplianceReview", "Scheduled"],
  ComplianceReview: ["Invoiced", "InProgress"],
  Invoiced: ["Closed", "ComplianceReview"],
  Closed: [],
};

// Next stage in the pipeline flow
export const NEXT_STAGE: Record<string, string | null> = {
  Lead: "Quoting",
  Quoting: "Approved",
  Approved: "Scheduled",
  Scheduled: "InProgress",
  InProgress: "ComplianceReview",
  ComplianceReview: "Invoiced",
  Invoiced: "Closed",
  Closed: null,
};

// Stages that require an approved estimate before advancing
export const REQUIRES_APPROVED_ESTIMATE_BEFORE: string[] = [
  "Scheduled", // Can only enter Scheduled if quote is approved
  "InProgress",
];
