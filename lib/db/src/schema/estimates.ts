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

export const customerStatusEnum = pgEnum("customer_status", [
  "NotShared",
  "Pending",
  "Approved",
  "ChangesRequested",
]);

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  title: text("title"),
  status: estimateStatusEnum("status").notNull().default("Draft"),
  // Internal cost breakdown (Labor / Material / Equipment line items)
  internalBudgetItems: json("internal_budget_items").notNull().default([]),
  // Customer-facing line items with optional display name overrides
  lineItems: json("line_items").notNull().default([]),
  markupPercentage: numeric("markup_percentage", { precision: 5, scale: 2 }).notNull().default("20"),
  customerTotal: numeric("customer_total", { precision: 12, scale: 2 }).notNull().default("0"),
  internalCost: numeric("internal_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  grossProfit: numeric("gross_profit", { precision: 12, scale: 2 }).notNull().default("0"),
  margin: numeric("margin", { precision: 5, scale: 2 }).notNull().default("0"),
  marginStatus: marginStatusEnum("margin_status").notNull().default("Healthy"),
  // Customer web-view sharing
  shareToken: text("share_token").unique(),
  customerStatus: customerStatusEnum("customer_status").notNull().default("NotShared"),
  customerNote: text("customer_note"),
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

// Internal budget item shape
export const internalBudgetItemSchema = z.object({
  category: z.enum(["Labor", "Material", "Equipment"]),
  description: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
  unit: z.string().optional(),
});

export type InternalBudgetItem = z.infer<typeof internalBudgetItemSchema>;

// Customer-facing line item shape (with optional display name override)
export const lineItemSchema = z.object({
  description: z.string(),
  displayName: z.string().optional(),
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
  internalBudgetItems: InternalBudgetItem[],
  lineItems: LineItem[],
  markupPct: number
): {
  internalCost: number;
  customerTotal: number;
  grossProfit: number;
  margin: number;
  marginStatus: "Healthy" | "Warning" | "Critical";
} {
  const internalCost = internalBudgetItems.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  // Customer total: use customer line items if provided, otherwise apply markup to internal cost
  const customerTotal =
    lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      : internalCost * (1 + markupPct / 100);

  const grossProfit = customerTotal - internalCost;
  const margin = customerTotal > 0 ? (grossProfit / customerTotal) * 100 : 0;

  return {
    internalCost,
    customerTotal,
    grossProfit,
    margin,
    marginStatus: computeMarginStatus(margin),
  };
}
