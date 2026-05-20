import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  integer,
  numeric,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const estimateStatusEnum = pgEnum("estimate_status", [
  "Draft",
  "Sent",
  "Approved",
  "Rejected",
]);

export const marginStatusEnum = pgEnum("margin_status", [
  "Healthy",
  "Warning",
  "Critical",
]);

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  title: text("title"),
  status: estimateStatusEnum("status").notNull().default("Draft"),
  lineItems: json("line_items").notNull().default([]),
  markupPercentage: numeric("markup_percentage", { precision: 5, scale: 2 }).notNull().default("20"),
  customerTotal: numeric("customer_total", { precision: 12, scale: 2 }).notNull().default("0"),
  internalCost: numeric("internal_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  margin: numeric("margin", { precision: 5, scale: 2 }).notNull().default("0"),
  marginStatus: marginStatusEnum("margin_status").notNull().default("Healthy"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;

// Line item shape
export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  unit: z.string().optional(),
});

export type LineItem = z.infer<typeof lineItemSchema>;

// Margin threshold helpers
export function computeMarginStatus(margin: number): "Healthy" | "Warning" | "Critical" {
  if (margin >= 25) return "Healthy";
  if (margin >= 15) return "Warning";
  return "Critical";
}

export function computeEstimateTotals(
  lineItems: LineItem[],
  markupPct: number
): { internalCost: number; customerTotal: number; margin: number; marginStatus: "Healthy" | "Warning" | "Critical" } {
  const internalCost = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const customerTotal = internalCost * (1 + markupPct / 100);
  const margin = internalCost > 0 ? ((customerTotal - internalCost) / customerTotal) * 100 : 0;
  return {
    internalCost,
    customerTotal,
    margin,
    marginStatus: computeMarginStatus(margin),
  };
}
