"use client";

import { useEffect, useState, useCallback } from "react";
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
  label: string | null; // ✅ Day 9 Step 5: run naming
};

type UploadInfo = {
  id: string;
  source: string;
  created_at: string;
};

type RunProblem = {
  id: string;
  run_id: string;
  rank: number;
  title: string;
  summary: string | null;
  mention_count: number;
  sources: string[]; // text[] in Postgres comes back as string[]
  quotes: Array<{
    text: string;
    source: string;
    entry_id?: string;
    upload_id?: string;
  }>;
  created_at: string;
};

type RunFeature = {
  id: string;
  run_id: string;
  feature: string;
  mention_count: number;
  dominant_problem: string | null;
  created_at: string;
};

type DeltaItem = {
  title: string;
  prev_count?: number;
  curr_count?: number;
  delta?: number;
};

type RunDeltaRow = {
  new_problems: DeltaItem[];
  worsening: DeltaItem[];
  improving: DeltaItem[];
  resolved: DeltaItem[];
};

// ✅ Day 9 Step 2: link to previous run
type RunDeltaDbRow = RunDeltaRow & {
  previous_run_id: string | null;
};

type RunMemoRow = {
  content: string;
  created_at: string; // ✅ Day 9 Step 4: memo saved timestamp
};

type ProblemActionRow = {
  problem_id: string;
  suggested_action: string | null;
  first_check: string | null;
  owner_guess: string | null;
  expected_impact: string | null;
  created_at: string | null;
};

function formatDeltaItem(item: DeltaItem, kind: "new" | "resolved" | "change") {
  if (kind === "new") return `New: ${item.title}`;
  if (kind === "resolved") return item.title;

  const d = item.delta ?? 0;
  const abs = Math.abs(d);
  const word = abs === 1 ? "mention" : "mentions";
  const sign = d > 0 ? `+${d}` : `${d}`;
  return `${item.title} (${sign} ${word})`;
}

