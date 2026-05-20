import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSchedule,
  useListUsers,
  useCreatePhase,
  useUpdatePhase,
  useDeletePhase,
  useUpdateJob,
  getGetScheduleQueryKey,
} from "@workspace/api-client-react";
import type { JobPhase, ScheduleJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";

// ─── Date utilities ────────────────────────────────────────────
function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}
function toInputDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const DAY_PX = 28;

const PHASE_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#a855f7",
  "#ef4444", "#14b8a6", "#f59e0b", "#ec4899",
];

const STAGE_COLOR: Record<string, string> = {
  Approved: "bg-blue-100 text-blue-800",
  Scheduled: "bg-green-100 text-green-800",
  InProgress: "bg-orange-100 text-orange-800",
};

// ─── Phase dialog ───────────────────────────────────────────────
interface PhaseDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  jobTitle: string;
  phase: JobPhase | null;
  users: Array<{ id: number; name: string; role: string }>;
  onSave: (data: {
    name: string;
    color: string;
    startDate: string | null;
    endDate: string | null;
    assignedUserIds: number[];
  }) => void;
  onDelete?: () => void;
  saving: boolean;
}

function PhaseDialog({ open, onClose, jobTitle, phase, users, onSave, onDelete, saving }: PhaseDialogProps) {
  const [name, setName] = useState(phase?.name ?? "");
  const [color, setColor] = useState(phase?.color ?? PHASE_COLORS[0]);
  const [startDate, setStartDate] = useState(
    phase?.startDate ? toInputDate(new Date(phase.startDate)) : ""
  );
  const [endDate, setEndDate] = useState(
    phase?.endDate ? toInputDate(new Date(phase.endDate)) : ""
  );
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>(
    phase?.assignedUserIds ?? []
  );

  // Reset when phase changes
  useMemo(() => {
    setName(phase?.name ?? "");
    setColor(phase?.color ?? PHASE_COLORS[0]);
    setStartDate(phase?.startDate ? toInputDate(new Date(phase.startDate)) : "");
    setEndDate(phase?.endDate ? toInputDate(new Date(phase.endDate)) : "");
    setAssignedUserIds(phase?.assignedUserIds ?? []);
  }, [phase]);

  const toggleUser = (id: number) => {
    setAssignedUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      color,
      startDate: startDate || null,
      endDate: endDate || null,
      assignedUserIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{phase ? "Edit Phase" : "Add Phase"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{jobTitle}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="phaseName">Phase Name</Label>
            <Input
              id="phaseName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Surface Prep, Priming, Installation"
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PHASE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign Team Members</Label>
            <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No users found</p>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                      assignedUserIds.includes(u.id)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{u.role}</span>
                  </button>
                ))
              )}
            </div>
            {assignedUserIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {assignedUserIds.length} team member{assignedUserIds.length !== 1 ? "s" : ""} assigned
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          {phase && onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : phase ? "Update" : "Add Phase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job date dialog ─────────────────────────────────────────────
interface JobDateDialogProps {
  open: boolean;
  onClose: () => void;
  job: ScheduleJob | null;
  onSave: (startDate: string | null, endDate: string | null) => void;
  saving: boolean;
}

function JobDateDialog({ open, onClose, job, onSave, saving }: JobDateDialogProps) {
  const [startDate, setStartDate] = useState(
    job?.scheduledStart ? toInputDate(new Date(job.scheduledStart)) : ""
  );
  const [endDate, setEndDate] = useState(
    job?.scheduledEnd ? toInputDate(new Date(job.scheduledEnd)) : ""
  );

  useMemo(() => {
    setStartDate(job?.scheduledStart ? toInputDate(new Date(job.scheduledStart)) : "");
    setEndDate(job?.scheduledEnd ? toInputDate(new Date(job.scheduledEnd)) : "");
  }, [job]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Job Dates</DialogTitle>
          {job && <p className="text-sm text-muted-foreground">{job.title}</p>}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="jobStart">Start Date</Label>
            <Input id="jobStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="jobEnd">End Date</Label>
            <Input id="jobEnd" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(startDate || null, endDate || null)} disabled={saving}>
            {saving ? "Saving…" : "Save Dates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Schedule page ─────────────────────────────────────────
export default function Schedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timelineRef = useRef<HTMLDivElement>(null);

  const [phaseDialog, setPhaseDialog] = useState<{
    open: boolean;
    jobId: number;
    jobTitle: string;
    phase: JobPhase | null;
  }>({ open: false, jobId: 0, jobTitle: "", phase: null });

  const [dateDialog, setDateDialog] = useState<{
    open: boolean;
    job: ScheduleJob | null;
  }>({ open: false, job: null });

  const { data: scheduleData = [], isLoading } = useGetSchedule();
  const { data: allUsers = [] } = useListUsers();

  const createPhase = useCreatePhase();
  const updatePhase = useUpdatePhase();
  const deletePhase = useDeletePhase();
  const updateJob = useUpdateJob();

  // ── Date range ────────────────────────────────────────────────
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const today = startOfDay(new Date());
    let min = today;
    let max = addDays(today, 90);

    for (const job of scheduleData) {
      if (job.scheduledStart) {
        const d = startOfDay(new Date(job.scheduledStart));
        if (d < min) min = d;
      }
      if (job.scheduledEnd) {
        const d = startOfDay(new Date(job.scheduledEnd));
        if (d > max) max = d;
      }
      for (const phase of job.phases) {
        if (phase.startDate) {
          const d = startOfDay(new Date(phase.startDate));
          if (d < min) min = d;
        }
        if (phase.endDate) {
          const d = startOfDay(new Date(phase.endDate));
          if (d > max) max = d;
        }
      }
    }

    const paddedMin = addDays(min, -7);
    const paddedMax = addDays(max, 14);
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: daysBetween(paddedMin, paddedMax),
    };
  }, [scheduleData]);

  // ── Week ticks ─────────────────────────────────────────────
  const weeks = useMemo(() => {
    const result: Array<{ date: Date; left: number; label: string }> = [];
    // Start from Monday of minDate's week
    const start = new Date(minDate);
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
    let cur = start;
    while (cur < maxDate) {
      const left = daysBetween(minDate, cur) * DAY_PX;
      result.push({
        date: new Date(cur),
        left,
        label: cur.getDate() === 1 || result.length === 0
          ? fmtMonth(cur)
          : fmtShort(cur),
      });
      cur = addDays(cur, 7);
    }
    return result;
  }, [minDate, maxDate]);

  const todayLeft = daysBetween(minDate, startOfDay(new Date())) * DAY_PX;
  const totalWidth = totalDays * DAY_PX;

  // ── Phase bar positioning ──────────────────────────────────
  function phaseBar(phase: JobPhase) {
    if (!phase.startDate || !phase.endDate) return null;
    const start = startOfDay(new Date(phase.startDate));
    const end = startOfDay(new Date(phase.endDate));
    const left = daysBetween(minDate, start) * DAY_PX;
    const width = Math.max(daysBetween(start, end) * DAY_PX, 40);
    return { left, width };
  }

  function jobBar(job: ScheduleJob) {
    if (!job.scheduledStart || !job.scheduledEnd) return null;
    const start = startOfDay(new Date(job.scheduledStart));
    const end = startOfDay(new Date(job.scheduledEnd));
    const left = daysBetween(minDate, start) * DAY_PX;
    const width = Math.max(daysBetween(start, end) * DAY_PX, 20);
    return { left, width };
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey() });

  // ── Phase save/delete ──────────────────────────────────────
  const handlePhaseSave = (data: {
    name: string; color: string;
    startDate: string | null; endDate: string | null;
    assignedUserIds: number[];
  }) => {
    if (phaseDialog.phase) {
      updatePhase.mutate(
        { jobId: phaseDialog.jobId, phaseId: phaseDialog.phase.id, data },
        {
          onSuccess: () => { toast({ title: "Phase updated" }); invalidate(); setPhaseDialog((s) => ({ ...s, open: false })); },
          onError: () => toast({ title: "Failed to update phase", variant: "destructive" }),
        }
      );
    } else {
      createPhase.mutate(
        { jobId: phaseDialog.jobId, data },
        {
          onSuccess: () => { toast({ title: "Phase added" }); invalidate(); setPhaseDialog((s) => ({ ...s, open: false })); },
          onError: () => toast({ title: "Failed to add phase", variant: "destructive" }),
        }
      );
    }
  };

  const handlePhaseDelete = () => {
    if (!phaseDialog.phase) return;
    deletePhase.mutate(
      { jobId: phaseDialog.jobId, phaseId: phaseDialog.phase.id },
      {
        onSuccess: () => { toast({ title: "Phase deleted" }); invalidate(); setPhaseDialog((s) => ({ ...s, open: false })); },
        onError: () => toast({ title: "Failed to delete phase", variant: "destructive" }),
      }
    );
  };

  const handleJobDateSave = (startDate: string | null, endDate: string | null) => {
    if (!dateDialog.job) return;
    updateJob.mutate(
      {
        id: dateDialog.job.id,
        data: {
          scheduledStart: startDate ? new Date(startDate).toISOString() : null,
          scheduledEnd: endDate ? new Date(endDate).toISOString() : null,
        },
      },
      {
        onSuccess: () => { toast({ title: "Dates updated" }); invalidate(); setDateDialog({ open: false, job: null }); },
        onError: () => toast({ title: "Failed to update dates", variant: "destructive" }),
      }
    );
  };

  const isSaving =
    createPhase.isPending || updatePhase.isPending || deletePhase.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (scheduleData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CalendarDays className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-1">No jobs to schedule</h2>
        <p className="text-muted-foreground max-w-sm">
          Jobs in the <span className="font-medium">Approved</span>, <span className="font-medium">Scheduled</span>, or <span className="font-medium">InProgress</span> stages will appear here on the Gantt chart.
        </p>
      </div>
    );
  }

  const LEFT_COL = 240;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground">Gantt chart for approved and active jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => timelineRef.current?.scrollBy({ left: -200, behavior: "smooth" })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (timelineRef.current) timelineRef.current.scrollLeft = todayLeft - LEFT_COL / 2;
          }}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => timelineRef.current?.scrollBy({ left: 200, behavior: "smooth" })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
        {/* Header row */}
        <div className="flex border-b bg-muted/30">
          {/* Left sidebar header */}
          <div style={{ minWidth: LEFT_COL, width: LEFT_COL }} className="border-r p-3 flex items-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job</span>
          </div>
          {/* Timeline header */}
          <div className="flex-1 overflow-hidden">
            <div
              ref={timelineRef}
              className="overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <div style={{ width: totalWidth, height: 40, position: "relative" }}>
                {weeks.map((week, i) => (
                  <div
                    key={i}
                    className="absolute top-0 flex items-center border-l border-border/50"
                    style={{ left: week.left, height: "100%" }}
                  >
                    <span className="text-[11px] text-muted-foreground font-medium pl-1.5 whitespace-nowrap">
                      {week.label}
                    </span>
                  </div>
                ))}
                {/* Today marker header */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary/60"
                  style={{ left: todayLeft }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Job rows */}
        {scheduleData.map((job, jobIdx) => {
          const bar = jobBar(job);
          const userMap = new Map(allUsers.map((u) => [u.id, u]));

          return (
            <div
              key={job.id}
              className={`flex border-b last:border-b-0 ${jobIdx % 2 === 1 ? "bg-muted/10" : ""}`}
              style={{ minHeight: 72 }}
            >
              {/* Left sidebar */}
              <div
                style={{ minWidth: LEFT_COL, width: LEFT_COL }}
                className="border-r p-3 flex flex-col justify-center gap-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm leading-tight truncate">{job.title}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={`text-[10px] px-1.5 py-0 h-4 ${STAGE_COLOR[job.stage] ?? "bg-gray-100 text-gray-800"}`}>
                    {job.stage}
                  </Badge>
                  {job.clientName && (
                    <span className="text-[11px] text-muted-foreground truncate">{job.clientName}</span>
                  )}
                </div>
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => setDateDialog({ open: true, job })}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  >
                    <CalendarDays className="h-2.5 w-2.5" />
                    {bar ? "Edit dates" : "Set dates"}
                  </button>
                  <span className="text-muted-foreground/40 text-[10px]">·</span>
                  <button
                    onClick={() =>
                      setPhaseDialog({ open: true, jobId: job.id, jobTitle: job.title, phase: null })
                    }
                    className="text-[10px] text-primary/80 hover:text-primary flex items-center gap-0.5 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Add phase
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex-1 relative overflow-hidden">
                <div
                  className="overflow-x-auto h-full"
                  style={{ scrollbarWidth: "none" }}
                  onScroll={(e) => {
                    // Sync scroll across all rows via ref
                    if (timelineRef.current) {
                      timelineRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                    }
                  }}
                >
                  <div style={{ width: totalWidth, height: "100%", position: "relative", minHeight: 72 }}>
                    {/* Alternating week stripes */}
                    {weeks.map((week, i) => (
                      i % 2 === 1 ? (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-muted/20"
                          style={{ left: week.left, width: 7 * DAY_PX }}
                        />
                      ) : null
                    ))}

                    {/* Today indicator */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary/30"
                      style={{ left: todayLeft }}
                    />

                    {/* Job-level bar (background) */}
                    {bar && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded h-2 opacity-20 bg-foreground"
                        style={{ left: bar.left, width: bar.width }}
                      />
                    )}

                    {/* Phase bars */}
                    {job.phases.length === 0 && !bar && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60 italic ml-3"
                        style={{ left: 0 }}
                      >
                        No phases — click "Add phase" to start planning
                      </div>
                    )}

                    {job.phases.map((phase) => {
                      const pb = phaseBar(phase);
                      const assignees = (phase.assignedUserIds ?? [])
                        .map((uid) => userMap.get(uid))
                        .filter(Boolean);

                      if (!pb) {
                        // Phase without dates — show as a tag on the left
                        return (
                          <button
                            key={phase.id}
                            onClick={() =>
                              setPhaseDialog({
                                open: true,
                                jobId: job.id,
                                jobTitle: job.title,
                                phase,
                              })
                            }
                            className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-white opacity-80 hover:opacity-100 transition-opacity"
                            style={{ left: 8, backgroundColor: phase.color }}
                            title={`${phase.name} (no dates set)`}
                          >
                            {phase.name}
                            <Edit2 className="h-2.5 w-2.5" />
                          </button>
                        );
                      }

                      return (
                        <button
                          key={phase.id}
                          onClick={() =>
                            setPhaseDialog({
                              open: true,
                              jobId: job.id,
                              jobTitle: job.title,
                              phase,
                            })
                          }
                          className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 rounded-md text-white text-[11px] font-medium shadow-sm transition-all hover:brightness-110 hover:shadow-md active:scale-95 group"
                          style={{
                            left: pb.left,
                            width: pb.width,
                            height: 30,
                            backgroundColor: phase.color,
                            minWidth: 0,
                          }}
                          title={`${phase.name}${assignees.length ? ` · ${assignees.map((u) => u!.name).join(", ")}` : ""}`}
                        >
                          <span className="truncate">{phase.name}</span>
                          {assignees.length > 0 && (
                            <span className="ml-auto flex items-center gap-0.5 opacity-80 shrink-0">
                              <Users className="h-2.5 w-2.5" />
                              <span>{assignees.length}</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PhaseDialog
        open={phaseDialog.open}
        onClose={() => setPhaseDialog((s) => ({ ...s, open: false }))}
        jobId={phaseDialog.jobId}
        jobTitle={phaseDialog.jobTitle}
        phase={phaseDialog.phase}
        users={allUsers}
        onSave={handlePhaseSave}
        onDelete={phaseDialog.phase ? handlePhaseDelete : undefined}
        saving={isSaving}
      />

      <JobDateDialog
        open={dateDialog.open}
        onClose={() => setDateDialog({ open: false, job: null })}
        job={dateDialog.job}
        onSave={handleJobDateSave}
        saving={updateJob.isPending}
      />
    </div>
  );
}
