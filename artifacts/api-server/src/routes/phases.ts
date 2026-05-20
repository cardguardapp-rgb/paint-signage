import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, jobPhasesTable, jobsTable, notificationsTable } from "@workspace/db";
import { phaseSchema } from "@workspace/db";

const router: IRouter = Router();

function formatPhase(p: typeof jobPhasesTable.$inferSelect) {
  return {
    ...p,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    endDate: p.endDate ? p.endDate.toISOString() : null,
    assignedUserIds: p.assignedUserIds as number[],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Schedule view: Approved + Scheduled + InProgress jobs with phases
router.get("/schedule", async (req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(inArray(jobsTable.stage, ["Approved", "Scheduled", "InProgress"]));

  if (jobs.length === 0) {
    res.json([]);
    return;
  }

  const jobIds = jobs.map((j) => j.id);
  const phases = await db
    .select()
    .from(jobPhasesTable)
    .where(inArray(jobPhasesTable.jobId, jobIds))
    .orderBy(jobPhasesTable.startDate);

  const phasesByJob = new Map<number, typeof phases>();
  for (const phase of phases) {
    if (!phasesByJob.has(phase.jobId)) phasesByJob.set(phase.jobId, []);
    phasesByJob.get(phase.jobId)!.push(phase);
  }

  const result = jobs.map((job) => ({
    id: job.id,
    title: job.title,
    stage: job.stage,
    clientName: null as string | null,
    scheduledStart: job.scheduledStart ? job.scheduledStart.toISOString() : null,
    scheduledEnd: job.scheduledEnd ? job.scheduledEnd.toISOString() : null,
    siteAddress: job.siteAddress ?? null,
    phases: (phasesByJob.get(job.id) ?? []).map(formatPhase),
  }));

  res.json(result);
});

// List phases for a job
router.get("/jobs/:jobId/phases", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId) { res.status(400).json({ error: "Invalid jobId" }); return; }
  const phases = await db
    .select()
    .from(jobPhasesTable)
    .where(eq(jobPhasesTable.jobId, jobId))
    .orderBy(jobPhasesTable.startDate);
  res.json(phases.map(formatPhase));
});

// Create a phase
router.post("/jobs/:jobId/phases", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId) { res.status(400).json({ error: "Invalid jobId" }); return; }

  const parsed = phaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, color, startDate, endDate, assignedUserIds } = parsed.data;

  const [phase] = await db
    .insert(jobPhasesTable)
    .values({
      jobId,
      name,
      color: color ?? "#f97316",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      assignedUserIds: assignedUserIds ?? [],
    })
    .returning();

  // Notify assigned Field Crew users
  if (assignedUserIds && assignedUserIds.length > 0) {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (job) {
      await Promise.all(
        assignedUserIds.map((userId) =>
          db.insert(notificationsTable).values({
            userId,
            type: "job_assigned",
            message: `You've been assigned to phase "${name}" on job "${job.title}"`,
            jobId,
          })
        )
      );
    }
  }

  res.status(201).json(formatPhase(phase));
});

// Update a phase
router.patch("/jobs/:jobId/phases/:phaseId", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const phaseId = Number(req.params.phaseId);
  if (!jobId || !phaseId) { res.status(400).json({ error: "Invalid params" }); return; }

  const parsed = phaseSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db
    .select()
    .from(jobPhasesTable)
    .where(and(eq(jobPhasesTable.id, phaseId), eq(jobPhasesTable.jobId, jobId)));
  if (!existing) { res.status(404).json({ error: "Phase not found" }); return; }

  const updates: Partial<typeof jobPhasesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (parsed.data.assignedUserIds !== undefined) {
    updates.assignedUserIds = parsed.data.assignedUserIds;
    // Notify newly added users
    const previousIds = (existing.assignedUserIds as number[]) ?? [];
    const newIds = parsed.data.assignedUserIds.filter((id) => !previousIds.includes(id));
    if (newIds.length > 0) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (job) {
        await Promise.all(
          newIds.map((userId) =>
            db.insert(notificationsTable).values({
              userId,
              type: "job_assigned",
              message: `You've been assigned to phase "${existing.name}" on job "${job.title}"`,
              jobId,
            })
          )
        );
      }
    }
  }

  const [phase] = await db
    .update(jobPhasesTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(jobPhasesTable.id, phaseId), eq(jobPhasesTable.jobId, jobId)))
    .returning();

  res.json(formatPhase(phase));
});

// Delete a phase
router.delete("/jobs/:jobId/phases/:phaseId", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const phaseId = Number(req.params.phaseId);
  if (!jobId || !phaseId) { res.status(400).json({ error: "Invalid params" }); return; }

  const [phase] = await db
    .delete(jobPhasesTable)
    .where(and(eq(jobPhasesTable.id, phaseId), eq(jobPhasesTable.jobId, jobId)))
    .returning();
  if (!phase) { res.status(404).json({ error: "Phase not found" }); return; }

  res.sendStatus(204);
});

export default router;
