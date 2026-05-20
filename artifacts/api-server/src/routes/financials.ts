import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import {
  db,
  jobsTable,
  estimatesTable,
  invoicesTable,
  clientsTable,
} from "@workspace/db";

const router: IRouter = Router();

// GET /financials/summary
router.get("/financials/summary", async (_req, res): Promise<void> => {
  const jobs = await db
    .select({ stage: jobsTable.stage, estimatedValue: jobsTable.estimatedValue })
    .from(jobsTable);

  const activeStages = new Set([
    "Approved",
    "Scheduled",
    "InProgress",
    "ComplianceReview",
  ]);
  const quoteStages = new Set(["Lead", "Quoting"]);

  let quotePipelineValue = 0;
  let activePipelineValue = 0;
  for (const job of jobs) {
    const val = Number(job.estimatedValue ?? 0);
    if (quoteStages.has(job.stage)) quotePipelineValue += val;
    else if (activeStages.has(job.stage)) activePipelineValue += val;
  }

  const invoices = await db
    .select({
      totalAmount: invoicesTable.totalAmount,
      amountPaid: invoicesTable.amountPaid,
      balanceDue: invoicesTable.balanceDue,
      status: invoicesTable.status,
    })
    .from(invoicesTable);

  let totalInvoiced = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  let invoiceCount = 0;
  for (const inv of invoices) {
    if (inv.status === "Void") continue;
    totalInvoiced += Number(inv.totalAmount);
    totalReceived += Number(inv.amountPaid);
    totalOutstanding += Number(inv.balanceDue);
    invoiceCount++;
  }

  const estimates = await db
    .select({
      internalCost: estimatesTable.internalCost,
      customerTotal: estimatesTable.customerTotal,
      status: estimatesTable.status,
      customerStatus: estimatesTable.customerStatus,
    })
    .from(estimatesTable);

  let totalInternalBudget = 0;
  let totalEstimatedRevenue = 0;
  for (const est of estimates) {
    if (est.status === "Approved" || est.customerStatus === "Approved") {
      totalInternalBudget += Number(est.internalCost);
      totalEstimatedRevenue += Number(est.customerTotal);
    }
  }

  const expectedGrossProfit = totalEstimatedRevenue - totalInternalBudget;
  const expectedMargin =
    totalEstimatedRevenue > 0
      ? (expectedGrossProfit / totalEstimatedRevenue) * 100
      : 0;
  const actualGrossProfit = totalInvoiced - totalInternalBudget;
  const actualMargin =
    totalInvoiced > 0 ? (actualGrossProfit / totalInvoiced) * 100 : 0;

  res.json({
    pipeline: {
      quotePipelineValue: Math.round(quotePipelineValue * 100) / 100,
      activePipelineValue: Math.round(activePipelineValue * 100) / 100,
      totalPipelineValue:
        Math.round((quotePipelineValue + activePipelineValue) * 100) / 100,
    },
    invoicing: {
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      invoiceCount,
    },
    profitability: {
      totalInternalBudget: Math.round(totalInternalBudget * 100) / 100,
      totalEstimatedRevenue: Math.round(totalEstimatedRevenue * 100) / 100,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      expectedGrossProfit: Math.round(expectedGrossProfit * 100) / 100,
      expectedMargin: Math.round(expectedMargin * 10) / 10,
      actualGrossProfit: Math.round(actualGrossProfit * 100) / 100,
      actualMargin: Math.round(actualMargin * 10) / 10,
    },
  });
});

// GET /financials/receivables
router.get("/financials/receivables", async (_req, res): Promise<void> => {
  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      jobId: invoicesTable.jobId,
      status: invoicesTable.status,
      totalAmount: invoicesTable.totalAmount,
      amountPaid: invoicesTable.amountPaid,
      balanceDue: invoicesTable.balanceDue,
      dueDate: invoicesTable.dueDate,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .where(
      sql`${invoicesTable.status} IN ('Sent', 'PartiallyPaid', 'Overdue') AND ${invoicesTable.balanceDue} > 0`
    );

  const jobIds = [...new Set(invoices.map((i) => i.jobId))];
  const jobDetails =
    jobIds.length > 0
      ? await db
          .select({
            id: jobsTable.id,
            title: jobsTable.title,
            clientId: jobsTable.clientId,
          })
          .from(jobsTable)
          .where(inArray(jobsTable.id, jobIds))
      : [];

  const clientIds = [
    ...new Set(jobDetails.filter((j) => j.clientId).map((j) => j.clientId!)),
  ];
  const clientDetails =
    clientIds.length > 0
      ? await db
          .select({ id: clientsTable.id, companyName: clientsTable.companyName })
          .from(clientsTable)
          .where(inArray(clientsTable.id, clientIds))
      : [];

  const jobMap = new Map(jobDetails.map((j) => [j.id, j]));
  const clientMap = new Map(clientDetails.map((c) => [c.id, c]));
  const now = new Date();

  const result = invoices.map((inv) => {
    const job = jobMap.get(inv.jobId);
    const client = job?.clientId ? clientMap.get(job.clientId) : null;
    const dueDate = inv.dueDate;
    const daysOverdue = dueDate
      ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    let ageBucket: string;
    if (daysOverdue <= 0) ageBucket = "Current";
    else if (daysOverdue <= 30) ageBucket = "1-30 days";
    else if (daysOverdue <= 60) ageBucket = "31-60 days";
    else if (daysOverdue <= 90) ageBucket = "61-90 days";
    else ageBucket = "90+ days";

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      jobId: inv.jobId,
      jobTitle: job?.title ?? `Job #${inv.jobId}`,
      clientName: client?.companyName ?? null,
      status: inv.status,
      totalAmount: Number(inv.totalAmount),
      balanceDue: Number(inv.balanceDue),
      amountPaid: Number(inv.amountPaid),
      dueDate: dueDate?.toISOString() ?? null,
      daysOverdue,
      ageBucket,
    };
  });

  result.sort((a, b) => b.daysOverdue - a.daysOverdue);
  res.json(result);
});

export default router;
