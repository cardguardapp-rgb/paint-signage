import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, jobsTable, clientsTable, usersTable, activityTable, notificationsTable } from "@workspace/db";
import { STAGE_ORDER, NEXT_STAGE, REQUIRES_APPROVED_ESTIMATE_BEFORE } from "@workspace/db";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  UpdateJobParams,
  UpdateJobBody,
  DeleteJobParams,
  AdvanceJobStageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichJob(job: typeof jobsTable.$inferSelect) {
  const clientId = job.clientId;
  const assignedToId = job.assignedToId;
  let clientName: string | null = null;
  let assignedToName: string | null = null;

  if (clientId) {
    const [client] = await db.select({ companyName: clientsTable.companyName }).from(clientsTable).where(eq(clientsTable.id, clientId));
    clientName = client?.companyName ?? null;
  }
  if (assignedToId) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, assignedToId));
    assignedToName = user?.name ?? null;
  }

  return {
    ...job,
    estimatedValue: job.estimatedValue ? Number(job.estimatedValue) : null,
    clientName,
    assignedToName,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

router.get("/jobs", async (req, res): Promise<void> => {
  const queryParams = ListJobsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let query = db.select().from(jobsTable);
  const conditions = [];

  if (queryParams.data.stage) {
    conditions.push(eq(jobsTable.stage, queryParams.data.stage as typeof jobsTable.$inferSelect["stage"]));
  }
  if (queryParams.data.clientId) {
    conditions.push(eq(jobsTable.clientId, queryParams.data.clientId));
  }

  const jobs = conditions.length
    ? await db.select().from(jobsTable).where(and(...conditions)).orderBy(jobsTable.updatedAt)
    : await db.select().from(jobsTable).orderBy(jobsTable.updatedAt);

  const enriched = await Promise.all(jobs.map(enrichJob));
  res.json(enriched);
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { scheduledStart, scheduledEnd, ...rest } = parsed.data;
  const [job] = await db.insert(jobsTable).values({
    ...rest,
    scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
    scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
  }).returning();

  await db.insert(activityTable).values({
    jobId: job.id,
    action: "Job created",
    stage: job.stage,
  });

  res.status(201).json(await enrichJob(job));
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(await enrichJob(job));
});

router.patch("/jobs/:id", async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // If requesting stage change, validate transition
  if (parsed.data.stage) {
    const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const allowedTransitions = STAGE_ORDER[existing.stage] ?? [];
    if (!allowedTransitions.includes(parsed.data.stage)) {
      res.status(400).json({
        error: `Cannot transition from '${existing.stage}' to '${parsed.data.stage}'. Allowed transitions: ${allowedTransitions.join(", ") || "none"}`,
      });
      return;
    }

    // Require approved estimate to move into Scheduled or InProgress
    if (REQUIRES_APPROVED_ESTIMATE_BEFORE.includes(parsed.data.stage) && !existing.hasApprovedEstimate) {
      res.status(400).json({
        error: `An approved estimate is required before moving a job to '${parsed.data.stage}'.`,
      });
      return;
    }
  }

  const { scheduledStart, scheduledEnd, ...rest } = parsed.data;
  const [job] = await db
    .update(jobsTable)
    .set({
      ...rest,
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (parsed.data.stage) {
    await db.insert(activityTable).values({
      jobId: job.id,
      action: `Stage changed to ${parsed.data.stage}`,
      stage: job.stage,
    });
  }

  res.json(await enrichJob(job));
});

router.delete("/jobs/:id", async (req, res): Promise<void> => {
  const params = DeleteJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [job] = await db.delete(jobsTable).where(eq(jobsTable.id, params.data.id)).returning();
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.sendStatus(204);
});

// State-machine advance endpoint — moves job to the next valid stage
router.post("/jobs/:id/advance-stage", async (req, res): Promise<void> => {
  const params = AdvanceJobStageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const nextStage = NEXT_STAGE[job.stage];
  if (!nextStage) {
    res.status(400).json({ error: `Job is already at the final stage: ${job.stage}` });
    return;
  }

  // Require approved estimate to advance into Scheduled or InProgress
  if (REQUIRES_APPROVED_ESTIMATE_BEFORE.includes(nextStage) && !job.hasApprovedEstimate) {
    res.status(400).json({
      error: `An approved estimate is required before advancing to '${nextStage}'. Please approve a quote first.`,
    });
    return;
  }

  const [updated] = await db
    .update(jobsTable)
    .set({ stage: nextStage as typeof job.stage, updatedAt: new Date() })
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  await db.insert(activityTable).values({
    jobId: updated.id,
    action: `Advanced to ${nextStage}`,
    stage: nextStage,
  });

  // Notify Field Crew + assigned user when a job enters Scheduled or InProgress
  if (nextStage === "Scheduled" || nextStage === "InProgress") {
    const crewUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "FieldCrew"));
    const notifyIds = new Set<number>(crewUsers.map((u) => u.id));
    if (updated.assignedToId) notifyIds.add(updated.assignedToId);
    if (notifyIds.size > 0) {
      await Promise.all(
        Array.from(notifyIds).map((userId) =>
          db.insert(notificationsTable).values({
            userId,
            type: "job_scheduled",
            message: `Job "${updated.title}" has been moved to ${nextStage}`,
            jobId: updated.id,
          })
        )
      );
    }
  }

  res.json(await enrichJob(updated));
});

export default router;
