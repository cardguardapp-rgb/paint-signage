import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  jobsTable,
  swmsFormsTable,
  swmsSignaturesTable,
  createSwmsSchema,
  updateSwmsHazardsSchema,
  signSwmsSchema,
} from "@workspace/db";
import type { SwmsHazardEntry } from "@workspace/db";

const router: IRouter = Router();

// ─── Default hazard template ────────────────────────────────────
const DEFAULT_HAZARDS: SwmsHazardEntry[] = [
  {
    key: "working_at_heights",
    label: "Working at Heights (>2m)",
    isSelected: false,
    severity: "High",
    controlMeasure:
      "Use scaffolding or elevated work platform with fall arrest. Inspect equipment before use. Maintain 3-point contact on ladders. Exclusion zone below work area.",
  },
  {
    key: "chemical_exposure",
    label: "Chemical/Solvent Exposure (Paints, Primers, Adhesives)",
    isSelected: false,
    severity: "High",
    controlMeasure:
      "Review SDS before use. Wear appropriate PPE (gloves, respirator, safety glasses). Ensure adequate ventilation. Store and dispose of chemicals per local regulations.",
  },
  {
    key: "electrical_hazards",
    label: "Electrical Hazards (Signage Wiring, LED Installations)",
    isSelected: false,
    severity: "High",
    controlMeasure:
      "Isolate and lock out / tag out electrical supply before work. Only licensed electricians to perform electrical connections. Test before re-energising.",
  },
  {
    key: "manual_handling",
    label: "Manual Handling (Heavy Panels, Equipment)",
    isSelected: false,
    severity: "Medium",
    controlMeasure:
      "Use mechanical aids where possible. Team lift for items >20kg. Use correct lifting technique. Pre-plan movement paths and clear route.",
  },
  {
    key: "slips_trips_falls",
    label: "Slips, Trips & Falls (Wet Surfaces, Cables)",
    isSelected: false,
    severity: "Medium",
    controlMeasure:
      "Keep work area tidy. Secure cables and hoses. Use wet floor signage. Wear non-slip footwear. Barricade wet paint areas.",
  },
  {
    key: "traffic_management",
    label: "Traffic / Pedestrian Management (Roadside Work)",
    isSelected: false,
    severity: "High",
    controlMeasure:
      "Establish traffic management plan per local authority requirements. Use spotters, barriers, and high-visibility PPE. Brief all crew on the TMP before starting.",
  },
  {
    key: "uv_heat_exposure",
    label: "UV / Heat Exposure (Outdoor Work)",
    isSelected: false,
    severity: "Low",
    controlMeasure:
      "Schedule heavy work during cooler parts of the day. Wear sun protection (hat, SPF50+ sunscreen, long sleeves). Hydration breaks every 30–45 min.",
  },
  {
    key: "noise_exposure",
    label: "Noise Exposure (Power Tools, Angle Grinders)",
    isSelected: false,
    severity: "Medium",
    controlMeasure:
      "Wear hearing protection when operating noisy equipment. Limit exposure duration. Use quieter methods where practicable.",
  },
  {
    key: "eye_skin_injuries",
    label: "Eye & Skin Injuries (Spray Painting, Chemicals)",
    isSelected: false,
    severity: "Medium",
    controlMeasure:
      "Wear splash-proof safety glasses or full face shield. Wear chemical-resistant gloves. Wash skin immediately if contaminated. Have eyewash station on site.",
  },
  {
    key: "confined_spaces",
    label: "Confined Spaces (Internal Sign Installations)",
    isSelected: false,
    severity: "High",
    controlMeasure:
      "Do not enter without confined space entry permit. Atmospheric testing required before entry. Attendant outside at all times. Emergency rescue plan in place.",
  },
];

