import { useGetDashboardSummary, useGetPipelineStats, useGetRecentActivity, useListJobs, getGetDashboardSummaryQueryKey, getGetPipelineStatsQueryKey, getGetRecentActivityQueryKey, getListJobsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, CircleDollarSign, AlertCircle, CheckCircle2, ShieldCheck, Shield, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";

const SAFETY_STAGES = new Set(["Approved", "Scheduled", "InProgress"]);

function SafetyBadge({ status }: { status?: string }) {
  if (status === "Compliant") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded">
        <ShieldCheck className="h-2.5 w-2.5" /> Compliant
      </span>
    );
  }
  if (status === "PendingSignatures") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded">
        <Shield className="h-2.5 w-2.5" /> Pending Sign
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded">
      <ShieldAlert className="h-2.5 w-2.5" /> No SWMS
    </span>
  );
}

const stages = ["Lead", "Quoting", "Approved", "Scheduled", "InProgress", "ComplianceReview", "Invoiced", "Closed"];

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: jobs, isLoading: loadingJobs } = useListJobs({ query: { queryKey: getListJobsQueryKey() } });
  const { data: pipelineStats } = useGetPipelineStats({ query: { queryKey: getGetPipelineStatsQueryKey() } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{summary?.totalJobs || 0}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Value</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">${summary?.totalPipelineValue?.toLocaleString() || 0}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Jobs</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{summary?.activeJobs || 0}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needing Attention</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold text-destructive">{summary?.jobsNeedingAttention || 0}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 h-[calc(100vh-280px)] min-h-[500px]">
        <Card className="col-span-5 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <CardTitle>Job Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-x-auto p-0 bg-muted/20">
            <div className="flex h-full p-4 gap-4 min-w-[1200px]">
              {stages.map(stage => {
                const stageJobs = jobs?.filter(j => j.stage === stage) || [];
                return (
                  <div key={stage} className="flex flex-col w-72 flex-shrink-0 bg-muted/40 rounded-lg">
                    <div className="p-3 font-semibold text-sm border-b bg-muted/60 rounded-t-lg flex justify-between items-center">
                      <span>{stage}</span>
                      <Badge variant="secondary" className="rounded-full px-2">{stageJobs.length}</Badge>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      <div className="space-y-2">
                        {loadingJobs ? (
                          <Skeleton className="h-24 w-full" />
                        ) : stageJobs.map(job => (
                          <Link href={`/jobs/${job.id}`} key={job.id}>
                            <Card className="cursor-pointer hover:border-primary transition-colors hover-elevate">
                              <CardContent className="p-3 space-y-2">
                                <div className="font-medium text-sm line-clamp-2 leading-tight">{job.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{job.clientName}</div>
                                <div className="flex justify-between items-center pt-2 gap-1 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] bg-background">
                                    ${job.estimatedValue?.toLocaleString() || '0'}
                                  </Badge>
                                  {SAFETY_STAGES.has(job.stage) && (
                                    <SafetyBadge status={job.swmsStatus} />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-2 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {loadingActivity ? (
                  Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : activity?.map(item => (
                  <div key={item.id} className="flex gap-3 text-sm">
                    <div className="mt-0.5"><div className="h-2 w-2 rounded-full bg-primary mt-1.5" /></div>
                    <div className="flex-1 space-y-1">
                      <p className="leading-tight">
                        <span className="font-medium">{item.action}</span> 
                        {' '}for job{' '}
                        <Link href={`/jobs/${item.jobId}`} className="font-medium hover:underline text-primary">
                          {item.jobTitle}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                        {item.stage && ` • ${item.stage}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
