import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  json,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const jobPhasesTable = pgTable("job_phases", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#f97316"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  assignedUserIds: json("assigned_user_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type JobPhase = typeof jobPhasesTable.$inferSelect;

export const phaseSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  assignedUserIds: z.array(z.number()).optional(),
});
