import { useState } from "react";
import { useGetJob, useAdvanceJobStage, useListEstimates, useApproveEstimate, useCreateEstimate, getGetJobQueryKey, getListEstimatesQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CheckCircle2, Clock, MapPin, AlignLeft, Calculator, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const stageOrder = ["Lead", "Quoting", "Approved", "Scheduled", "InProgress", "ComplianceReview", "Invoiced", "Closed"];

const estimateSchema = z.object({
  title: z.string().optional(),
  markupPercentage: z.coerce.number().min(0, "Markup must be at least 0"),
  lineItems: z.array(z.object({
    description: z.string().min(1, "Required"),
    quantity: z.coerce.number().min(1, "Must be > 0"),
    unitPrice: z.coerce.number().min(0, "Must be >= 0"),
    unit: z.string().optional(),
  })).min(1, "Add at least one line item"),
  notes: z.string().optional(),
});

export default function JobDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEstimateDialogOpen, setIsEstimateDialogOpen] = useState(false);
  
  const { data: job, isLoading: loadingJob } = useGetJob(id, { query: { enabled: !!id, queryKey: getGetJobQueryKey(id) } });
  const { data: estimates, isLoading: loadingEstimates } = useListEstimates({ query: { enabled: !!id, queryKey: getListEstimatesQueryKey() } });
  
  const advanceStage = useAdvanceJobStage();
  const approveEstimate = useApproveEstimate();
  const createEstimate = useCreateEstimate();

  const form = useForm<z.infer<typeof estimateSchema>>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      title: "",
      markupPercentage: 30,
      lineItems: [{ description: "", quantity: 1, unitPrice: 0, unit: "ea" }],
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  if (loadingJob) return <Skeleton className="h-[600px] w-full" />;
  if (!job) return <div className="text-center p-12 text-lg text-muted-foreground">Job not found</div>;

  const currentStageIndex = stageOrder.indexOf(job.stage);
  const nextStage = currentStageIndex < stageOrder.length - 1 ? stageOrder[currentStageIndex + 1] : null;
  const jobEstimates = estimates?.filter(e => e.jobId === id) || [];

  const handleAdvanceStage = () => {
    advanceStage.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Job stage advanced" });
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      },
      onError: () => {
        toast({ title: "Failed to advance stage", variant: "destructive" });
      }
    });
  };

  const handleApproveEstimate = (estimateId: number) => {
    approveEstimate.mutate({ id: estimateId }, {
      onSuccess: () => {
        toast({ title: "Estimate approved" });
        queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(id) });
      },
      onError: () => {
        toast({ title: "Failed to approve estimate", variant: "destructive" });
      }
    });
  };

  const onSubmitEstimate = (values: z.infer<typeof estimateSchema>) => {
    createEstimate.mutate({ data: { ...values, jobId: id } as any }, {
      onSuccess: () => {
        toast({ title: "Estimate created" });
        queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
        setIsEstimateDialogOpen(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Failed to create estimate", variant: "destructive" });
      }
    });
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
              <Dialog open={isEstimateDialogOpen} onOpenChange={setIsEstimateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="shadow-sm">
                    <Plus className="h-4 w-4 mr-1" /> New Estimate
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Estimate</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmitEstimate)} className="space-y-6 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Title (optional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Initial Quote" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="markupPercentage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Markup %</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-sm">Line Items</h4>
                          <Button type="button" variant="ghost" size="sm" onClick={() => append({ description: "", quantity: 1, unitPrice: 0, unit: "ea" })}>
                            <Plus className="h-4 w-4 mr-1" /> Add Item
                          </Button>
                        </div>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                          {fields.map((field, index) => (
                            <div key={field.id} className="flex gap-2 items-start bg-muted/30 p-2 rounded-md border">
                              <div className="flex-1 space-y-2">
                                <FormField
                                  control={form.control}
                                  name={`lineItems.${index}.description`}
                                  render={({ field }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input {...field} placeholder="Description" className="h-8" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <div className="flex gap-2">
                                  <FormField
                                    control={form.control}
                                    name={`lineItems.${index}.quantity`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-0 flex-1">
                                        <FormControl>
                                          <Input type="number" {...field} placeholder="Qty" className="h-8" />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name={`lineItems.${index}.unitPrice`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-0 flex-1">
                                        <FormControl>
                                          <Input type="number" {...field} placeholder="Price" className="h-8" />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name={`lineItems.${index}.unit`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-0 w-16">
                                        <FormControl>
                                          <Input {...field} placeholder="Unit" className="h-8" />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="h-8 w-8 text-destructive self-center shrink-0">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button type="submit" disabled={createEstimate.isPending}>
                          {createEstimate.isPending ? "Creating..." : "Save Estimate"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
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
                            <span className="text-sm font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                              Margin: {estimate.margin}%
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-black tracking-tight text-primary">${estimate.customerTotal?.toLocaleString()}</div>
                          <div className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wider">Total Value</div>
                        </div>
                      </div>

                      {estimate.lineItems && estimate.lineItems.length > 0 && (
                        <div className="rounded-md border overflow-hidden">
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
                                  <TableCell className="font-medium">{item.description}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{item.quantity} {item.unit}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">${item.unitPrice?.toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-medium">${(item.quantity * item.unitPrice)?.toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {estimate.status === 'Sent' && (
                        <div className="mt-6 flex justify-end">
                          <Button 
                            onClick={() => handleApproveEstimate(estimate.id)}
                            disabled={approveEstimate.isPending}
                            className="hover-elevate shadow-md bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve Estimate
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
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
