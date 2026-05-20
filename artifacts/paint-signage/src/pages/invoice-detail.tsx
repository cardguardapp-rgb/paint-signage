import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJob,
  useListEstimates,
  useGetInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useRecordInvoicePayment,
  getGetJobQueryKey,
  getListEstimatesQueryKey,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  ArrowLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  Send,
  Receipt,
  AlertCircle,
  Percent,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PERCENTAGE_PRESETS = [
  { label: "30% Deposit", value: 30 },
  { label: "50% Progress", value: 50 },
  { label: "70% Progress", value: 70 },
  { label: "100% Final", value: 100 },
];

const INVOICE_STATUS_STYLE: Record<string, { className: string; label: string }> = {
  Draft: { className: "bg-gray-100 text-gray-600 border-gray-200", label: "Draft" },
  Sent: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "Sent" },
  PartiallyPaid: { className: "bg-orange-100 text-orange-700 border-orange-200", label: "Partially Paid" },
  Paid: { className: "bg-green-100 text-green-700 border-green-200", label: "Paid" },
  Overdue: { className: "bg-red-100 text-red-700 border-red-200", label: "Overdue" },
  Void: { className: "bg-gray-100 text-gray-400 border-gray-200", label: "Void" },
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoiceDetail() {
  const params = useParams<{ id: string; invoiceId?: string }>();
  const jobId = Number(params.id);
  const invoiceId = params.invoiceId ? Number(params.invoiceId) : undefined;
  const isCreateMode = !invoiceId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Create form state ──────────────────────────────────────────────────────
  const [percentage, setPercentage] = useState(100);
  const [customPct, setCustomPct] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");

  // ── Payment form state ─────────────────────────────────────────────────────
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // ── Hooks (all called unconditionally) ─────────────────────────────────────
  const { data: job } = useGetJob(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId) },
  });
  const { data: estimates = [] } = useListEstimates(jobId, {
    query: { enabled: !!jobId, queryKey: getListEstimatesQueryKey(jobId) },
  });
  const { data: invoice, isLoading: loadingInvoice } = useGetInvoice(
    jobId,
    invoiceId ?? 0,
    { query: { enabled: !!invoiceId, queryKey: getGetInvoiceQueryKey(jobId, invoiceId ?? 0) } }
  );

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const recordPayment = useRecordInvoicePayment();

  // ── Derived data ───────────────────────────────────────────────────────────
  const approvedEstimate = useMemo(
    () => estimates.find((e) => e.status === "Approved" || e.customerStatus === "Approved"),
    [estimates]
  );

  const effectivePct = useCustom ? Number(customPct) || 0 : percentage;
  const estimateBase = approvedEstimate
    ? Number(approvedEstimate.customerTotal)
    : Number(job?.estimatedValue ?? 0);
  const previewSubtotal = Math.round(estimateBase * (effectivePct / 100) * 100) / 100;
  const previewTax = Math.round(previewSubtotal * (taxRate / 100) * 100) / 100;
  const previewTotal = previewSubtotal + previewTax;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCreate = () => {
    const pct = useCustom ? Number(customPct) : percentage;
    if (!pct || pct < 1 || pct > 100) {
      toast({ title: "Invalid percentage", description: "Enter a value between 1 and 100", variant: "destructive" });
      return;
    }
    createInvoice.mutate(
      { jobId, data: { percentage: pct, taxRate, dueDate, notes: notes || undefined } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(jobId) });
          toast({ title: `Invoice ${created.invoiceNumber} created` });
          navigate(`/jobs/${jobId}/invoices/${created.id}`);
        },
        onError: () =>
          toast({ title: "Failed to create invoice", variant: "destructive" }),
      }
    );
  };

  const handleMarkSent = () => {
    if (!invoice) return;
    updateInvoice.mutate(
      { jobId, invoiceId: invoice.id, data: { status: "Sent" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(jobId, invoice.id) });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(jobId) });
          toast({ title: "Invoice marked as Sent" });
        },
      }
    );
  };

  const handleVoid = () => {
    if (!invoice) return;
    updateInvoice.mutate(
      { jobId, invoiceId: invoice.id, data: { status: "Void" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(jobId, invoice.id) });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(jobId) });
          toast({ title: "Invoice voided" });
        },
      }
    );
  };

  const handleRecordPayment = () => {
    if (!invoice || !payAmount) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Enter a valid payment amount", variant: "destructive" });
      return;
    }
    recordPayment.mutate(
      {
        jobId,
        invoiceId: invoice.id,
        data: {
          amount,
          paymentMethod: payMethod,
          reference: payReference || undefined,
          notes: payNotes || undefined,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(jobId, invoice.id) });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey(jobId) });
          setShowPaymentForm(false);
          setPayAmount("");
          setPayReference("");
          setPayNotes("");
          toast({
            title: updated.status === "Paid" ? "Invoice marked as Paid" : "Payment recorded",
          });
        },
        onError: () =>
          toast({ title: "Failed to record payment", variant: "destructive" }),
      }
    );
  };

  // ── Render: Create mode ────────────────────────────────────────────────────
  if (isCreateMode) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {job?.title ?? "Back to Job"}
          </Button>
        </div>

        <Card>
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generate Invoice
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              For: <span className="font-medium text-foreground">{job?.title ?? "—"}</span>
            </p>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Percentage selector */}
            <div>
              <label className="text-sm font-semibold mb-3 block">Invoice Amount</label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {PERCENTAGE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setPercentage(preset.value); setUseCustom(false); }}
                    className={cn(
                      "border rounded-lg p-3 text-center transition-all text-sm",
                      !useCustom && percentage === preset.value
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border hover:border-primary/40 text-muted-foreground"
                    )}
                  >
                    <div className="font-bold text-base">{preset.value}%</div>
                    <div className="text-xs mt-0.5">{preset.label.replace(`${preset.value}% `, "")}</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="customPct"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="customPct" className="text-sm text-muted-foreground">Custom percentage:</label>
                <div className="relative flex-1 max-w-[140px]">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={customPct}
                    onChange={(e) => { setCustomPct(e.target.value); setUseCustom(true); }}
                    placeholder="e.g. 75"
                    className="w-full border rounded px-3 py-1.5 text-sm pr-8"
                  />
                  <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>

              {/* Live preview */}
              {estimateBase > 0 && (
                <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">
                    {approvedEstimate ? "Based on approved quote" : "Based on job estimated value"}
                  </div>
                  <div className="text-2xl font-bold text-primary">${fmt(previewTotal)}</div>
                  <div className="text-xs text-muted-foreground">
                    {effectivePct}% of ${fmt(estimateBase)}
                    {taxRate > 0 && ` + ${taxRate}% tax`}
                  </div>
                </div>
              )}
              {estimateBase === 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    No approved quote found. The invoice will be created with no line items. You can add line items manually later.
                  </p>
                </div>
              )}
            </div>

            {/* Tax & Terms */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold block mb-1.5">Tax Rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full border rounded px-3 py-2 text-sm pr-8"
                  />
                  <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-semibold block mb-1.5">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, bank details, or other notes..."
                rows={3}
                className="w-full border rounded px-3 py-2 text-sm resize-none"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={createInvoice.isPending}
            >
              <FileText className="h-4 w-4 mr-2" />
              {createInvoice.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: Loading ────────────────────────────────────────────────────────
  if (loadingInvoice) return <Skeleton className="h-[600px] w-full" />;
  if (!invoice) return <div className="text-center p-12 text-muted-foreground">Invoice not found</div>;

  const statusStyle = INVOICE_STATUS_STYLE[invoice.status] ?? INVOICE_STATUS_STYLE["Draft"];
  const canPay = !["Paid", "Void"].includes(invoice.status);
  const canSend = invoice.status === "Draft";
  const canVoid = !["Paid", "Void"].includes(invoice.status);

  // ── Render: View mode ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {job?.title ?? "Back to Job"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice header card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
                    <Badge className={cn("text-sm border", statusStyle.className)}>
                      {statusStyle.label}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {job?.title ?? `Job #${invoice.jobId}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {invoice.percentage}% of approved quote
                  </p>
                </div>
                <div className="text-right text-sm space-y-1">
                  <div className="text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 inline mr-1" />
                    Created {fmtDate(invoice.createdAt)}
                  </div>
                  {invoice.dueDate && (
                    <div className={cn(
                      invoice.status !== "Paid" && new Date(invoice.dueDate) < new Date()
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    )}>
                      Due {fmtDate(invoice.dueDate)}
                    </div>
                  )}
                  {invoice.sentAt && (
                    <div className="text-muted-foreground">
                      Sent {fmtDate(invoice.sentAt)}
                    </div>
                  )}
                  {invoice.paidAt && (
                    <div className="text-green-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
                      Paid {fmtDate(invoice.paidAt)}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t">
                {canSend && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMarkSent}
                    disabled={updateInvoice.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Mark as Sent
                  </Button>
                )}
                {canPay && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setShowPaymentForm(true)}
                  >
                    <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                    Record Payment
                  </Button>
                )}
                {canVoid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 ml-auto"
                    onClick={handleVoid}
                    disabled={updateInvoice.isPending}
                  >
                    Void Invoice
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line Items</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {invoice.lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No line items on this invoice.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-20">Qty</TableHead>
                      <TableHead className="text-right w-28">Unit Price</TableHead>
                      <TableHead className="text-right w-28">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.lineItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {item.displayName ?? item.description}
                          {item.unit && (
                            <span className="text-xs text-muted-foreground ml-1">/ {item.unit}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.quantity}</TableCell>
                        <TableCell className="text-right">${fmt(item.unitPrice)}</TableCell>
                        <TableCell className="text-right font-medium">${fmt(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Payment history */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {invoice.payments.map((pmt) => (
                    <div
                      key={pmt.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm text-green-700">
                          +${fmt(pmt.amount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pmt.paymentMethod} · {fmtDate(pmt.paidAt)}
                          {pmt.reference && ` · Ref: ${pmt.reference}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Record payment form */}
              {showPaymentForm && (
                <div className="mt-4 p-4 border rounded-lg space-y-3 bg-muted/20">
                  <h4 className="font-semibold text-sm">Record Payment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={`Max: $${fmt(invoice.balanceDue)}`}
                        className="w-full border rounded px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Method</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                      >
                        <option>Bank Transfer</option>
                        <option>Cash</option>
                        <option>Credit Card</option>
                        <option>Cheque</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Reference (optional)</label>
                    <input
                      type="text"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="Transaction ID, cheque #, etc."
                      className="w-full border rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleRecordPayment}
                      disabled={recordPayment.isPending || !payAmount}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      {recordPayment.isPending ? "Saving…" : "Save Payment"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowPaymentForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {invoice.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar — totals */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-base">Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${fmt(invoice.subtotal)}</span>
              </div>
              {invoice.taxRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
                  <span>${fmt(invoice.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total</span>
                <span>${fmt(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Amount Paid</span>
                <span>− ${fmt(invoice.amountPaid)}</span>
              </div>
              <div
                className={cn(
                  "flex justify-between font-bold text-lg border-t pt-2",
                  invoice.balanceDue > 0 ? "text-orange-600" : "text-green-600"
                )}
              >
                <span>Balance Due</span>
                <span>${fmt(invoice.balanceDue)}</span>
              </div>
            </CardContent>
          </Card>

          {invoice.balanceDue > 0 && !showPaymentForm && canPay && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowPaymentForm(true)}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
