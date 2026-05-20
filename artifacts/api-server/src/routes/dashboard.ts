import { Router, type IRouter } from "express";
import { eq, count, sum, desc } from "drizzle-orm";
import { db, jobsTable, estimatesTable, activityTable, clientsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalJobs: count(jobsTable.id),
    })
    .from(jobsTable);

  const activeStages = ["Lead", "Quoting", "Approved", "Scheduled", "InProgress", "ComplianceReview"];
  const [activeResult] = await db
    .select({ count: count(jobsTable.id) })
    .from(jobsTable)
    .where(sql`${jobsTable.stage} = ANY(ARRAY['Lead','Quoting','Approved','Scheduled','InProgress','ComplianceReview']::job_stage[])`);

  const [pipelineResult] = await db
    .select({ total: sum(jobsTable.estimatedValue) })
    .from(jobsTable)
    .where(sql`${jobsTable.stage} != 'Closed'`);

  const [attentionResult] = await db
    .select({ count: count(jobsTable.id) })
    .from(jobsTable)
    .where(sql`${jobsTable.stage} IN ('ComplianceReview','Quoting') OR (${jobsTable.stage} = 'Quoting' AND ${jobsTable.hasApprovedEstimate} = false)`);

  const [estimatesPendingResult] = await db
    .select({ count: count(estimatesTable.id) })
    .from(estimatesTable)
    .where(eq(estimatesTable.status, "Sent"));

  // Jobs closed this calendar month
  const [closedResult] = await db
    .select({ count: count(jobsTable.id) })
    .from(jobsTable)
    .where(sql`${jobsTable.stage} = 'Closed' AND DATE_TRUNC('month', ${jobsTable.updatedAt}) = DATE_TRUNC('month', NOW())`);

  res.json({
    totalJobs: totals?.totalJobs ?? 0,
    activeJobs: activeResult?.count ?? 0,
    totalPipelineValue: Number(pipelineResult?.total ?? 0),
    jobsNeedingAttention: attentionResult?.count ?? 0,
    estimatesPendingApproval: estimatesPendingResult?.count ?? 0,
    closedThisMonth: closedResult?.count ?? 0,
  });
});

router.get("/dashboard/pipeline", async (req, res): Promise<void> => {
  const stageOrder = [
    "Lead",
    "Quoting",
    "Approved",
    "Scheduled",
    "InProgress",
    "ComplianceReview",
    "Invoiced",
    "Closed",
  ];

  const rows = await db
    .select({
      stage: jobsTable.stage,
      count: count(jobsTable.id),
      totalValue: sum(jobsTable.estimatedValue),
    })
    .from(jobsTable)
    .groupBy(jobsTable.stage);

  // Fill in zeros for empty stages
  const resultMap = new Map(rows.map((r) => [r.stage, r]));
  const pipeline = stageOrder.map((stage) => {
    const row = resultMap.get(stage as typeof jobsTable.$inferSelect["stage"]);
    return {
      stage,
      count: row?.count ?? 0,
      totalValue: Number(row?.totalValue ?? 0),
    };
  });

  res.json(pipeline);
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const activities = await db
    .select({
      id: activityTable.id,
      jobId: activityTable.jobId,
      jobTitle: jobsTable.title,
      action: activityTable.action,
      stage: activityTable.stage,
      timestamp: activityTable.createdAt,
    })
    .from(activityTable)
    .leftJoin(jobsTable, eq(activityTable.jobId, jobsTable.id))
    .orderBy(desc(activityTable.createdAt))
    .limit(10);

  res.json(
    activities.map((a) => ({
      ...a,
      jobTitle: a.jobTitle ?? "Unknown Job",
      timestamp: a.timestamp.toISOString(),
    }))
  );
});

export default router;
