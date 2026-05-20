import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetJob, 
  useAdvanceJobStage, 
  useListEstimates, 
  useApproveEstimate,
  useListSwmsForms,
  useListInvoices,
  getGetJobQueryKey, 
  getListEstimatesQueryKey,
  getListSwmsFormsQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CheckCircle2, Clock, MapPin, AlignLeft, Calculator, Plus, Link as LinkIcon, Edit2, MessageSquareWarning, ShieldCheck, Shield, ShieldAlert, FileText, Receipt } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const stageOrder = ["Lead", "Quoting", "Approved", "Scheduled", "InProgress", "ComplianceReview", "Invoiced", "Closed"];

const INVOICE_ELIGIBLE_STAGES = ["Approved", "Scheduled", "InProgress", "ComplianceReview", "Invoiced"];
const INVOICE_STATUS_CLASS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Sent: "bg-blue-100 text-blue-700",
  PartiallyPaid: "bg-orange-100 text-orange-700",
  Paid: "bg-green-100 text-green-700",
  Overdue: "bg-red-100 text-red-700",
  Void: "bg-gray-100 text-gray-400",
};

export default function JobDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: job, isLoading: loadingJob } = useGetJob(id, { query: { enabled: !!id, queryKey: getGetJobQueryKey(id) } });
  const { data: estimates, isLoading: loadingEstimates } = useListEstimates(id, { query: { enabled: !!id, queryKey: getListEstimatesQueryKey(id) } });
  
  const advanceStage = useAdvanceJobStage();
  const approveEstimate = useApproveEstimate();

  const { data: swmsForms = [] } = useListSwmsForms(id, {
    query: { enabled: !!id, queryKey: getListSwmsFormsQueryKey(id) },
  });

  const { data: invoices = [] } = useListInvoices(id, {
    query: { enabled: !!id, queryKey: getListInvoicesQueryKey(id) },
  });

  if (loadingJob) return <Skeleton className="h-[600px] w-full" />;
  if (!job) return <div className="text-center p-12 text-lg text-muted-foreground">Job not found</div>;

  const currentStageIndex = stageOrder.indexOf(job.stage);
  const nextStage = currentStageIndex < stageOrder.length - 1 ? stageOrder[currentStageIndex + 1] : null;
  const jobEstimates = estimates ?? [];

  const activeInvoices = invoices.filter((i) => i.status !== "Void");
  const totalInvoiced = activeInvoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalReceived = activeInvoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  const totalOutstanding = activeInvoices.reduce((s, i) => s + Number(i.balanceDue), 0);

  const handleAdvanceStage = () => {
    advanceStage.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Job stage advanced" });
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      },
      onError: (err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({
          title: "Cannot advance stage",
          description: msg ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      },
    });
  };

  const handleApproveEstimate = (estimateId: number) => {
    approveEstimate.mutate({ jobId: id, id: estimateId }, {
      onSuccess: () => {
        toast({ title: "Estimate approved" });
        queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      },
      onError: () => {
        toast({ title: "Failed to approve estimate", variant: "destructive" });
      }
    });
  };

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/quote/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied!", description: "Customer quote link copied to clipboard." });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full pb-12">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 bg-card p-6 rounded-xl border shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
            <Badge variant="outline" className="text-base bg-background px-3 py-1 font-semibold">{job.stage}</Badge>
          </div>
          {job.clientName && (
            <p className="text-lg text-muted-foreground flex items-center gap-2">
              Client: <Link href={`/clients/${job.clientId}`} className="text-primary hover:underline">{job.clientName}</Link>
            </p>
          )}
        </div>
        
        {nextStage && (
          <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-lg border">
            <div className="text-sm">
              <span className="text-muted-foreground block text-xs uppercase tracking-wider">NEXT STAGE</span>
              <span className="font-semibold">{nextStage}</span>
            </div>
            <Button onClick={handleAdvanceStage} disabled={advanceStage.isPending} className="shadow hover-elevate">
              Advance <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="flex items-center gap-2"><AlignLeft className="h-5 w-5" /> Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="whitespace-pre-wrap leading-relaxed">{job.description || <span className="text-muted-foreground italic">No description provided.</span>}</p>
              
              {job.siteAddress && (
                <div className="mt-6 p-4 bg-muted/30 rounded-lg flex items-start gap-3 border">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm mb-1 uppercase tracking-wider text-muted-foreground">Site Address</h4>
                    <p className="font-medium">{job.siteAddress}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/20 flex flex-row items-center justify-between pb-4">
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Estimates</CardTitle>
              <Button size="sm" variant="outline" className="shadow-sm" asChild>
                <Link href={`/jobs/${job.id}/estimates/new`}>
                  <Plus className="h-4 w-4 mr-1" /> New Estimate
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-6 p-0">
              {loadingEstimates ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : jobEstimates.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground border-b border-dashed">
                  <Calculator className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  No estimates have been created for this job yet.
                </div>
              ) : (
                <div className="divide-y">
                  {jobEstimates.map(estimate => (
                    <div key={estimate.id} className="p-6 bg-card">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xl font-bold">{estimate.title || `Estimate #${estimate.id}`}</h3>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={estimate.status === 'Approved' ? 'default' : 'secondary'} className={estimate.status === 'Approved' ? 'bg-green-600 hover:bg-green-700' : ''}>
                              {estimate.status}
                            </Badge>
                            {estimate.customerStatus && (
                              <Badge variant="outline" className={
                                estimate.customerStatus === 'Approved' ? 'text-green-600 border-green-200' : 
                                estimate.customerStatus === 'ChangesRequested' ? 'text-yellow-600 border-yellow-200' : ''
                              }>
                                Customer: {estimate.customerStatus}
                              </Badge>
                            )}
                            <span className="text-sm font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                              Margin: {estimate.margin?.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="text-3xl font-black tracking-tight text-primary">${estimate.customerTotal?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wider mb-3">Total Value</div>
                        </div>
                      </div>

                      {estimate.customerStatus === 'ChangesRequested' && estimate.customerNote && (
                        <div className="mb-6 p-4 bg-yellow-50/50 border border-yellow-200 rounded-lg flex items-start gap-3">
                          <MessageSquareWarning className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="font-semibold text-sm text-yellow-800 mb-1">Customer requested changes:</h4>
                            <p className="text-sm text-yellow-900 whitespace-pre-wrap">{estimate.customerNote}</p>
                          </div>
                        </div>
                      )}

                      {estimate.lineItems && estimate.lineItems.length > 0 && (
                        <div className="rounded-md border overflow-hidden mb-6">
                          <Table>
                            <TableHeader className="bg-muted/50">
                              <TableRow>
                                <TableHead className="font-semibold">Item</TableHead>
                                <TableHead className="text-right font-semibold">Qty</TableHead>
                                <TableHead className="text-right font-semibold">Price</TableHead>
                                <TableHead className="text-right font-semibold">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {estimate.lineItems.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium">{item.displayName || item.description}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{item.quantity} {item.unit}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">${item.unitPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                  <TableCell className="text-right font-medium">${((item.quantity||0) * (item.unitPrice||0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <Button variant="outline" asChild>
                          <Link href={`/jobs/${job.id}/estimates/${estimate.id}`}>
                            <Edit2 className="h-4 w-4 mr-2" /> Edit Estimate
                          </Link>
                        </Button>
                        
                        {estimate.shareToken && (
                          <Button variant="outline" onClick={() => copyShareLink(estimate.shareToken!)}>
                            <LinkIcon className="h-4 w-4 mr-2" /> Share Link
                          </Button>
                        )}
                        
                        {estimate.status === 'Sent' && (
                          <Button 
                            onClick={() => handleApproveEstimate(estimate.id)}
                            disabled={approveEstimate.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve Internally
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoicing */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-primary" />
                Invoicing
              </CardTitle>
              {INVOICE_ELIGIBLE_STAGES.includes(job.stage) && (
                <Link href={`/jobs/${job.id}/invoices/new`}>
                  <Button size="sm" variant="outline" className="h-8">
                    <FileText className="h-3 w-3 mr-1" />
                    Generate Invoice
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              {activeInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices created yet.</p>
              ) : (
                <div className="space-y-3">
                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-2 text-center p-3 bg-muted/40 rounded-lg">
                    <div>
                      <div className="text-xs text-muted-foreground">Total Invoiced</div>
                      <div className="font-semibold text-sm">${totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Received</div>
                      <div className="font-semibold text-sm text-green-600">${totalReceived.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Outstanding</div>
                      <div className={cn("font-semibold text-sm", totalOutstanding > 0 ? "text-orange-600" : "text-muted-foreground")}>
                        ${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  {/* Invoice list */}
                  {invoices.map((inv) => (
                    <Link key={inv.id} href={`/jobs/${job.id}/invoices/${inv.id}`}>
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                        <div>
                          <div className="font-mono text-sm font-semibold">{inv.invoiceNumber}</div>
                          <div className="text-xs text-muted-foreground">{inv.percentage}% of job</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-sm">${Number(inv.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                          <Badge className={cn("text-xs mt-0.5", INVOICE_STATUS_CLASS[inv.status] ?? "bg-muted text-muted-foreground")}>
                            {inv.status === "PartiallyPaid" ? "Part Paid" : inv.status}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Safety & Compliance */}
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Safety &amp; Compliance
              </CardTitle>
              <Button size="sm" variant="outline" className="shadow-sm" asChild>
                <Link href={`/jobs/${job.id}/swms/new`}>
                  <Plus className="h-4 w-4 mr-1" /> New SWMS
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {/* Overall safety badge */}
              <div className="flex items-center gap-2">
                {job.swmsStatus === "Compliant" ? (
                  <Badge className="bg-green-600 hover:bg-green-700 gap-1.5 text-sm px-3 py-1">
                    <ShieldCheck className="h-4 w-4" /> Compliant
                  </Badge>
                ) : job.swmsStatus === "PendingSignatures" ? (
                  <Badge className="bg-orange-500 hover:bg-orange-600 gap-1.5 text-sm px-3 py-1">
                    <Shield className="h-4 w-4" /> Pending Signatures
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1.5 text-sm px-3 py-1">
                    <ShieldAlert className="h-4 w-4" /> No SWMS Created
                  </Badge>
                )}
              </div>

              {nextStage === "InProgress" && job.swmsStatus !== "Compliant" && (
                <div className="flex items-start gap-2 text-sm p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <ShieldAlert className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                  <span className="text-orange-900">
                    {job.swmsStatus === "NoSwms"
                      ? "A safety form must be created and signed before advancing to InProgress."
                      : "The safety form must be signed before advancing to InProgress."}
                  </span>
                </div>
              )}

              {swmsForms.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No safety forms created yet.</p>
              ) : (
                <div className="space-y-2">
                  {swmsForms.map((f) => (
                    <Link href={`/jobs/${job.id}/swms/${f.id}`} key={f.id}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div>
                          <p className="font-medium text-sm">{f.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {f.templateType} · {f.signatureCount} signature{f.signatureCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {f.status === "Compliant" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        ) : (
                          <Shield className="h-5 w-5 text-orange-500 shrink-0" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div className="flex gap-4 items-start">
                <div className="bg-muted p-2 rounded-md">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1">Start Date</div>
                  <div className="font-medium text-lg">{job.scheduledStart ? new Date(job.scheduledStart).toLocaleDateString() : 'Unscheduled'}</div>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-muted p-2 rounded-md">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-1">End Date</div>
                  <div className="font-medium text-lg">{job.scheduledEnd ? new Date(job.scheduledEnd).toLocaleDateString() : 'Unscheduled'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {job.notes && (
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle>Internal Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground bg-yellow-500/10 p-4 rounded-md border border-yellow-500/20">{job.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
