import { useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPublicQuote, useRespondToQuote, getGetPublicQuoteQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, MessageSquareWarning, MapPin, Building2, User } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function QuotePortal() {
  const params = useParams();
  const token = params.token as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  const { data: quoteData, isLoading } = useGetPublicQuote(token, {
    query: { enabled: !!token, queryKey: getGetPublicQuoteQueryKey(token) }
  });

  const respondToQuote = useRespondToQuote();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col items-center pt-12">
        <Skeleton className="h-16 w-full max-w-4xl mb-8" />
        <Skeleton className="h-[600px] w-full max-w-4xl" />
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center">
        <Card className="w-[400px]">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Quote not found or link has expired.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { estimate, jobTitle, siteAddress, companyName, clientName, clientEmail } = quoteData;

  const handleApprove = () => {
    respondToQuote.mutate({ token }, { data: { action: "approve" } } as any, {
      onSuccess: () => {
        toast({ title: "Quote Approved", description: "Thank you for your business!" });
        queryClient.invalidateQueries({ queryKey: getGetPublicQuoteQueryKey(token) });
      },
      onError: () => toast({ title: "Error", description: "Could not approve quote.", variant: "destructive" })
    });
  };

  const handleRequestChanges = () => {
    if (!changeNote.trim()) {
      toast({ title: "Note required", description: "Please enter your change request.", variant: "destructive" });
      return;
    }
    respondToQuote.mutate({ token }, { data: { action: "request_changes", note: changeNote } } as any, {
      onSuccess: () => {
        toast({ title: "Changes Requested", description: "We will be in touch shortly." });
        queryClient.invalidateQueries({ queryKey: getGetPublicQuoteQueryKey(token) });
        setIsRequestingChanges(false);
      },
      onError: () => toast({ title: "Error", description: "Could not send change request.", variant: "destructive" })
    });
  };

  const customerTotal = estimate.lineItems?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) || estimate.customerTotal;

  return (
    <div className="min-h-screen bg-muted/10 pb-20">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-2 text-primary font-bold text-xl">
            <Building2 className="h-6 w-6" />
            {companyName || "ProSignage"}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 space-y-8">
        {/* Status Banners */}
        {estimate.customerStatus === "Approved" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex items-center gap-4 text-green-800 shadow-sm">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-green-900">Quote Approved</h2>
              <p>You have approved this quote. Thank you for your business!</p>
            </div>
          </div>
        )}

        {estimate.customerStatus === "ChangesRequested" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-center gap-4 text-yellow-800 shadow-sm">
            <MessageSquareWarning className="h-8 w-8 text-yellow-600 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-yellow-900">Changes Requested</h2>
              <p>We've received your request and will follow up with an updated quote soon.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md border overflow-hidden">
          {/* Quote Header Info */}
          <div className="p-8 border-b bg-muted/5">
            <div className="flex flex-col md:flex-row md:justify-between gap-6">
              <div className="space-y-4">
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{jobTitle}</h1>
                  <p className="text-muted-foreground mt-1 font-medium">{estimate.title || "Estimate"}</p>
                </div>
                
                {siteAddress && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mt-4">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{siteAddress}</span>
                  </div>
                )}
              </div>
              
              <div className="text-left md:text-right bg-white p-4 rounded-lg border shadow-sm self-start">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Prepared For</p>
                <div className="flex items-center gap-2 md:justify-end font-semibold text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  {clientName}
                </div>
                {clientEmail && <p className="text-sm text-muted-foreground mt-1">{clientEmail}</p>}
                <p className="text-sm text-muted-foreground mt-3">
                  Date: {new Date(estimate.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="p-0 sm:p-8">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground">Item Description</TableHead>
                    <TableHead className="text-right font-semibold text-foreground w-[100px]">Qty</TableHead>
                    <TableHead className="text-right font-semibold text-foreground w-[150px]">Unit Price</TableHead>
                    <TableHead className="text-right font-semibold text-foreground w-[150px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimate.lineItems && estimate.lineItems.length > 0 ? (
                    estimate.lineItems.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/10">
                        <TableCell className="font-medium text-foreground py-4">
                          {item.displayName || item.description}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground py-4">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground py-4">
                          ${item.unitPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground py-4">
                          ${((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No line items listed.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Total Row */}
            <div className="mt-8 flex justify-end">
              <div className="bg-primary/5 rounded-lg p-6 border border-primary/10 min-w-[300px]">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-foreground">Total Estimate</span>
                  <span className="text-3xl font-black text-primary tracking-tight">
                    ${customerTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {estimate.notes && (
              <div className="mt-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Notes & Terms</h3>
                <div className="bg-muted/20 p-5 rounded-lg border text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {estimate.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {(!estimate.customerStatus || estimate.customerStatus === "Pending") && (
          <div className="bg-white p-8 rounded-xl shadow-md border">
            {!isRequestingChanges ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  onClick={handleApprove}
                  disabled={respondToQuote.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold text-lg px-8 py-6 h-auto w-full sm:w-auto shadow-lg hover:shadow-xl transition-all"
                >
                  <CheckCircle2 className="mr-2 h-6 w-6" />
                  Approve Quote
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => setIsRequestingChanges(true)}
                  disabled={respondToQuote.isPending}
                  className="font-bold text-lg px-8 py-6 h-auto w-full sm:w-auto"
                >
                  Request Changes
                </Button>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl mx-auto">
                <h3 className="font-bold text-lg text-foreground">Request Changes</h3>
                <p className="text-sm text-muted-foreground">Let us know what you'd like to adjust and we'll send an updated quote.</p>
                <Textarea 
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="I would like to change..."
                  className="min-h-[150px] resize-none text-base p-4"
                />
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="ghost" onClick={() => setIsRequestingChanges(false)} disabled={respondToQuote.isPending}>
                    Cancel
                  </Button>
                  <Button onClick={handleRequestChanges} disabled={respondToQuote.isPending}>
                    Submit Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
