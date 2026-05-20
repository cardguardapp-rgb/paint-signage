import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, estimatesTable, jobsTable, activityTable } from "@workspace/db";
import { computeEstimateTotals, lineItemSchema } from "@workspace/db";
import {
  ListEstimatesParams,
  CreateEstimateParams,
  CreateEstimateBody,
  GetEstimateParams,
  UpdateEstimateParams,
  UpdateEstimateBody,
  DeleteEstimateParams,
  ApproveEstimateParams,
} from "@workspace/api-zod";
const lineItemArraySchema = lineItemSchema.array();

const router: IRouter = Router();

function formatEstimate(est: typeof estimatesTable.$inferSelect) {
  return {
    ...est,
    lineItems: est.lineItems as z.infer<typeof lineItemSchema>[],
    markupPercentage: Number(est.markupPercentage),
    customerTotal: Number(est.customerTotal),
    internalCost: Number(est.internalCost),
    margin: Number(est.margin),
    createdAt: est.createdAt.toISOString(),
    updatedAt: est.updatedAt.toISOString(),
  };
}

router.get("/jobs/:jobId/estimates", async (req, res): Promise<void> => {
  const params = ListEstimatesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const estimates = await db
    .select()
    .from(estimatesTable)
    .where(eq(estimatesTable.jobId, params.data.jobId))
    .orderBy(estimatesTable.createdAt);
  res.json(estimates.map(formatEstimate));
});

router.post("/jobs/:jobId/estimates", async (req, res): Promise<void> => {
  const pathParams = CreateEstimateParams.safeParse(req.params);
  if (!pathParams.success) {
    res.status(400).json({ error: pathParams.error.message });
    return;
  }

  const parsed = CreateEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate line items
  const lineItems = lineItemArraySchema.safeParse(parsed.data.lineItems);
  if (!lineItems.success) {
    res.status(400).json({ error: "Invalid line items" });
    return;
  }

  const totals = computeEstimateTotals(lineItems.data, Number(parsed.data.markupPercentage));

  const [estimate] = await db
    .insert(estimatesTable)
    .values({
      jobId: pathParams.data.jobId,
      title: parsed.data.title ?? null,
      lineItems: lineItems.data,
      markupPercentage: String(parsed.data.markupPercentage),
      customerTotal: String(totals.customerTotal),
      internalCost: String(totals.internalCost),
      margin: String(totals.margin),
      marginStatus: totals.marginStatus,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  // Move job to Quoting stage if currently Lead
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, pathParams.data.jobId));
  if (job && job.stage === "Lead") {
    await db
      .update(jobsTable)
      .set({ stage: "Quoting", updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));
    await db.insert(activityTable).values({
      jobId: job.id,
      action: "Estimate created — moved to Quoting",
      stage: "Quoting",
    });
  }

  res.status(201).json(formatEstimate(estimate));
});

router.get("/jobs/:jobId/estimates/:id", async (req, res): Promise<void> => {
  const params = GetEstimateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(and(eq(estimatesTable.id, params.data.id), eq(estimatesTable.jobId, params.data.jobId)));
  if (!estimate) {
    res.status(404).json({ error: "Estimate not found" });
    return;
  }
  res.json(formatEstimate(estimate));
});

router.patch("/jobs/:jobId/estimates/:id", async (req, res): Promise<void> => {
  const pathParams = UpdateEstimateParams.safeParse(req.params);
  if (!pathParams.success) {
    res.status(400).json({ error: pathParams.error.message });
    return;
  }

  const parsed = UpdateEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(estimatesTable)
    .where(and(eq(estimatesTable.id, pathParams.data.id), eq(estimatesTable.jobId, pathParams.data.jobId)));

  if (!existing) {
    res.status(404).json({ error: "Estimate not found" });
    return;
  }

  let updates: Partial<typeof estimatesTable.$inferInsert> = {};

  if (parsed.data.lineItems !== undefined || parsed.data.markupPercentage !== undefined) {
    const lineItems = lineItemArraySchema.safeParse(parsed.data.lineItems ?? existing.lineItems);
    if (!lineItems.success) {
      res.status(400).json({ error: "Invalid line items" });
      return;
    }
    const markup = Number(parsed.data.markupPercentage ?? existing.markupPercentage);
    const totals = computeEstimateTotals(lineItems.data, markup);
    updates = {
      ...updates,
      lineItems: lineItems.data,
      markupPercentage: String(markup),
      customerTotal: String(totals.customerTotal),
      internalCost: String(totals.internalCost),
      margin: String(totals.margin),
      marginStatus: totals.marginStatus,
    };
  }

  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [estimate] = await db
    .update(estimatesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(estimatesTable.id, pathParams.data.id), eq(estimatesTable.jobId, pathParams.data.jobId)))
    .returning();

  res.json(formatEstimate(estimate));
});

router.delete("/jobs/:jobId/estimates/:id", async (req, res): Promise<void> => {
  const params = DeleteEstimateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [estimate] = await db
    .delete(estimatesTable)
    .where(and(eq(estimatesTable.id, params.data.id), eq(estimatesTable.jobId, params.data.jobId)))
    .returning();
  if (!estimate) {
    res.status(404).json({ error: "Estimate not found" });
    return;
  }
  res.sendStatus(204);
});

// Approve estimate — sets status to Approved, sets job.hasApprovedEstimate = true, moves job to Approved stage
router.post("/jobs/:jobId/estimates/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveEstimateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(and(eq(estimatesTable.id, params.data.id), eq(estimatesTable.jobId, params.data.jobId)));

  if (!estimate) {
    res.status(404).json({ error: "Estimate not found" });
    return;
  }

  const [approved] = await db
    .update(estimatesTable)
    .set({ status: "Approved", updatedAt: new Date() })
    .where(eq(estimatesTable.id, params.data.id))
    .returning();

  // Mark job as having an approved estimate and advance to Approved stage
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.jobId));
  if (job && (job.stage === "Lead" || job.stage === "Quoting")) {
    await db
      .update(jobsTable)
      .set({ stage: "Approved", hasApprovedEstimate: true, updatedAt: new Date() })
      .where(eq(jobsTable.id, params.data.jobId));
    await db.insert(activityTable).values({
      jobId: job.id,
      action: "Estimate approved — job moved to Approved",
      stage: "Approved",
    });
  } else if (job) {
    await db
      .update(jobsTable)
      .set({ hasApprovedEstimate: true, updatedAt: new Date() })
      .where(eq(jobsTable.id, params.data.jobId));
  }

  res.json(formatEstimate(approved));
});

export default router;
