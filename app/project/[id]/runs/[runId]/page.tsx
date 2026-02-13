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

  // ✅ Day 6: Feature-level pain map state
  const [features, setFeatures] = useState<RunFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  // ✅ Day 7: Run deltas state
  const [deltaRow, setDeltaRow] = useState<RunDeltaRow | null>(null);
  const [loadingDeltas, setLoadingDeltas] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  const formatTime = (iso: string) => new Date(iso).toLocaleString();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg("");
      setProblems([]);
      setFeatures([]);
      setDeltaRow(null);

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
      } else {
        setUpload(null);
      }

      // Fetch Problems + Features + Deltas only when completed
      if (r.status === "completed") {
        // ✅ Top Problems
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

        // ✅ Day 6: Feature-Level Pain Map
        setLoadingFeatures(true);
        const { data: f, error: fErr } = await supabase
          .from("run_features")
          .select(
            "id, run_id, feature, mention_count, dominant_problem, created_at",
          )
          .eq("run_id", runId)
          .order("mention_count", { ascending: false });

        if (fErr) {
          // Don't fail whole page — just show empty features section
          setFeatures([]);
        } else {
          setFeatures((f ?? []) as RunFeature[]);
        }
        setLoadingFeatures(false);

        // ✅ Day 7: What changed since last run
        setLoadingDeltas(true);
        const { data: d, error: dErr } = await supabase
          .from("run_deltas")
          .select("new_problems, worsening, improving, resolved")
          .eq("current_run_id", runId)
          .maybeSingle();

        if (dErr) {
          // Don't fail whole page — calm empty state instead
          setDeltaRow(null);
        } else {
          setDeltaRow((d as RunDeltaRow) ?? null);
        }
        setLoadingDeltas(false);
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
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Top Problems</div>

        {run.status === "queued" || run.status === "processing" ? (
          <div style={{ color: "#666" }}>
            This run is processing. Refresh in a moment.
          </div>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ✅ Day 6: Feature-Level Pain Map */}
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
          <div style={{ color: "#666" }}>
            This run is processing. Refresh in a moment.
          </div>
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

      {/* ✅ Day 7: What changed since last run */}
      <section
        style={{
          marginTop: 20,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          What changed since last run
        </div>

        {run.status === "queued" || run.status === "processing" ? (
          <div style={{ color: "#666" }}>
            This run is processing. Refresh in a moment.
          </div>
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
    </div>
  );
}
