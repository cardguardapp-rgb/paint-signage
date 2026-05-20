import { useState, useMemo, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetJob,
  useGetEstimate,
  useCreateEstimate,
  useUpdateEstimate,
  useShareEstimate,
  getGetJobQueryKey,
  getGetEstimateQueryKey,
  getListEstimatesQueryKey,
  EstimateCustomerStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calculator, Plus, Trash2, Link as LinkIcon, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const internalBudgetItemSchema = z.object({
  category: z.enum(["Labor", "Material", "Equipment"]),
  description: z.string().min(1, "Required"),
  quantity: z.coerce.number().min(1),
  unitCost: z.coerce.number().min(0),
  unit: z.string().optional(),
});

const customerLineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  displayName: z.string().optional(),
  quantity: z.coerce.number().min(1),
  unitPrice: z.coerce.number().min(0),
  unit: z.string().optional(),
});

const estimateSchema = z.object({
  title: z.string().optional(),
  markupPercentage: z.coerce.number().min(0),
  internalBudgetItems: z.array(internalBudgetItemSchema).default([]),
  lineItems: z.array(customerLineItemSchema).default([]),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof estimateSchema>;

export default function EstimateEditor() {
  const params = useParams();
  const jobId = Number(params.id);
  const estimateId = params.estimateId ? Number(params.estimateId) : null;
  const isNew = !estimateId;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: job } = useGetJob(jobId, { query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId) } });
  const { data: estimate } = useGetEstimate(jobId, estimateId as number, {
    query: { enabled: !isNew && !!estimateId, queryKey: getGetEstimateQueryKey(jobId, estimateId as number) }
  });

  const createEstimate = useCreateEstimate();
  const updateEstimate = useUpdateEstimate();
  const shareEstimate = useShareEstimate();

  const form = useForm<FormValues>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      title: "",
      markupPercentage: 30,
      internalBudgetItems: [],
      lineItems: [],
      notes: "",
    },
  });

  useEffect(() => {
    if (estimate && !isNew) {
      form.reset({
        title: estimate.title || "",
        markupPercentage: estimate.markupPercentage,
        internalBudgetItems: estimate.internalBudgetItems as any || [],
        lineItems: estimate.lineItems as any || [],
        notes: estimate.notes || "",
      });
    }
  }, [estimate, isNew, form]);

  const { fields: budgetFields, append: appendBudget, remove: removeBudget } = useFieldArray({
    control: form.control,
    name: "internalBudgetItems",
  });

  const { fields: lineFields, append: appendLine, remove: removeLine, replace: replaceLines } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const watchBudgetItems = form.watch("internalBudgetItems") || [];
  const watchLineItems = form.watch("lineItems") || [];
  const watchMarkup = form.watch("markupPercentage") || 0;

  const internalCost = useMemo(() => {
    return watchBudgetItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
  }, [watchBudgetItems]);

  const customerTotal = useMemo(() => {
    if (watchLineItems.length > 0) {
      return watchLineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    }
    return internalCost * (1 + watchMarkup / 100);
  }, [watchLineItems, internalCost, watchMarkup]);

  const grossProfit = customerTotal - internalCost;
  const margin = customerTotal > 0 ? (grossProfit / customerTotal) * 100 : 0;

  const marginColor = margin >= 25 ? "text-green-600 bg-green-50" : margin >= 15 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";
  const marginBarColor = margin >= 25 ? "bg-green-500" : margin >= 15 ? "bg-yellow-500" : "bg-red-500";

  const handleAutoGenerate = () => {
    const generated = watchBudgetItems.map(item => ({
      description: item.description,
      displayName: item.description,
      quantity: item.quantity,
      unitPrice: Number((item.unitCost * (1 + watchMarkup / 100)).toFixed(2)),
      unit: item.unit || "ea",
    }));
    replaceLines(generated);
    toast({ title: "Customer Quote Generated", description: "Line items created from internal budget." });
  };

  const handleShare = () => {
    if (!estimateId) return;
    shareEstimate.mutate({ jobId, id: estimateId }, {
      onSuccess: (data) => {
        const url = `${window.location.origin}/quote/${data.shareToken}`;
        navigator.clipboard.writeText(url);
        toast({ title: "Link Copied!", description: "Customer quote link copied to clipboard." });
        queryClient.invalidateQueries({ queryKey: getGetEstimateQueryKey(jobId, estimateId) });
        queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
      },
      onError: () => toast({ title: "Share failed", variant: "destructive" })
    });
  };

  const onSubmit = (values: FormValues) => {
    if (isNew) {
      createEstimate.mutate({ jobId }, { data: { ...values, jobId } as any }, {
        onSuccess: (data) => {
          toast({ title: "Estimate saved" });
          queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
          setLocation(`/jobs/${jobId}/estimates/${data.id}`);
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" })
      });
    } else {
      updateEstimate.mutate({ jobId, id: estimateId }, { data: values as any }, {
        onSuccess: () => {
          toast({ title: "Estimate updated" });
          queryClient.invalidateQueries({ queryKey: getGetEstimateQueryKey(jobId, estimateId) });
          queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" })
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/jobs/${jobId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Job
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{job?.title} - {isNew ? "New Estimate" : "Edit Estimate"}</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="sticky top-6">
              <Card>
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calculator className="h-5 w-5" /> Profit Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Internal Cost</span>
                    <span className="font-semibold">${internalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Customer Total</span>
                    <span className="font-semibold text-primary">${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t pt-4 flex justify-between items-center">
                    <span className="font-medium">Gross Profit</span>
                    <span className="font-bold">${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  
                  <div className={`mt-4 p-4 rounded-lg border ${marginColor}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold">Margin</span>
                      <span className="text-lg font-bold">{margin.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-black/10 rounded-full overflow-hidden">
                      <div className={`h-full ${marginBarColor} transition-all duration-500`} style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }} />
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-4" size="lg" disabled={createEstimate.isPending || updateEstimate.isPending}>
                    Save Estimate
                  </Button>
                  
                  {!isNew && (
                    <Button type="button" variant="outline" className="w-full" onClick={handleShare} disabled={shareEstimate.isPending}>
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {estimate?.shareToken ? "Copy Share Link" : "Generate Share Link"}
                    </Button>
                  )}
                  
                  {estimate?.customerStatus && (
                    <div className="pt-4 text-center">
                      <Badge variant="outline" className="text-xs uppercase tracking-wider bg-background px-2 py-1">
                        Status: {estimate.customerStatus}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="lg:col-span-3">
            <Card className="h-full">
              <Tabs defaultValue="budget" className="w-full">
                <div className="border-b px-6 py-2 bg-muted/10 flex justify-between items-center">
                  <TabsList className="grid w-[400px] grid-cols-2">
                    <TabsTrigger value="budget">Internal Budget</TabsTrigger>
                    <TabsTrigger value="quote">Customer Quote</TabsTrigger>
                  </TabsList>
                  
                  <div className="flex items-center gap-4">
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormLabel className="whitespace-nowrap text-muted-foreground">Title:</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Estimate Title" className="w-[200px] h-8" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="markupPercentage" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormLabel className="whitespace-nowrap text-muted-foreground">Markup %:</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} className="w-[80px] h-8" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                <TabsContent value="budget" className="p-0 border-0 m-0">
                  <div className="p-6 space-y-8">
                    {["Labor", "Material", "Equipment"].map((category) => {
                      const categoryItems = watchBudgetItems.map((item, idx) => ({ ...item, originalIndex: idx })).filter(item => item.category === category);
                      const subtotal = categoryItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
                      
                      return (
                        <div key={category} className="space-y-4">
                          <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="text-lg font-semibold">{category}</h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => appendBudget({ category: category as any, description: "", quantity: 1, unitCost: 0, unit: "ea" })}>
                              <Plus className="h-4 w-4 mr-1" /> Add {category}
                            </Button>
                          </div>
                          
                          {categoryItems.length > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-muted-foreground uppercase px-2">
                                <div className="col-span-5">Description</div>
                                <div className="col-span-2">Qty</div>
                                <div className="col-span-2">Unit</div>
                                <div className="col-span-2">Unit Cost</div>
                                <div className="col-span-1 text-right">Total</div>
                              </div>
                              {categoryItems.map((item) => (
                                <div key={item.originalIndex} className="grid grid-cols-12 gap-4 items-center bg-muted/30 p-2 rounded-md border">
                                  <div className="col-span-5">
                                    <FormField control={form.control} name={`internalBudgetItems.${item.originalIndex}.description`} render={({ field }) => (
                                      <FormItem><FormControl><Input {...field} className="h-8" placeholder="Description" /></FormControl></FormItem>
                                    )} />
                                  </div>
                                  <div className="col-span-2">
                                    <FormField control={form.control} name={`internalBudgetItems.${item.originalIndex}.quantity`} render={({ field }) => (
                                      <FormItem><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                    )} />
                                  </div>
                                  <div className="col-span-2">
                                    <FormField control={form.control} name={`internalBudgetItems.${item.originalIndex}.unit`} render={({ field }) => (
                                      <FormItem><FormControl><Input {...field} className="h-8" placeholder="ea" /></FormControl></FormItem>
                                    )} />
                                  </div>
                                  <div className="col-span-2">
                                    <FormField control={form.control} name={`internalBudgetItems.${item.originalIndex}.unitCost`} render={({ field }) => (
                                      <FormItem><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                    )} />
                                  </div>
                                  <div className="col-span-1 flex justify-between items-center">
                                    <span className="font-medium">${(item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive ml-2" onClick={() => removeBudget(item.originalIndex)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              <div className="text-right pt-2 text-sm text-muted-foreground">
                                {category} Subtotal: <span className="font-semibold text-foreground">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center p-4 bg-muted/20 border border-dashed rounded-md text-muted-foreground text-sm">
                              No {category.toLowerCase()} items added yet.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="quote" className="p-0 border-0 m-0">
                  <div className="p-6 space-y-6">
                    <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg border">
                      <div>
                        <h3 className="font-semibold">Customer Line Items</h3>
                        <p className="text-sm text-muted-foreground">These items will be visible to the customer on their quote.</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={handleAutoGenerate}>
                        Auto-generate from Budget
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {watchLineItems.length > 0 ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-muted-foreground uppercase px-2">
                            <div className="col-span-4">Display Name</div>
                            <div className="col-span-3">Internal Ref</div>
                            <div className="col-span-1">Qty</div>
                            <div className="col-span-2">Unit Price</div>
                            <div className="col-span-2 text-right">Line Total</div>
                          </div>
                          {lineFields.map((field, idx) => {
                            const item = watchLineItems[idx] || field;
                            return (
                              <div key={field.id} className="grid grid-cols-12 gap-4 items-center bg-card p-2 rounded-md border shadow-sm">
                                <div className="col-span-4">
                                  <FormField control={form.control} name={`lineItems.${idx}.displayName`} render={({ field }) => (
                                    <FormItem><FormControl><Input {...field} className="h-8" placeholder="Customer sees this" /></FormControl></FormItem>
                                  )} />
                                </div>
                                <div className="col-span-3">
                                  <FormField control={form.control} name={`lineItems.${idx}.description`} render={({ field }) => (
                                    <FormItem><FormControl><Input {...field} className="h-8" placeholder="Internal Ref" disabled /></FormControl></FormItem>
                                  )} />
                                </div>
                                <div className="col-span-1">
                                  <FormField control={form.control} name={`lineItems.${idx}.quantity`} render={({ field }) => (
                                    <FormItem><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                  )} />
                                </div>
                                <div className="col-span-2 flex items-center gap-2">
                                  <FormField control={form.control} name={`lineItems.${idx}.unitPrice`} render={({ field }) => (
                                    <FormItem className="flex-1"><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                  )} />
                                  <span className="text-muted-foreground text-xs">/ {item.unit || "ea"}</span>
                                </div>
                                <div className="col-span-2 flex justify-between items-center pl-2">
                                  <span className="font-semibold text-primary">${((item.quantity||0) * (item.unitPrice||0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive ml-1" onClick={() => removeLine(idx)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center p-12 border border-dashed rounded-lg bg-muted/10">
                          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                          <p className="text-muted-foreground mb-4">No customer line items generated yet.</p>
                          <Button type="button" variant="outline" onClick={handleAutoGenerate}>Generate from Budget Now</Button>
                        </div>
                      )}
                      
                      <div className="mt-4 flex justify-start">
                        <Button type="button" variant="ghost" size="sm" onClick={() => appendLine({ description: "Custom Item", displayName: "", quantity: 1, unitPrice: 0, unit: "ea" })}>
                          <Plus className="h-4 w-4 mr-1" /> Add Custom Line Item
                        </Button>
                      </div>
                    </div>

                    <div className="pt-6 border-t">
                      <FormField control={form.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} placeholder="Notes visible to the customer on their quote..." className="min-h-[100px]" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </form>
      </Form>
    </div>
  );
}
