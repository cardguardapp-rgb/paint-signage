import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  numeric,
  json,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { estimatesTable } from "./estimates";
import { z } from "zod/v4";

export interface InvoiceLineItem {
  description: string;
  displayName?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
}

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  estimateId: integer("estimate_id").references(() => estimatesTable.id),
  percentage: numeric("percentage", { precision: 5, scale: 2 })
    .notNull()
    .default("100"),
  status: text("status").notNull().default("Draft"),
  lineItems: json("line_items").$type<InvoiceLineItem[]>().notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  balanceDue: numeric("balance_due", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("Bank Transfer"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const createInvoiceSchema = z.object({
  estimateId: z.number().int().optional(),
  percentage: z.number().min(1).max(100).default(100),
  taxRate: z.number().min(0).max(100).default(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  status: z
    .enum(["Draft", "Sent", "PartiallyPaid", "Paid", "Overdue", "Void"])
    .optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z
    .enum(["Bank Transfer", "Cash", "Credit Card", "Cheque", "Other"])
    .default("Bank Transfer"),
  paidAt: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