// ─── Helper ───────────────────────────────────────────────────────
async function formatForm(form: typeof swmsFormsTable.$inferSelect) {
  const signatures = await db
    .select()
    .from(swmsSignaturesTable)
    .where(eq(swmsSignaturesTable.swmsFormId, form.id))
    .orderBy(swmsSignaturesTable.signedAt);

  return {
    ...form,
    hazards: form.hazards as SwmsHazardEntry[],
    signatures: signatures.map((s) => ({
      ...s,
      signedAt: s.signedAt.toISOString(),
    })),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /jobs/:jobId/swms — list SWMS forms for a job
router.get("/jobs/:jobId/swms", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }

  const forms = await db
    .select()
    .from(swmsFormsTable)
    .where(eq(swmsFormsTable.jobId, jobId))
    .orderBy(swmsFormsTable.createdAt);

  // Get signature counts per form
  const formIds = forms.map((f) => f.id);
  const sigCounts =
    formIds.length > 0
      ? await db
          .select({ formId: swmsSignaturesTable.swmsFormId })
          .from(swmsSignaturesTable)
          .where(inArray(swmsSignaturesTable.swmsFormId, formIds))
      : [];

  const countMap = new Map<number, number>();
  for (const s of sigCounts) {
    countMap.set(s.formId, (countMap.get(s.formId) ?? 0) + 1);
  }

  const result = forms.map((f) => ({
    ...f,
    hazards: f.hazards as SwmsHazardEntry[],
    signatureCount: countMap.get(f.id) ?? 0,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }));

  res.json(result);
});

// POST /jobs/:jobId/swms — create a new SWMS form
router.post("/jobs/:jobId/swms", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }

  const [job] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(eq(jobsTable.id, jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const parsed = createSwmsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [form] = await db
    .insert(swmsFormsTable)
    .values({
      jobId,
      templateType: parsed.data.templateType,
      title: parsed.data.title,
      hazards: DEFAULT_HAZARDS,
      status: "PendingSignatures",
    })
    .returning();

  res.status(201).json(await formatForm(form));
});

// GET /jobs/:jobId/swms/:swmsId — get a SWMS form with signatures
router.get("/jobs/:jobId/swms/:swmsId", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const swmsId = Number(req.params.swmsId);
  if (!jobId || isNaN(jobId) || !swmsId || isNaN(swmsId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [form] = await db
    .select()
    .from(swmsFormsTable)
    .where(eq(swmsFormsTable.id, swmsId));

  if (!form || form.jobId !== jobId) {
    res.status(404).json({ error: "SWMS form not found" });
    return;
  }

  res.json(await formatForm(form));
});

// PUT /jobs/:jobId/swms/:swmsId — update hazards
router.put("/jobs/:jobId/swms/:swmsId", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const swmsId = Number(req.params.swmsId);
  if (!jobId || isNaN(jobId) || !swmsId || isNaN(swmsId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const parsed = updateSwmsHazardsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: swmsFormsTable.id, jobId: swmsFormsTable.jobId })
    .from(swmsFormsTable)
    .where(eq(swmsFormsTable.id, swmsId));

  if (!existing || existing.jobId !== jobId) {
    res.status(404).json({ error: "SWMS form not found" });
    return;
  }

  const [updated] = await db
    .update(swmsFormsTable)
    .set({ hazards: parsed.data.hazards, updatedAt: new Date() })
    .where(eq(swmsFormsTable.id, swmsId))
    .returning();

  res.json(await formatForm(updated));
});

// POST /jobs/:jobId/swms/:swmsId/sign — sign off
router.post("/jobs/:jobId/swms/:swmsId/sign", async (req, res): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const swmsId = Number(req.params.swmsId);
  if (!jobId || isNaN(jobId) || !swmsId || isNaN(swmsId)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const parsed = signSwmsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [form] = await db
    .select()
    .from(swmsFormsTable)
    .where(eq(swmsFormsTable.id, swmsId));

  if (!form || form.jobId !== jobId) {
    res.status(404).json({ error: "SWMS form not found" });
    return;
  }

  await db.insert(swmsSignaturesTable).values({
    swmsFormId: swmsId,
    userId: parsed.data.userId ?? null,
    signerName: parsed.data.signerName,
  });

  // Update form status to Compliant
  await db
    .update(swmsFormsTable)
    .set({ status: "Compliant", updatedAt: new Date() })
    .where(eq(swmsFormsTable.id, swmsId));

  const [refreshed] = await db
    .select()
    .from(swmsFormsTable)
    .where(eq(swmsFormsTable.id, swmsId));

  res.json(await formatForm(refreshed));
});

export default router;
