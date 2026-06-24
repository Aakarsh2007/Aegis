"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Filter, Trash2, Loader2 } from "lucide-react";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const STATUSES = ["all", "open", "analyzing", "resolved", "failed"] as const;

interface Incident {
  id: string;
  status: string;
  severity: string;
  title: string | null;
  probeId: string;
  prUrl: string | null;
  errorMessage: string | null;
  createdAt: Date | string | null;
  aiConfidenceScore: number | null;
}

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Incident | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", status, page],
    queryFn: () =>
      fetch(`/api/incidents?status=${status}&page=${page}&limit=12`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  async function handleDelete(incident: Incident) {
    setDeletingId(incident.id);
    try {
      const res = await fetch(`/api/incidents/${incident.id}`, { method: "DELETE" });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["incidents"] });
      }
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  const incidents = data?.incidents ?? [];
  const hasMore = data?.pagination?.hasMore ?? false;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Incidents
          </h1>
          <p className="text-sm text-muted-foreground">All detected anomalies and their remediation status</p>
        </div>
      </div>

      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={status} className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Filter className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No incidents found</p>
              <p className="text-sm text-muted-foreground/60">
                {status === "all" ? "No incidents have been detected yet." : `No ${status} incidents.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {incidents.map((incident: Incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  onDelete={() => setConfirmDelete(incident)}
                />
              ))}
            </div>
          )}

          {(incidents.length > 0 || page > 1) && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasMore}>
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete incident?</DialogTitle>
            <DialogDescription>
              This will permanently remove incident{" "}
              <span className="font-mono font-semibold">#{confirmDelete?.id.slice(0, 8)}</span> and its
              associated events and remediations. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deletingId === confirmDelete?.id}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {deletingId === confirmDelete?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
