import { useGetFinancialSummary, useGetAgedReceivables } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  TrendingUp,
  DollarSign,
  ReceiptText,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function MetricBar({
  label,
  value,
  max,
  colorClass,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">${fmt(value)}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5">
        <div className={cn("h-2.5 rounded-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const AGE_STYLES: Record<string, string> = {
  Current: "bg-green-100 text-green-700",
  "1-30 days": "bg-yellow-100 text-yellow-700",
  "31-60 days": "bg-orange-100 text-orange-700",
  "61-90 days": "bg-red-100 text-red-700",
  "90+ days": "bg-red-200 text-red-800",
};

export default function Financials() {
  const { data: summary, isLoading: loadingSummary } = useGetFinancialSummary();
  const { data: receivables = [], isLoading: loadingReceivables } = useGetAgedReceivables();

  if (loadingSummary) return <Skeleton className="h-[600px] w-full" />;

  const p = summary?.pipeline;
  const inv = summary?.invoicing;
  const prof = summary?.profitability;

  const kpiCards = [
    {
      title: "Total Pipeline Value",
      value: p ? `$${fmt(p.totalPipelineValue)}` : "—",
      sub: p ? `$${fmt(p.quotePipelineValue)} quoting + $${fmt(p.activePipelineValue)} active` : "",
      icon: TrendingUp,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Total Invoiced",
      value: inv ? `$${fmt(inv.totalInvoiced)}` : "—",
      sub: inv ? `${inv.invoiceCount} invoice${inv.invoiceCount !== 1 ? "s" : ""}` : "",
      icon: ReceiptText,
      iconColor: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Total Received",
      value: inv ? `$${fmt(inv.totalReceived)}` : "—",
      sub: inv && inv.totalInvoiced > 0 ? `${Math.round((inv.totalReceived / inv.totalInvoiced) * 100)}% collected` : "",
      icon: CheckCircle2,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Outstanding Balance",
      value: inv ? `$${fmt(inv.totalOutstanding)}` : "—",
      sub: receivables.length > 0 ? `${receivables.length} unpaid invoice${receivables.length !== 1 ? "s" : ""}` : "All paid",
      icon: AlertCircle,
      iconColor: inv && inv.totalOutstanding > 0 ? "text-red-600" : "text-muted-foreground",
      bgColor: inv && inv.totalOutstanding > 0 ? "bg-red-50" : "bg-muted",
    },
  ];

  const profMax = prof
    ? Math.max(prof.totalEstimatedRevenue, prof.totalInvoiced, prof.totalInternalBudget, 1)
    : 1;

  // Bucket receivables by age
  const buckets = ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"];
  const bucketTotals: Record<string, number> = {};
  for (const b of buckets) bucketTotals[b] = 0;
  for (const r of receivables) bucketTotals[r.ageBucket] = (bucketTotals[r.ageBucket] ?? 0) + r.balanceDue;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Financial Overview</h1>
          <p className="text-muted-foreground text-sm">Pipeline analytics, profitability, and receivables</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold">{card.value}</p>
                  {card.sub && (
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  )}
                </div>
                <div className={cn("p-2 rounded-lg", card.bgColor)}>
                  <card.icon className={cn("h-5 w-5", card.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline breakdown */}
        <Card>
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Pipeline Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {p && (
              <>
                <MetricBar
                  label="Active Jobs (Approved → Review)"
                  value={p.activePipelineValue}
                  max={p.totalPipelineValue || 1}
                  colorClass="bg-primary"
                />
                <MetricBar
                  label="Quote Pipeline (Lead + Quoting)"
                  value={p.quotePipelineValue}
                  max={p.totalPipelineValue || 1}
                  colorClass="bg-blue-400"
                />
                <div className="border-t pt-3 flex justify-between text-sm font-semibold">
                  <span>Total Pipeline</span>
                  <span>${fmt(p.totalPipelineValue)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Profitability analysis */}
        <Card>
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Profitability Analysis
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Based on approved estimates vs actual invoicing</p>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {prof && (
              <>
                <MetricBar
                  label="Quoted Revenue (Customer Total)"
                  value={prof.totalEstimatedRevenue}
                  max={profMax}
                  colorClass="bg-blue-500"
                />
                <MetricBar
                  label="Internal Budget (Cost)"
                  value={prof.totalInternalBudget}
                  max={profMax}
                  colorClass="bg-red-400"
                />
                <MetricBar
                  label="Actual Invoiced"
                  value={prof.totalInvoiced}
                  max={profMax}
                  colorClass="bg-green-500"
                />
                <div className="border-t pt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">Expected Margin</div>
                    <div className={cn(
                      "font-bold text-lg",
                      prof.expectedMargin >= 25 ? "text-green-600" :
                      prof.expectedMargin >= 15 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {prof.expectedMargin.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Gross Profit: ${fmt(prof.expectedGrossProfit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">Actual Margin</div>
                    <div className={cn(
                      "font-bold text-lg",
                      prof.actualMargin >= 25 ? "text-green-600" :
                      prof.actualMargin >= 15 ? "text-yellow-600" :
                      prof.totalInvoiced === 0 ? "text-muted-foreground" : "text-red-600"
                    )}>
                      {prof.totalInvoiced > 0 ? `${prof.actualMargin.toFixed(1)}%` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {prof.totalInvoiced > 0 ? `Gross Profit: $${fmt(prof.actualGrossProfit)}` : "No invoices yet"}
                    </div>
                  </div>
                </div>
                {prof.totalInvoiced > 0 && prof.expectedMargin !== 0 && (
                  <div className={cn(
                    "text-xs px-3 py-2 rounded-lg",
                    prof.actualMargin >= prof.expectedMargin
                      ? "bg-green-50 text-green-700"
                      : "bg-orange-50 text-orange-700"
                  )}>
                    Margin variance: {prof.actualMargin >= prof.expectedMargin ? "+" : ""}
                    {(prof.actualMargin - prof.expectedMargin).toFixed(1)}% vs quoted
                  </div>
                )}
              </>
            )}
            {!prof && (
              <p className="text-sm text-muted-foreground text-center py-4">No approved estimates yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aged receivables */}
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Aged Receivables
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Outstanding invoices categorised by age</p>
        </CardHeader>
        <CardContent className="pt-5">
          {/* Bucket summary */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {buckets.map((bucket) => (
              <div key={bucket} className="text-center">
                <Badge className={cn("text-xs mb-1 w-full justify-center", AGE_STYLES[bucket] ?? "bg-muted text-muted-foreground")}>
                  {bucket}
                </Badge>
                <div className="font-semibold text-sm">
                  {bucketTotals[bucket] > 0 ? `$${fmt(bucketTotals[bucket])}` : "—"}
                </div>
              </div>
            ))}
          </div>

          {loadingReceivables ? (
            <Skeleton className="h-32 w-full" />
          ) : receivables.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No outstanding receivables — all invoices are current!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="pb-2 font-medium">Invoice</th>
                    <th className="pb-2 font-medium">Job</th>
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Due Date</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                    <th className="pb-2 font-medium text-right">Paid</th>
                    <th className="pb-2 font-medium text-right">Balance</th>
                    <th className="pb-2 font-medium text-center">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receivables.map((r) => (
                    <tr
                      key={r.invoiceId}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        r.daysOverdue > 90 ? "bg-red-50/50" : ""
                      )}
                    >
                      <td className="py-3">
                        <Link
                          href={`/jobs/${r.jobId}/invoices/${r.invoiceId}`}
                          className="font-mono text-primary hover:underline font-medium"
                        >
                          {r.invoiceNumber}
                        </Link>
                      </td>
                      <td className="py-3">
                        <Link href={`/jobs/${r.jobId}`} className="hover:underline text-muted-foreground">
                          {r.jobTitle}
                        </Link>
                      </td>
                      <td className="py-3 text-muted-foreground">{r.clientName ?? "—"}</td>
                      <td className="py-3">
                        <span className={cn(
                          r.daysOverdue > 0 ? "text-red-600 font-medium" : "text-muted-foreground"
                        )}>
                          {fmtDate(r.dueDate)}
                        </span>
                      </td>
                      <td className="py-3 text-right">${fmt(r.totalAmount)}</td>
                      <td className="py-3 text-right text-green-600">${fmt(r.amountPaid)}</td>
                      <td className="py-3 text-right font-semibold text-orange-600">
                        ${fmt(r.balanceDue)}
                      </td>
                      <td className="py-3 text-center">
                        <Badge className={cn("text-xs", AGE_STYLES[r.ageBucket] ?? "bg-muted text-muted-foreground")}>
                          {r.ageBucket}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold text-sm bg-muted/20">
                    <td colSpan={4} className="pt-3 pb-2">Total Outstanding</td>
                    <td className="pt-3 pb-2 text-right">
                      ${fmt(receivables.reduce((s, r) => s + r.totalAmount, 0))}
                    </td>
                    <td className="pt-3 pb-2 text-right text-green-600">
                      ${fmt(receivables.reduce((s, r) => s + r.amountPaid, 0))}
                    </td>
                    <td className="pt-3 pb-2 text-right text-orange-600">
                      ${fmt(receivables.reduce((s, r) => s + r.balanceDue, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
