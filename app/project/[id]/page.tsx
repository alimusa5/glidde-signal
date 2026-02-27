"use client";

import { useEffect, useMemo, useState } from "react";
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

type UpgradePayload = {
  title: string;
  starterIncludes: string[];
  proUnlocks: string[];
  cta: string;
};

type EntitlementsPayload = {
  plan: "starter" | "pro";
  isPro: boolean;
  runsUsedThisPeriod?: number | null;
  runsLimit?: number | null;
  nextResetAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

type RunCreateSuccess = { runId: string; entitlements?: EntitlementsPayload };

type RunCreateError = {
  code?: string;
  error?: string;
  entitlements?: EntitlementsPayload;
  upgrade?: UpgradePayload;
  waitSeconds?: number;
};

function formatDateShort(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function titleCase(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusChipStyle(
  status: RunHistoryItem["status"],
): React.CSSProperties {
  // No fancy colors; keep it simple and premium.
  // We can still differentiate by background shade and border.
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#fafafa",
    color: "#111",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };

  if (status === "completed") return base;
  if (status === "processing")
    return { ...base, background: "#fff", border: "1px solid #ccc" };
  if (status === "failed")
    return { ...base, background: "#fff", border: "1px solid #bbb" };
  // queued
  return { ...base, background: "#f3f3f3" };
}

function statusLabel(status: RunHistoryItem["status"]) {
  if (status === "completed") return "Completed";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Queued";
}

function statusDotStyle(status: RunHistoryItem["status"]): React.CSSProperties {
  // Minimal dot; no strong color signaling
  const base: React.CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: 999,
    display: "inline-block",
    background: "#111",
    opacity: 0.25,
  };

  if (status === "completed") return { ...base, opacity: 0.45 };
  if (status === "processing") return { ...base, opacity: 0.35 };
  if (status === "failed") return { ...base, opacity: 0.55 };
  return { ...base, opacity: 0.25 };
}

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

  // Run entry point UI state
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [runMsg, setRunMsg] = useState<string>("");
  const [runError, setRunError] = useState<string>("");

  // Day 12: premium run upgrade state
  const [runUpgrade, setRunUpgrade] = useState<UpgradePayload | null>(null);
  const [runEntitlements, setRunEntitlements] =
    useState<EntitlementsPayload | null>(null);

  const runBlocked = useMemo(() => runUpgrade !== null, [runUpgrade]);

  // Run History state
  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Memo existence + timestamp map by run_id
  const [memoMeta, setMemoMeta] = useState<MemoMetaByRunId>({});

  // Day 12: Starter vs Pro run history cap
  const [historyLimit, setHistoryLimit] = useState<number>(5);

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

  // Load run history list + memo metadata with plan-based limit
  async function loadRunHistory(projectId: string, limit: number) {
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
        .limit(limit);

      const runsList = (runRows ?? []) as RunHistoryItem[];
      setRuns(runsList);

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

  // Create run returning structured errors (no blind throw)
  async function createRun(
    projectId: string,
  ): Promise<
    | { ok: true; data: RunCreateSuccess }
    | { ok: false; status: number; data: RunCreateError }
  > {
    const token = await getAccessToken();

    const res = await fetch("/api/runs/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        scope: "upload",
        sourceFilter: "all",
      }),
    });

    const data = (await res.json().catch(() => ({}))) as RunCreateSuccess &
      RunCreateError;

    if (!res.ok) return { ok: false, status: res.status, data };
    return { ok: true, data: data as RunCreateSuccess };
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

      // Determine plan for history cap (starter=5, pro=50)
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("plan,status,updated_at")
        .eq("user_id", userData.user.id)
        .in("status", ["active", "trialing", "past_due"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isPro = subRow?.plan === "pro";
      const limit = isPro ? 50 : 5;
      setHistoryLimit(limit);

      await loadLatestUploadSummary(id);
      await loadRunHistory(id, limit);
    }

    load();
  }, [id, router]);

  if (loading) return <div style={{ padding: 32 }}>Loading project...</div>;

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
            <div>Source: {titleCase(latest.source)}</div>
            <div>Entries: {latest.count}</div>
            <div>Uploaded: {formatDateTime(latest.createdAt)}</div>
            <div style={{ marginTop: 4 }}>Status: Ready to analyze</div>

            {/* Plan/Usage header (only when we have entitlements) */}
            {runEntitlements && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #ddd",
                      background: "#fafafa",
                    }}
                  >
                    Current Plan:{" "}
                    <b style={{ textTransform: "capitalize" }}>
                      {runEntitlements.plan}
                    </b>
                  </span>

                  {typeof runEntitlements.runsUsedThisPeriod === "number" &&
                    typeof runEntitlements.runsLimit === "number" && (
                      <span style={{ fontSize: 13 }}>
                        Runs Used: <b>{runEntitlements.runsUsedThisPeriod}</b> /{" "}
                        {runEntitlements.runsLimit} this billing period
                      </span>
                    )}

                  {runEntitlements.runsLimit === null && (
                    <span style={{ fontSize: 13 }}>
                      Runs: <b>Unlimited</b>
                    </span>
                  )}

                  {runEntitlements.nextResetAt && (
                    <span style={{ fontSize: 13 }}>
                      Next Reset:{" "}
                      <b>
                        {formatDateShort(runEntitlements.nextResetAt) ??
                          runEntitlements.nextResetAt}
                      </b>
                    </span>
                  )}
                </div>

                {runEntitlements.periodStart && runEntitlements.periodEnd && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                    Billing period:{" "}
                    {formatDateShort(runEntitlements.periodStart) ??
                      runEntitlements.periodStart}{" "}
                    →{" "}
                    {formatDateShort(runEntitlements.periodEnd) ??
                      runEntitlements.periodEnd}
                  </div>
                )}
              </div>
            )}

            {/* View Feedback + Generate Insights */}
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
                  background: "#fff",
                }}
              >
                View Feedback
              </Link>

              <button
                disabled={isCreatingRun || !latest || runBlocked}
                onClick={async () => {
                  setRunMsg("");
                  setRunError("");
                  setRunUpgrade(null);

                  if (!latest) {
                    setRunError(
                      "No uploads yet. Upload feedback to generate insights.",
                    );
                    return;
                  }

                  setIsCreatingRun(true);

                  try {
                    const result = await createRun(id);

                    if (!result.ok) {
                      if (result.status === 402 && result.data?.upgrade) {
                        setRunUpgrade(result.data.upgrade ?? null);
                        setRunEntitlements(result.data.entitlements ?? null);
                        setRunError(result.data.error ?? "Upgrade required.");
                        return;
                      }

                      if (
                        result.status === 429 &&
                        result.data?.code === "RATE_LIMITED"
                      ) {
                        const wait = result.data.waitSeconds
                          ? ` (${result.data.waitSeconds}s)`
                          : "";
                        setRunError(
                          (result.data.error ??
                            "Please wait before trying again.") + wait,
                        );
                        return;
                      }

                      setRunError(
                        result.data?.error ?? "Unable to create a run.",
                      );
                      return;
                    }

                    if (result.data.entitlements) {
                      setRunEntitlements(result.data.entitlements);
                    }

                    const { runId } = result.data;

                    await loadRunHistory(id, historyLimit);
                    router.push(`/project/${id}/runs/${runId}`);
                  } finally {
                    setIsCreatingRun(false);
                  }
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background:
                    isCreatingRun || !latest || runBlocked ? "#f3f3f3" : "#fff",
                  fontSize: 14,
                  cursor:
                    isCreatingRun || !latest || runBlocked
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {isCreatingRun ? "Creating run..." : "Generate Insights"}
              </button>
            </div>

            {/* Premium Upgrade Card for Run limit */}
            {runUpgrade && (
              <div
                style={{
                  marginTop: 14,
                  padding: 16,
                  border: "1px solid #e5e5e5",
                  borderRadius: 14,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {runUpgrade.title}
                </div>
                <div style={{ marginTop: 6, color: "#444", fontSize: 13 }}>
                  You’ve hit the Starter run limit for this billing period. Pro
                  removes limits and supports continuous insight.
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "#fafafa",
                      border: "1px solid #eee",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Starter includes
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: 13,
                        color: "#333",
                      }}
                    >
                      {runUpgrade.starterIncludes.map((x) => (
                        <li key={x} style={{ marginBottom: 6 }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "#111",
                      color: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Pro unlocks
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: 13,
                        color: "#fff",
                      }}
                    >
                      {runUpgrade.proUnlocks.map((x) => (
                        <li key={x} style={{ marginBottom: 6 }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => router.push("/billing")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {runUpgrade.cta}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunUpgrade(null);
                      setRunError("");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      color: "#111",
                      cursor: "pointer",
                    }}
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}

            {runError && !runUpgrade && (
              <div style={{ marginTop: 10, color: "crimson" }}>{runError}</div>
            )}

            {runMsg && <div style={{ marginTop: 10 }}>{runMsg}</div>}
          </>
        ) : (
          <div>No uploads yet. Upload feedback to generate insights.</div>
        )}
      </section>

      {/* Run History (Polished) */}
      <section
        style={{
          marginTop: 24,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>Run History</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            Showing last {runs.length} run{runs.length === 1 ? "" : "s"}
            {historyLimit ? ` (cap: ${historyLimit})` : ""}
          </div>
        </div>

        {loadingRuns ? (
          <div>Loading…</div>
        ) : runs.length === 0 ? (
          <div style={{ color: "#666" }}>No runs yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {runs.map((r) => {
              const memoSavedAt = memoMeta[r.id]?.created_at;
              const hasMemo = !!memoSavedAt;

              const scopeLabel =
                r.scope === "project" ? "Project-wide" : "Latest upload";
              const sourceLabel =
                r.source_filter === "all"
                  ? "All sources"
                  : titleCase(r.source_filter);

              return (
                <Link
                  key={r.id}
                  href={`/project/${id}/runs/${r.id}`}
                  style={{
                    textDecoration: "none",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 14,
                    color: "#111",
                    background: "#fff",
                  }}
                >
                  {/* Top row: date + status chip */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 650 }}>
                      {formatDateTime(r.created_at)}
                    </div>

                    <span style={statusChipStyle(r.status)}>
                      <span style={statusDotStyle(r.status)} />
                      {statusLabel(r.status)}
                    </span>
                  </div>

                  {/* Middle row: snapshot metadata */}
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      fontSize: 13,
                      color: "#444",
                    }}
                  >
                    <span>
                      Scope: <b>{scopeLabel}</b>
                    </span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>
                      Source: <b>{sourceLabel}</b>
                    </span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>
                      Entries: <b>{r.entry_count}</b>
                    </span>
                  </div>

                  {/* Bottom row: memo indicator */}
                  <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                    <span style={{ fontWeight: 600 }}>
                      {hasMemo
                        ? "✅ Executive memo saved"
                        : "— No executive memo"}
                    </span>
                    {hasMemo && (
                      <span style={{ marginLeft: 8, color: "#777" }}>
                        ({formatDateTime(memoSavedAt)})
                      </span>
                    )}
                  </div>
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
          background: "#fff",
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
              background: "#fff",
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