function DeltaList({
  title,
  items,
  kind,
}: {
  title: string;
  items: DeltaItem[];
  kind: "new" | "resolved" | "change";
}) {
  if (!items || items.length === 0) {
    return (
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ marginTop: 6, color: "#666", fontSize: 14 }}>
          No changes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      <ul style={{ marginTop: 8, paddingLeft: 18 }}>
        {items.map((it, idx) => (
          <li
            key={`${it.title}-${idx}`}
            style={{ marginBottom: 6, color: "#333", fontSize: 14 }}
          >
            {formatDeltaItem(it, kind)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ✅ Day 9 Step 4: clearer processing state + refresh hint
function ProcessingNotice({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ color: "#666", fontSize: 14 }}>
      <div style={{ marginBottom: 10 }}>
        This run is still processing. Entries are being indexed and insights
        will appear automatically when ready.
      </div>
      <button
        onClick={onRefresh}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Refresh
      </button>
    </div>
  );
}

// ✅ Renders memo with bigger headings (NOT bold), clean paragraphs, safe bullets (no innerHTML)
function MemoRenderer({ memo }: { memo: string }) {
  const headings = new Set([
    "Executive Summary",
    "This Month’s Customer Reality",
    "What Got Worse",
    "What Improved",
    "Top 3 Recommended Actions",
  ]);

  const lines = memo.split("\n");

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 16,
        background: "#fafafa",
        fontSize: 14,
        lineHeight: 1.55,
        color: "#222",
      }}
    >
      {lines.map((raw, idx) => {
        const line = raw.trim();

        // Empty line spacing
        if (!line) {
          return <div key={idx} style={{ height: 10 }} />;
        }

        // ✅ Headings: bigger, NOT bold
        if (headings.has(line)) {
          return (
            <div
              key={idx}
              style={{
                fontWeight: 500, // not bold
                fontSize: 16,
                marginTop: 14,
                marginBottom: 8,
              }}
            >
              {line}
            </div>
          );
        }

        // Bullets (already has "•")
        if (line.startsWith("•")) {
          return (
            <div key={idx} style={{ marginLeft: 12, marginBottom: 6 }}>
              {line}
            </div>
          );
        }

        // Normal paragraph line
        return (
          <div key={idx} style={{ marginBottom: 8 }}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function RunDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string; runId: string }>();
  const projectId = params.id;
  const runId = params.runId;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [upload, setUpload] = useState<UploadInfo | null>(null);

  const [problems, setProblems] = useState<RunProblem[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(false);

  const [features, setFeatures] = useState<RunFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  const [deltaRow, setDeltaRow] = useState<RunDeltaDbRow | null>(null);
  const [loadingDeltas, setLoadingDeltas] = useState(false);

  const [memo, setMemo] = useState("");
  const [memoSavedAt, setMemoSavedAt] = useState<string | null>(null);
  const [loadingMemo, setLoadingMemo] = useState(false);
  const [memoError, setMemoError] = useState("");
  const [copied, setCopied] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  // ✅ Day 9 Step 4: toast feedback (copy + label saved)
  const [toast, setToast] = useState<string>("");

  // ✅ Day 9 Step 5: run label edit
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  const [actionsByProblemId, setActionsByProblemId] = useState<
    Record<string, ProblemActionRow>
  >({});
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsError, setActionsError] = useState("");
  const [copiedProblemId, setCopiedProblemId] = useState<string | null>(null);

  const formatTime = (iso: string) => new Date(iso).toLocaleString();

  async function handleGenerateMemo() {
    setMemoError("");
    setCopied(false);

    if (!run || run.status !== "completed") {
      setMemoError("Memo can only be generated for a completed run.");
      return;
    }

    setLoadingMemo(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setMemoError("You must be logged in to generate a memo.");
        return;
      }

      // ✅ If memo exists → regenerate
      // ✅ If no memo → generate normally
      const force = !!memo;

      const res = await fetch(
        `/api/runs/${runId}/generate-memo${force ? "?force=true" : ""}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const json = await res.json();

      if (!res.ok) {
        setMemoError(json.error || "Failed to generate memo.");
        return;
      }

      setMemo(json.memo || "");

      // Optional: if your API returns memoSavedAt, you can set it here.
      // Otherwise it will update on refresh / next load.
      if (json.memoSavedAt) setMemoSavedAt(json.memoSavedAt);
    } catch {
      setMemoError("Failed to generate memo.");
    } finally {
      setLoadingMemo(false);
    }
  }

  const loadProblemActions = useCallback(
    async (force = false) => {
      setActionsError("");
      setLoadingActions(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          setActionsError("You must be logged in to load actions.");
          return;
        }

        const res = await fetch(
          `/api/runs/${runId}/actions${force ? "?force=true" : ""}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const json = await res.json();

        if (!res.ok) {
          setActionsError(json.error || "Failed to load actions.");
          return;
        }

        const rows = (json.actions ?? []) as ProblemActionRow[];
        const map: Record<string, ProblemActionRow> = {};
        for (const a of rows) map[a.problem_id] = a;

        setActionsByProblemId(map);
      } catch {
        setActionsError("Failed to load actions.");
      } finally {
        setLoadingActions(false);
      }
    },
    [runId],
  );

  async function handleCopyMemo() {
    try {
      await navigator.clipboard.writeText(memo);
      setCopied(true);
      setToast("Memo copied to clipboard.");
      setTimeout(() => setCopied(false), 1200);
      setTimeout(() => setToast(""), 1600);
    } catch {
      setToast("Copy failed.");
      setTimeout(() => setToast(""), 1600);
    }
  }

  async function handleSaveLabel() {
    setSavingLabel(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setToast("You must be logged in.");
        setTimeout(() => setToast(""), 1600);
        return;
      }

      const res = await fetch(`/api/runs/${runId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          label: labelDraft.trim().slice(0, 60) || null,
        }),
      });

      if (!res.ok) {
        setToast("Failed to save label.");
        setTimeout(() => setToast(""), 1600);
        return;
      }

      setToast("Label saved.");
      setTimeout(() => setToast(""), 1400);

      // Keep UI consistent even if backend trims/normalizes
      setRun((prev) =>
        prev ? { ...prev, label: labelDraft.trim() || null } : prev,
      );
    } finally {
      setSavingLabel(false);
    }
  }
  function buildJiraTaskText(problem: RunProblem, action: ProblemActionRow) {
    return [
      `Title: ${problem.title}`,
      "",
      "Suggested Action:",
      action.suggested_action || "—",
      "",
      "First Check:",
      action.first_check || "—",
      "",
      "Owner:",
      action.owner_guess || "—",
      "",
      "Expected Impact:",
      action.expected_impact || "—",
    ].join("\n");
  }

  async function handleCopyJiraTask(problem: RunProblem) {
    const action = actionsByProblemId[problem.id];
    if (!action) return;

    try {
      const text = buildJiraTaskText(problem, action);
      await navigator.clipboard.writeText(text);

      setCopiedProblemId(problem.id);

      setTimeout(() => {
        setCopiedProblemId(null);
      }, 1200);
    } catch {
      setToast("Copy failed.");
      setTimeout(() => setToast(""), 1600);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg("");
      setProblems([]);
      setFeatures([]);
      setDeltaRow(null);

      // reset memo state on route change
      setMemo("");
      setMemoSavedAt(null);
      setMemoError("");
      setCopied(false);

      // Auth gate
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      // Fetch run
      const { data: r, error: runErr } = await supabase
        .from("runs")
        .select(
          "id, project_id, user_id, scope, upload_id, source_filter, entry_count, status, created_at, label",
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

      const runRecord = r as RunRecord;
      setRun(runRecord);
      setLabelDraft(runRecord.label ?? "");

      // Upload info
      if (runRecord.scope === "upload" && runRecord.upload_id) {
        const { data: u } = await supabase
          .from("uploads")
          .select("id, source, created_at")
          .eq("id", runRecord.upload_id)
          .maybeSingle();

        if (u) setUpload(u as UploadInfo);
      } else {
        setUpload(null);
      }

      if (runRecord.status === "completed") {
        // Problems
        setLoadingProblems(true);
        const { data: p, error: pErr } = await supabase
          .from("run_problems")
          .select(
            "id, run_id, rank, title, summary, mention_count, sources, quotes, created_at",
          )
          .eq("run_id", runId)
          .order("rank", { ascending: true });

        if (pErr) {
          setErrorMsg("Run loaded, but failed to load problems.");
          setLoadingProblems(false);
          setLoading(false);
          return;
        }

        setProblems((p ?? []) as RunProblem[]);
        setLoadingProblems(false);
        await loadProblemActions(false);

        // Features
        setLoadingFeatures(true);
        const { data: f, error: fErr } = await supabase
          .from("run_features")
          .select(
            "id, run_id, feature, mention_count, dominant_problem, created_at",
          )
          .eq("run_id", runId)
          .order("mention_count", { ascending: false });

        if (fErr) {
          setFeatures([]);
        } else {
          setFeatures((f ?? []) as RunFeature[]);
        }
        setLoadingFeatures(false);

        // Deltas (✅ include previous_run_id for link)
        setLoadingDeltas(true);
        const { data: d, error: dErr } = await supabase
          .from("run_deltas")
          .select(
            "new_problems, worsening, improving, resolved, previous_run_id",
          )
          .eq("current_run_id", runId)
          .maybeSingle();

        if (dErr) {
          setDeltaRow(null);
        } else {
          setDeltaRow((d as RunDeltaDbRow) ?? null);
        }
        setLoadingDeltas(false);

        // Existing memo (✅ include created_at for “Memo saved at”)
        const { data: m } = await supabase
          .from("run_memos")
          .select("content, created_at")
          .eq("run_id", runId)
          .maybeSingle();

        const memoRow = (m as RunMemoRow | null) ?? null;
        if (memoRow?.content) {
          setMemo(memoRow.content);
          setMemoSavedAt(memoRow.created_at);
        }
      }

      setLoading(false);
    }

    load();
  }, [projectId, runId, router, loadProblemActions]);

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

      {/* ✅ Day 9 Step 4: toast */}
      {toast && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #eee",
            background: "#fafafa",
            fontSize: 14,
            color: "#111",
          }}
        >
          {toast}
        </div>
      )}

      {/* ✅ Day 9 Step 5: run naming */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="Add a label (e.g., January Feedback)"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
        <button
          disabled={savingLabel}
          onClick={handleSaveLabel}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: savingLabel ? "not-allowed" : "pointer",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {savingLabel ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Snapshot Metadata */}
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
          This run is a saved snapshot. Insights are generated and stored for
          this run.
        </div>
      </section>

      {/* Top 5 Problems */}
      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>Top Problems</div>

          {run.status === "completed" && problems.length > 0 && (
            <button
              onClick={() => loadProblemActions(true)}
              disabled={loadingActions}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: loadingActions ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {loadingActions ? "Regenerating…" : "Regenerate actions"}
            </button>
          )}
        </div>

        {actionsError && (
          <div style={{ marginBottom: 10, color: "crimson", fontSize: 14 }}>
            {actionsError}
          </div>
        )}

        {run.status === "queued" || run.status === "processing" ? (
          <ProcessingNotice onRefresh={() => router.refresh()} />
        ) : run.status === "failed" ? (
          <div style={{ color: "crimson" }}>
            This run failed. Try generating insights again.
          </div>
        ) : loadingProblems ? (
          <div>Loading…</div>
        ) : problems.length === 0 ? (
          <div style={{ color: "#666" }}>
            No problems generated for this run yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {problems.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  #{p.rank} — {p.title}
                </div>

                <div style={{ marginTop: 6, color: "#444", fontSize: 14 }}>
                  Mentioned by <b>{p.mention_count}</b>{" "}
                  {p.mention_count === 1 ? "entry" : "entries"} • Seen in:{" "}
                  {p.sources?.length ? p.sources.join(", ") : "—"}
                </div>

                {p.summary && (
                  <div style={{ marginTop: 8, color: "#333", fontSize: 14 }}>
                    {p.summary}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    Real customer quotes
                  </div>

                  {Array.isArray(p.quotes) && p.quotes.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      {p.quotes.slice(0, 3).map((q, idx) => (
                        <div
                          key={idx}
                          style={{
                            borderLeft: "3px solid #ddd",
                            paddingLeft: 10,
                            color: "#333",
                            fontSize: 14,
                            lineHeight: 1.4,
                          }}
                        >
                          <div style={{ marginBottom: 4 }}>“{q.text}”</div>
                          <div style={{ color: "#666", fontSize: 12 }}>
                            Source: {q.source}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, color: "#666", fontSize: 14 }}>
                      No quotes available.
                    </div>
                  )}
                  {actionsByProblemId[p.id] && (
                    <div
                      style={{
                        marginTop: 12,
                        border: "1px solid #eee",
                        borderRadius: 12,
                        padding: 12,
                        background: "#fff",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            color: "#666",
                            fontSize: 12,
                            marginBottom: 8,
                          }}
                        >
                          Decision Assistant
                        </div>
                        <button
                          onClick={() => handleCopyJiraTask(p)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {copiedProblemId === p.id
                            ? "Copied!"
                            : "Copy as Jira task"}
                        </button>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            color: "#666",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          Suggested Action
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                          }}
                        >
                          {actionsByProblemId[p.id].suggested_action || "—"}
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            color: "#666",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          First Check
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                          }}
                        >
                          {actionsByProblemId[p.id].first_check || "—"}
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            color: "#666",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          Suggested Owner
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {actionsByProblemId[p.id].owner_guess || "—"}
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            color: "#666",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          Expected Impact
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                          }}
                        >
                          {actionsByProblemId[p.id].expected_impact || "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Feature-Level Pain Map */}
      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Feature-Level Pain Map
        </div>

        <div style={{ color: "#666", fontSize: 13, marginBottom: 12 }}>
          Counts are feature mentions. One entry can mention multiple features.
        </div>

        {run.status === "queued" || run.status === "processing" ? (
          <ProcessingNotice onRefresh={() => router.refresh()} />
        ) : run.status === "failed" ? (
          <div style={{ color: "crimson" }}>
            This run failed. Try generating insights again.
          </div>
        ) : loadingFeatures ? (
          <div>Loading…</div>
        ) : features.length === 0 ? (
          <div style={{ color: "#666" }}>No feature mentions found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 13,
                      padding: "8px 6px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Feature
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 13,
                      padding: "8px 6px",
                      borderBottom: "1px solid #eee",
                      width: 90,
                    }}
                  >
                    Mentions
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 13,
                      padding: "8px 6px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Dominant Issue
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f.id}>
                    <td
                      style={{
                        padding: "10px 6px",
                        borderBottom: "1px solid #f2f2f2",
                      }}
                    >
                      {f.feature}
                    </td>
                    <td
                      style={{
                        padding: "10px 6px",
                        borderBottom: "1px solid #f2f2f2",
                      }}
                    >
                      {f.mention_count}
                    </td>
                    <td
                      style={{
                        padding: "10px 6px",
                        borderBottom: "1px solid #f2f2f2",
                        color: "#444",
                      }}
                    >
                      {f.dominant_problem ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* What changed since last run */}
      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          What changed since last run
        </div>

        {/* ✅ Day 9 Step 2: previous run link */}
        {deltaRow?.previous_run_id && (
          <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
            Compared to:{" "}
            <Link
              href={`/project/${projectId}/runs/${deltaRow.previous_run_id}`}
              style={{ textDecoration: "none" }}
            >
              previous run →
            </Link>
          </div>
        )}

        {run.status === "queued" || run.status === "processing" ? (
          <ProcessingNotice onRefresh={() => router.refresh()} />
        ) : run.status === "failed" ? (
          <div style={{ color: "crimson" }}>
            This run failed. Try generating insights again.
          </div>
        ) : loadingDeltas ? (
          <div>Loading…</div>
        ) : !deltaRow ? (
          <div style={{ color: "#666" }}>No previous run to compare yet.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
            }}
          >
            <DeltaList
              title="🆕 New problems"
              items={deltaRow.new_problems}
              kind="new"
            />
            <DeltaList
              title="📈 Getting worse"
              items={deltaRow.worsening}
              kind="change"
            />
            <DeltaList
              title="📉 Improving"
              items={deltaRow.improving}
              kind="change"
            />
            <DeltaList
              title="✅ Resolved"
              items={deltaRow.resolved}
              kind="resolved"
            />
          </div>
        )}
      </section>

      {/* Executive Decision Memo */}
      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 10 }}>
          Executive Decision Memo
        </div>

        <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
          One-page memo you can paste into Slack. Plain English. No fluff.
        </div>

        {/* ✅ Day 9 Step 4: memo saved timestamp */}
        {memoSavedAt && (
          <div style={{ color: "#666", fontSize: 13, marginBottom: 14 }}>
            Memo saved at: {formatTime(memoSavedAt)}
          </div>
        )}

        {run.status !== "completed" ? (
          <div style={{ color: "#666", fontSize: 14 }}>
            Memo is available after the run is completed.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={handleGenerateMemo}
              disabled={loadingMemo}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: loadingMemo ? "#f3f3f3" : "#fff",
                cursor: loadingMemo ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {loadingMemo
                ? "Generating…"
                : memo
                  ? "Regenerate Memo"
                  : "Generate Memo"}
            </button>

            {memo && (
              <button
                onClick={handleCopyMemo}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
          </div>
        )}

        {memoError && (
          <div style={{ marginTop: 10, color: "crimson", fontSize: 14 }}>
            {memoError}
          </div>
        )}

        {memo && <MemoRenderer memo={memo} />}
      </section>
    </div>
  );
}
