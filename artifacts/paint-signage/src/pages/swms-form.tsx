import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJob,
  useGetSwmsForm,
  useCreateSwmsForm,
  useUpdateSwmsForm,
  useSignSwmsForm,
  getGetSwmsFormQueryKey,
  getListSwmsFormsQueryKey,
  getGetJobQueryKey,
} from "@workspace/api-client-react";
import type { SwmsFormDetail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  CheckCircle2,
  ChevronLeft,
  PenLine,
  Save,
  AlertTriangle,
  User,
} from "lucide-react";
import { Link } from "wouter";

// ─── Status helpers ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "Compliant") {
    return (
      <Badge className="bg-green-600 hover:bg-green-700 gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Compliant
      </Badge>
    );
  }
  if (status === "PendingSignatures") {
    return (
      <Badge className="bg-orange-500 hover:bg-orange-600 gap-1.5">
        <Shield className="h-3.5 w-3.5" /> Pending Signatures
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <ShieldAlert className="h-3.5 w-3.5" /> Draft
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, string> = {
    High: "bg-red-100 text-red-700 border-red-200",
    Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Low: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg[severity] ?? "bg-muted"}`}>
      {severity}
    </span>
  );
}

// ─── Create new SWMS ──────────────────────────────────────────────
function CreateSwmsView({ jobId }: { jobId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [templateType, setTemplateType] = useState<"SWMS" | "JSA">("SWMS");
  const [title, setTitle] = useState("");

  const { data: job } = useGetJob(jobId);
  const createForm = useCreateSwmsForm();

  const handleCreate = () => {
    const finalTitle = title.trim() || `${templateType} — ${job?.title ?? "Job"}`;
    createForm.mutate(
      { jobId, data: { templateType, title: finalTitle } },
      {
        onSuccess: (form) => {
          queryClient.invalidateQueries({ queryKey: getListSwmsFormsQueryKey(jobId) });
          queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
          navigate(`/jobs/${jobId}/swms/${form.id}`);
        },
        onError: () => toast({ title: "Failed to create form", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pt-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/jobs/${jobId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Job
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> New Safety Form
          </CardTitle>
          {job && <p className="text-sm text-muted-foreground">For: {job.title}</p>}
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label>Form Type</Label>
            <div className="flex gap-3">
              {(["SWMS", "JSA"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTemplateType(t)}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                    templateType === t
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="font-semibold text-sm">{t}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t === "SWMS"
                      ? "Safe Work Method Statement"
                      : "Job Safety Analysis"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formTitle">Title (optional)</Label>
            <Input
              id="formTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${templateType} — Exterior Signage Install`}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-generate from job title.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-semibold mb-1">10 pre-loaded hazards</p>
            <p className="text-blue-800 text-xs">
              The form includes hazards tailored for painting and signage work. You
              can check/uncheck and customise control measures before signing off.
            </p>
          </div>

          <Button onClick={handleCreate} disabled={createForm.isPending} className="w-full">
            {createForm.isPending ? "Creating…" : `Create ${templateType} Form`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Edit / view existing SWMS ────────────────────────────────────
function SwmsFormEditor({ jobId, swmsId }: { jobId: number; swmsId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: job } = useGetJob(jobId);
  const { data: form, isLoading } = useGetSwmsForm(jobId, swmsId);

  const [hazards, setHazards] = useState(form?.hazards ?? []);
  const [dirty, setDirty] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [activeTab, setActiveTab] = useState("hazards");

  // Sync hazards when form loads
  useMemo(() => {
    if (form?.hazards) {
      setHazards(form.hazards);
      setDirty(false);
    }
  }, [form]);

  const updateForm = useUpdateSwmsForm();
  const signForm = useSignSwmsForm();

  const updateHazard = (
    idx: number,
    field: "isSelected" | "controlMeasure",
    value: boolean | string
  ) => {
    setHazards((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    updateForm.mutate(
      { jobId, swmsId, data: { hazards } },
      {
        onSuccess: () => {
          toast({ title: "Hazards saved" });
          setDirty(false);
          queryClient.invalidateQueries({ queryKey: getGetSwmsFormQueryKey(jobId, swmsId) });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  const handleSign = () => {
    if (!signerName.trim()) return;
    signForm.mutate(
      { jobId, swmsId, data: { signerName: signerName.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Signed successfully", description: "The SWMS is now compliant." });
          setSignerName("");
          queryClient.invalidateQueries({ queryKey: getGetSwmsFormQueryKey(jobId, swmsId) });
          queryClient.invalidateQueries({ queryKey: getListSwmsFormsQueryKey(jobId) });
          queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
        },
        onError: () => toast({ title: "Failed to sign", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <Skeleton className="h-[600px] w-full" />;
  if (!form) return <div className="text-center p-12 text-muted-foreground">Form not found</div>;

  const selectedCount = hazards.filter((h) => h.isSelected).length;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/jobs/${jobId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {job?.title ?? `Job #${jobId}`}
          </Link>
        </Button>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{form.title}</h1>
              <Badge variant="outline">{form.templateType}</Badge>
            </div>
            {job && (
              <p className="text-sm text-muted-foreground">
                Job:{" "}
                <Link href={`/jobs/${jobId}`} className="text-primary hover:underline">
                  {job.title}
                </Link>
              </p>
            )}
          </div>
          <StatusBadge status={form.status} />
        </div>

        <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
          <span>{selectedCount} / {hazards.length} hazards identified</span>
          <span>{form.signatures.length} signature{form.signatures.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Compliance notice */}
      {form.status !== "Compliant" && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900">
            <p className="font-semibold">Signature required before InProgress</p>
            <p className="text-orange-800 mt-0.5">
              At least one team member must read and sign this form before the job can advance to InProgress.
            </p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="hazards" className="gap-2">
            <ShieldAlert className="h-4 w-4" /> Hazards &amp; Controls
          </TabsTrigger>
          <TabsTrigger value="signoff" className="gap-2">
            <PenLine className="h-4 w-4" /> Sign Off
            {form.signatures.length > 0 && (
              <Badge className="bg-green-600 text-white text-[10px] h-4 px-1.5 ml-1">
                {form.signatures.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Hazards tab ──────────────────────────────────────── */}
        <TabsContent value="hazards" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Check all hazards present on this job. Edit control measures as needed.
            </p>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateForm.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {updateForm.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>

          <Card>
            <div className="divide-y">
              {hazards.map((hazard, idx) => (
                <div
                  key={hazard.key}
                  className={`p-4 transition-colors ${hazard.isSelected ? "bg-orange-50/40" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <Checkbox
                      id={`hazard-${hazard.key}`}
                      checked={hazard.isSelected}
                      onCheckedChange={(checked) =>
                        updateHazard(idx, "isSelected", !!checked)
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label
                          htmlFor={`hazard-${hazard.key}`}
                          className={`font-medium text-sm cursor-pointer ${hazard.isSelected ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {hazard.label}
                        </label>
                        <SeverityBadge severity={hazard.severity} />
                      </div>
                      {hazard.isSelected && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                            Control Measures
                          </Label>
                          <Textarea
                            value={hazard.controlMeasure}
                            onChange={(e) =>
                              updateHazard(idx, "controlMeasure", e.target.value)
                            }
                            rows={2}
                            className="text-sm resize-none"
                            placeholder="Describe how this hazard will be controlled…"
                          />
                        </div>
                      )}
                      {!hazard.isSelected && (
                        <p className="text-xs text-muted-foreground/70 italic line-clamp-1">
                          {hazard.controlMeasure}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!dirty || updateForm.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {updateForm.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* ── Sign Off tab ─────────────────────────────────────── */}
        <TabsContent value="signoff" className="mt-4 space-y-4">
          {form.signatures.length > 0 && (
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="text-base">Signatures Received</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                {form.signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{sig.signerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(sig.signedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine className="h-4 w-4" /> Sign This {form.templateType}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="bg-muted/40 rounded-lg p-4 text-sm space-y-2 border">
                <p className="font-semibold">Declaration</p>
                <p className="text-muted-foreground leading-relaxed">
                  By signing below, I confirm that I have read and understood this{" "}
                  {form.templateType}, I am aware of the hazards and risks associated with
                  this work, and I agree to follow all control measures described above.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signerName" className="flex items-center gap-2">
                    <User className="h-4 w-4" /> Full Name (typed signature)
                  </Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Type your full legal name…"
                    className="text-lg font-medium"
                    onKeyDown={(e) => e.key === "Enter" && handleSign()}
                  />
                </div>

                <Button
                  onClick={handleSign}
                  disabled={!signerName.trim() || signForm.isPending}
                  className="w-full bg-green-600 hover:bg-green-700 gap-2"
                  size="lg"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {signForm.isPending ? "Signing…" : "Sign & Confirm"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Router component ─────────────────────────────────────────────
export default function SwmsFormPage() {
  const params = useParams<{ id: string; swmsId?: string }>();
  const jobId = Number(params.id);
  const swmsId = params.swmsId ? Number(params.swmsId) : null;

  if (!swmsId) {
    return <CreateSwmsView jobId={jobId} />;
  }
  return <SwmsFormEditor jobId={jobId} swmsId={swmsId} />;
}
