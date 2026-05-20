import { useState } from "react";
import { useGetClient, useListJobs, getGetClientQueryKey, getListJobsQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Mail, Phone, MapPin, Briefcase } from "lucide-react";

export default function ClientDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: client, isLoading: loadingClient } = useGetClient(id, { query: { enabled: !!id, queryKey: getGetClientQueryKey(id) } });
  const { data: jobs, isLoading: loadingJobs } = useListJobs({ clientId: id }, { query: { enabled: !!id, queryKey: getListJobsQueryKey({ clientId: id }) } });

  if (loadingClient) return <Skeleton className="h-64 w-full" />;
  if (!client) return <div className="text-center p-12 text-lg text-muted-foreground">Client not found</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-start bg-card p-6 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            {client.companyName}
          </h1>
          <p className="text-lg text-muted-foreground">{client.contactName}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-3 items-center">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <a href={`mailto:${client.email}`} className="hover:text-primary transition-colors">{client.email}</a>
            </div>
            {client.phone && (
              <div className="flex gap-3 items-center">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <a href={`tel:${client.phone}`} className="hover:text-primary transition-colors">{client.phone}</a>
              </div>
            )}
            {client.billingAddress && (
              <div className="flex gap-3 items-start">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <div>{client.billingAddress}</div>
                  <div>
                    {[client.city, client.state, client.zip].filter(Boolean).join(", ")}
                  </div>
                </div>
              </div>
            )}
            {client.notes && (
              <div className="mt-6 pt-4 border-t">
                <div className="font-semibold mb-2">Notes</div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" /> Client Jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingJobs ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !jobs || jobs.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No jobs found for this client.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Title</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map(job => (
                    <TableRow key={job.id} className="group hover:bg-muted/20">
                      <TableCell>
                        <Link href={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                          {job.title}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="bg-background">{job.stage}</Badge></TableCell>
                      <TableCell className="text-right font-medium">${job.estimatedValue?.toLocaleString() || "0"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
