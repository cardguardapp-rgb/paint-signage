import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, estimatesTable, jobsTable, clientsTable, activityTable } from "@workspace/db";
import { internalBudgetItemSchema, lineItemSchema } from "@workspace/db";
import {
  GetPublicQuoteParams,
  RespondToQuoteParams,
  RespondToQuoteBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatEstimate(est: typeof estimatesTable.$inferSelect) {
  return {
    ...est,
    internalBudgetItems: est.internalBudgetItems as ReturnType<typeof internalBudgetItemSchema.parse>[],
    lineItems: est.lineItems as ReturnType<typeof lineItemSchema.parse>[],
    markupPercentage: Number(est.markupPercentage),
    customerTotal: Number(est.customerTotal),
    internalCost: Number(est.internalCost),
    grossProfit: Number(est.grossProfit),
    margin: Number(est.margin),
    createdAt: est.createdAt.toISOString(),
    updatedAt: est.updatedAt.toISOString(),
  };
}

// Public customer quote view — no auth required
router.get("/quotes/:token", async (req, res): Promise<void> => {
  const params = GetPublicQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(eq(estimatesTable.shareToken, params.data.token));

  if (!estimate) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, estimate.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  let companyName = "ProSignage";
  let clientName = "Valued Client";
  let clientEmail = "";

  if (job.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId));
    if (client) {
      companyName = client.companyName;
      clientName = client.contactName;
      clientEmail = client.email;
    }
  }

  res.json({
    estimate: formatEstimate(estimate),
    jobTitle: job.title,
    siteAddress: job.siteAddress ?? null,
    companyName,
    clientName,
    clientEmail,
  });
});

// Customer responds to the quote (approve or request changes)
router.post("/quotes/:token/respond", async (req, res): Promise<void> => {
  const params = RespondToQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RespondToQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(eq(estimatesTable.shareToken, params.data.token));

  if (!estimate) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const customerStatus =
    parsed.data.action === "approve" ? "Approved" : "ChangesRequested";

  const [updated] = await db
    .update(estimatesTable)
    .set({
      customerStatus,
      customerNote: parsed.data.note ?? null,
      status: parsed.data.action === "approve" ? "Approved" : estimate.status,
      updatedAt: new Date(),
    })
    .where(eq(estimatesTable.shareToken, params.data.token))
    .returning();

  // If the customer approved, mark the job as having an approved estimate
  if (parsed.data.action === "approve") {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, estimate.jobId));
    if (job) {
      const newStage =
        job.stage === "Lead" || job.stage === "Quoting" ? "Approved" : job.stage;
      await db
        .update(jobsTable)
        .set({ hasApprovedEstimate: true, stage: newStage as typeof job.stage, updatedAt: new Date() })
        .where(eq(jobsTable.id, estimate.jobId));
      await db.insert(activityTable).values({
        jobId: job.id,
        action: "Customer approved the quote",
        stage: newStage,
      });
    }
  } else {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, estimate.jobId));
    if (job) {
      await db.insert(activityTable).values({
        jobId: job.id,
        action: "Customer requested changes on the quote",
        stage: job.stage,
      });
    }
  }

  // Return the full CustomerQuoteView
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, updated.jobId));
  let companyName = "ProSignage";
  let clientName = "Valued Client";
  let clientEmail = "";

  if (job?.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, job.clientId));
    if (client) {
      companyName = client.companyName;
      clientName = client.contactName;
      clientEmail = client.email;
    }
  }

  res.json({
    estimate: formatEstimate(updated),
    jobTitle: job?.title ?? "Job",
    siteAddress: job?.siteAddress ?? null,
    companyName,
    clientName,
    clientEmail,
  });
});

export default router;
