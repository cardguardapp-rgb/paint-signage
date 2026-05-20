import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  jobsTable,
  estimatesTable,
  invoicesTable,
  invoicePaymentsTable,
  createInvoiceSchema,
  updateInvoiceSchema,
  recordPaymentSchema,
} from "@workspace/db";
import type { InvoiceLineItem, LineItem } from "@workspace/db";

const router: IRouter = Router();

async function generateInvoiceNumber(): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable);
  const num = Number(result[0].count) + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(num).padStart(4, "0")}`;
}

async function formatInvoice(inv: typeof invoicesTable.$inferSelect) {
  const payments = await db
    .select()
    .from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, inv.id))
    .orderBy(invoicePaymentsTable.paidAt);
  return {
    ...inv,
    lineItems: inv.lineItems as InvoiceLineItem[],
    percentage: Number(inv.percentage),
    subtotal: Number(inv.subtotal),
    taxRate: Number(inv.taxRate),
    taxAmount: Number(inv.taxAmount),
    totalAmount: Number(inv.totalAmount),
    amountPaid: Number(inv.amountPaid),
    balanceDue: Number(inv.balanceDue),
    payments: payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      paidAt: p.paidAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
    dueDate: inv.dueDate?.toISOString() ?? null,
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

// GET /jobs/:jobId/invoices
router.get("/jobs/:jobId/invoices", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }
  const invList = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.jobId, jobId))
    .orderBy(invoicesTable.createdAt);
  const result = await Promise.all(invList.map(formatInvoice));
  res.json(result);
});

// POST /jobs/:jobId/invoices
router.post("/jobs/:jobId/invoices", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { estimateId, percentage, taxRate, dueDate, notes } = parsed.data;

  // Find the approved estimate
  const allEstimates = await db
    .select()
    .from(estimatesTable)
    .where(eq(estimatesTable.jobId, jobId));

  let estimate = estimateId
    ? (allEstimates.find((e) => e.id === estimateId) ?? null)
    : (allEstimates.find(
        (e) => e.status === "Approved" || e.customerStatus === "Approved"
      ) ?? null);

  // Build scaled line items
  const scale = percentage / 100;
  const lineItems: InvoiceLineItem[] = [];
  if (estimate && (estimate.lineItems as LineItem[]).length > 0) {
    for (const item of estimate.lineItems as LineItem[]) {
      const scaledQty = Math.round(item.quantity * scale * 100) / 100;
      lineItems.push({
        description: item.description,
        displayName: item.displayName,
        quantity: scaledQty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: Math.round(scaledQty * item.unitPrice * 100) / 100,
      });
    }
  } else if (estimate) {
    // Estimate has no line items; use customerTotal
    const baseAmount =
      Math.round(Number(estimate.customerTotal) * scale * 100) / 100;
    lineItems.push({
      description: "Construction & Signage Services",
      quantity: 1,
      unitPrice: baseAmount,
      total: baseAmount,
    });
  } else if (job.estimatedValue) {
    // No estimate; use job estimated value
    const baseAmount =
      Math.round(Number(job.estimatedValue) * scale * 100) / 100;
    lineItems.push({
      description: "Construction & Signage Services",
      quantity: 1,
      unitPrice: baseAmount,
      total: baseAmount,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
  const dueDateValue = dueDate
    ? new Date(dueDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const invoiceNumber = await generateInvoiceNumber();

  const [created] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber,
      jobId,
      estimateId: estimate?.id ?? null,
      percentage: String(percentage),
      status: "Draft",
      lineItems,
      subtotal: String(Math.round(subtotal * 100) / 100),
      taxRate: String(taxRate),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      amountPaid: "0",
      balanceDue: String(totalAmount),
      dueDate: dueDateValue,
      notes: notes ?? null,
    })
    .returning();

  res.status(201).json(await formatInvoice(created));
});

// GET /jobs/:jobId/invoices/:invoiceId
router.get(
  "/jobs/:jobId/invoices/:invoiceId",
  async (req, res): Promise<void> => {
    const jobId = Number(req.params.jobId);
    const invoiceId = Number(req.params.invoiceId);
    if (!jobId || isNaN(jobId) || !invoiceId || isNaN(invoiceId)) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const [inv] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId));
    if (!inv || inv.jobId !== jobId) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json(await formatInvoice(inv));
  }
);

// PATCH /jobs/:jobId/invoices/:invoiceId
router.patch(
  "/jobs/:jobId/invoices/:invoiceId",
  async (req, res): Promise<void> => {
    const jobId = Number(req.params.jobId);
    const invoiceId = Number(req.params.invoiceId);
    if (!jobId || isNaN(jobId) || !invoiceId || isNaN(invoiceId)) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId));
    if (!existing || existing.jobId !== jobId) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const updates: Partial<typeof invoicesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.dueDate !== undefined)
      updates.dueDate = new Date(parsed.data.dueDate);
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.status === "Sent" && !existing.sentAt)
      updates.sentAt = new Date();

    const [updated] = await db
      .update(invoicesTable)
      .set(updates)
      .where(eq(invoicesTable.id, invoiceId))
      .returning();
    res.json(await formatInvoice(updated));
  }
);

// POST /jobs/:jobId/invoices/:invoiceId/payments
router.post(
  "/jobs/:jobId/invoices/:invoiceId/payments",
  async (req, res): Promise<void> => {
    const jobId = Number(req.params.jobId);
    const invoiceId = Number(req.params.invoiceId);
    if (!jobId || isNaN(jobId) || !invoiceId || isNaN(invoiceId)) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [inv] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId));
    if (!inv || inv.jobId !== jobId) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (inv.status === "Void") {
      res
        .status(400)
        .json({ error: "Cannot record payment on a voided invoice" });
      return;
    }

    const { amount, paymentMethod, paidAt, reference, notes } = parsed.data;
    const newAmountPaid =
      Math.round((Number(inv.amountPaid) + amount) * 100) / 100;
    const newBalanceDue = Math.max(
      0,
      Math.round((Number(inv.totalAmount) - newAmountPaid) * 100) / 100
    );
    const isPaid = newBalanceDue <= 0;
    const newStatus = isPaid
      ? "Paid"
      : newAmountPaid > 0
        ? "PartiallyPaid"
        : inv.status;

    await db.insert(invoicePaymentsTable).values({
      invoiceId,
      amount: String(amount),
      paymentMethod,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      reference: reference ?? null,
      notes: notes ?? null,
    });

    const [updated] = await db
      .update(invoicesTable)
      .set({
        amountPaid: String(newAmountPaid),
        balanceDue: String(newBalanceDue),
        status: newStatus,
        paidAt: isPaid ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoicesTable.id, invoiceId))
      .returning();

    res.json(await formatInvoice(updated));
  }
);

export default router;
