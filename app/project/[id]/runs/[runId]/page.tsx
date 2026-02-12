"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type RunRecord = {
  id: string;
  project_id: string;
  user_id: string;
  scope: "upload" | "project";
  upload_id: string | null;
  source_filter: "all" | "reviews" | "support" | "surveys";
  entry_count: number;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
};

type UploadInfo = {
  id: string;
  source: string;
  created_at: string;
};

export default function RunDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string; runId: string }>();
  const projectId = params.id;
  const runId = params.runId;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [upload, setUpload] = useState<UploadInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const formatTime = (iso: string) => new Date(iso).toLocaleString();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg("");

      // Auth gate
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      // Fetch run (must belong to project + user)
      const { data: r, error: runErr } = await supabase
        .from("runs")
        .select(
          "id, project_id, user_id, scope, upload_id, source_filter, entry_count, status, created_at",
        )
        .eq("id", runId)
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (runErr) {
        setErrorMsg("Something went wrong loading this run.");
        setLoading(false);
        return;
      }

      if (!r) {
        setErrorMsg("This run doesn’t exist.");
        setLoading(false);
        return;
      }

      setRun(r as RunRecord);

      // If scope=upload, fetch upload info for display
      if (r.scope === "upload" && r.upload_id) {
        const { data: u } = await supabase
          .from("uploads")
          .select("id, source, created_at")
          .eq("id", r.upload_id)
          .maybeSingle();

        if (u) setUpload(u as UploadInfo);
      }

      setLoading(false);
    }

    load();
  }, [projectId, runId, router]);

  if (loading) return <div style={{ padding: 32 }}>Loading run...</div>;

  if (errorMsg) {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
        <Link
          href={`/project/${projectId}`}
          style={{ textDecoration: "none", fontSize: 14 }}
        >
          ← Back to Project
        </Link>

        <div style={{ marginTop: 20, color: "#333" }}>{errorMsg}</div>
      </div>
    );
  }

  if (!run) return null;

  const scopeLabel = run.scope === "project" ? "Project-wide" : "Single upload";

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <Link
        href={`/project/${projectId}`}
        style={{ textDecoration: "none", fontSize: 14 }}
      >
        ← Back to Project
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>
        Run Details
      </h1>

      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 10 }}>
          Snapshot Metadata
        </div>

        <div>Run ID: {run.id}</div>
        <div>Created: {formatTime(run.created_at)}</div>
        <div>Status: {run.status}</div>
        <div>Scope: {scopeLabel}</div>
        <div>Source filter: {run.source_filter}</div>
        <div>Entry count at run time: {run.entry_count}</div>

        {run.scope === "upload" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Upload included
            </div>

            {upload ? (
              <>
                <div>Upload ID: {upload.id}</div>
                <div>Upload source: {upload.source}</div>
                <div>Uploaded: {formatTime(upload.created_at)}</div>
              </>
            ) : (
              <div>Upload info unavailable.</div>
            )}
          </div>
        )}

        <div style={{ marginTop: 14, color: "#666", fontSize: 13 }}>
          This run is a saved snapshot. Insights will appear in later days.
        </div>
      </section>
    </div>
  );
}
