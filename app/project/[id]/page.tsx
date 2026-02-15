"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type UploadResult = { uploadId: string; count: number };

type LatestUploadSummary = {
  uploadId: string;
  source: string;
  createdAt: string;
  count: number;
};

type RunHistoryItem = {
  id: string;
  scope: "upload" | "project";
  source_filter: "all" | "reviews" | "support" | "surveys";
  entry_count: number;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
};

type RunMemoMeta = {
  run_id: string;
  created_at: string;
};

type MemoMetaByRunId = Record<string, { created_at: string }>;

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  const [source, setSource] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");

  const [isUploading, setIsUploading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [latest, setLatest] = useState<LatestUploadSummary | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  // Step 1 additions: Run entry point UI state
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [runMsg, setRunMsg] = useState<string>("");
  const [runError, setRunError] = useState<string>("");

  // Step 3 additions: Run History state
  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // ✅ Step 1 (Day 9): memo existence + memo timestamp map by run_id
  const [memoMeta, setMemoMeta] = useState<MemoMetaByRunId>({});

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Not authenticated. Please log in again.");
    }
    return data.session.access_token;
  }

  async function loadLatestUploadSummary(projectId: string) {
    setLoadingLatest(true);

    try {
      const { data: u } = await supabase
        .from("uploads")
        .select("id, source, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!u) {
        setLatest(null);
        return;
      }

      const { count } = await supabase
        .from("feedback_entries")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", u.id);

      setLatest({
        uploadId: u.id,
        source: u.source,
        createdAt: u.created_at,
        count: count ?? 0,
      });
    } finally {
      setLoadingLatest(false);
    }
  }

  // ✅ Step 1 (Day 9): Load run history list + memo metadata (fast, no joins)
  async function loadRunHistory(projectId: string) {
    setLoadingRuns(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: runRows } = await supabase
        .from("runs")
        .select("id, scope, source_filter, entry_count, status, created_at")
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const runsList = (runRows ?? []) as RunHistoryItem[];
      setRuns(runsList);

      // Fetch memo metadata for these runs (only run_id + created_at)
      const runIds = runsList.map((r) => r.id);
      if (runIds.length === 0) {
        setMemoMeta({});
        return;
      }

      const { data: memoRows } = await supabase
        .from("run_memos")
        .select("run_id, created_at")
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id)
        .in("run_id", runIds);

      const map: MemoMetaByRunId = {};
      ((memoRows ?? []) as RunMemoMeta[]).forEach((m) => {
        map[m.run_id] = { created_at: m.created_at };
      });

      setMemoMeta(map);
    } finally {
      setLoadingRuns(false);
    }
  }

  async function uploadCsv(projectId: string, src: string, file: File) {
    const token = await getAccessToken();

    const fd = new FormData();
    fd.append("projectId", projectId);
    fd.append("source", src);
    fd.append("file", file);

    const res = await fetch("/api/upload/csv", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "CSV upload failed");
    return data as UploadResult;
  }

  async function uploadText(projectId: string, src: string, text: string) {
    const token = await getAccessToken();

    const res = await fetch("/api/upload/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId, source: src, text }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Text upload failed");
    return data as UploadResult;
  }

  // Step 1 addition: create Run API call
  async function createRun(projectId: string) {
    const token = await getAccessToken();

    const res = await fetch("/api/runs/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        scope: "upload", // Day 4 default: latest upload snapshot
        sourceFilter: "all", // Day 4 default
        // uploadId intentionally omitted → API uses latest upload
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Unable to create a run.");
    return data as { runId: string };
  }

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase
        .from("projects")
        .select("name")
        .eq("id", id)
        .single();

      if (!data) {
        router.replace("/dashboard");
        return;
      }

      setName(data.name);
      setLoading(false);

      await loadLatestUploadSummary(id);
      await loadRunHistory(id);
    }

    load();
  }, [id, router]);

  if (loading) return <div style={{ padding: 32 }}>Loading project...</div>;

  const formatTime = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600 }}>{name}</h1>

      {/* Latest Upload Summary */}
      <section
        style={{
          marginTop: 32,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Latest Upload</div>

        {loadingLatest ? (
          <div>Loading…</div>
        ) : latest ? (
          <>
            <div>Source: {latest.source}</div>
            <div>Entries: {latest.count}</div>
            <div>Uploaded: {formatTime(latest.createdAt)}</div>
            <div style={{ marginTop: 4 }}>Status: Ready to analyze</div>

            {/* 👇 Step 1: View Feedback + Generate Insights (Run entry point) */}
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Link
                href={`/project/${id}/feedback`}
                style={{
                  display: "inline-block",
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                View Feedback
              </Link>

              <button
                disabled={isCreatingRun || !latest}
                onClick={async () => {
                  setRunMsg("");
                  setRunError("");

                  if (!latest) {
                    setRunError(
                      "No uploads yet. Upload feedback to generate insights.",
                    );
                    return;
                  }

                  setIsCreatingRun(true);

                  try {
                    const { runId } = await createRun(id);
                    // refresh history before leaving (useful when user comes back)
                    await loadRunHistory(id);
                    router.push(`/project/${id}/runs/${runId}`);
                  } catch (e: unknown) {
                    setRunError(
                      e instanceof Error
                        ? e.message
                        : "Unable to create a run.",
                    );
                  } finally {
                    setIsCreatingRun(false);
                  }
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: isCreatingRun || !latest ? "#f3f3f3" : "white",
                  fontSize: 14,
                  cursor: isCreatingRun || !latest ? "not-allowed" : "pointer",
                }}
              >
                {isCreatingRun ? "Creating run..." : "Generate Insights"}
              </button>
            </div>

            {runError && (
              <div style={{ marginTop: 10, color: "crimson" }}>{runError}</div>
            )}

            {runMsg && <div style={{ marginTop: 10 }}>{runMsg}</div>}
          </>
        ) : (
          <div>No uploads yet. Upload feedback to generate insights.</div>
        )}
      </section>

      {/* Run History */}
      <section
        style={{
          marginTop: 24,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Run History</div>

        {loadingRuns ? (
          <div>Loading…</div>
        ) : runs.length === 0 ? (
          <div style={{ color: "#666" }}>No runs yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {runs.map((r) => {
              const memoSavedAt = memoMeta[r.id]?.created_at;
              const hasMemo = !!memoSavedAt;

              return (
                <Link
                  key={r.id}
                  href={`/project/${id}/runs/${r.id}`}
                  style={{
                    textDecoration: "none",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 12,
                    color: "#111",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>

                  <div style={{ color: "#444", marginTop: 4, fontSize: 14 }}>
                    Scope:{" "}
                    {r.scope === "project" ? "Project-wide" : "Single upload"} •
                    Source: {r.source_filter} • Entries: {r.entry_count} •
                    Status: {r.status} •{" "}
                    <span style={{ fontWeight: 600 }}>
                      {hasMemo ? "✅ Memo" : "— No memo"}
                    </span>
                  </div>

                  {hasMemo && (
                    <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                      Memo saved at: {new Date(memoSavedAt).toLocaleString()}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Upload Section */}
      <section
        style={{
          marginTop: 40,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 20, marginBottom: 16 }}>
          Upload Customer Feedback
        </h2>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select source</option>
            <option value="reviews">Reviews</option>
            <option value="support">Support</option>
            <option value="surveys">Surveys</option>
          </select>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={6}
          placeholder="Or paste feedback here..."
          style={{
            width: "100%",
            marginTop: 16,
            padding: 8,
          }}
        />

        <div style={{ marginTop: 16 }}>
          <button
            disabled={isUploading}
            onClick={async () => {
              setResultMsg("");
              setErrorMsg("");

              if (!source) {
                setErrorMsg("Please select a source.");
                return;
              }

              const hasCsv = !!csvFile;
              const hasText = rawText.trim().length > 0;

              if (!hasCsv && !hasText) {
                setErrorMsg("Upload CSV or paste text.");
                return;
              }

              if (hasCsv && hasText) {
                setErrorMsg("Use either CSV or text, not both.");
                return;
              }

              setIsUploading(true);

              try {
                let result: UploadResult;

                if (csvFile) {
                  result = await uploadCsv(id, source, csvFile);
                  setRawText("");
                } else {
                  result = await uploadText(id, source, rawText);
                  setCsvFile(null);
                }

                setResultMsg(
                  `Entries ingested: ${result.count} — Ready to analyze.`,
                );

                await loadLatestUploadSummary(id);
              } catch (e: unknown) {
                setErrorMsg(e instanceof Error ? e.message : "Upload failed");
              } finally {
                setIsUploading(false);
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {errorMsg && (
          <div style={{ marginTop: 8, color: "crimson" }}>{errorMsg}</div>
        )}

        {resultMsg && <div style={{ marginTop: 8 }}>{resultMsg}</div>}
      </section>
    </div>
  );
}
