"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Upload = {
  id: string;
  source: string;
  created_at: string;
};

type FeedbackEntry = {
  id: string;
  content: string;
  created_at: string;
  source: string;
};

type SourceFilter = "all" | "reviews" | "support" | "surveys";

const PAGE_SIZE = 10;
const ALL_UPLOADS = "ALL_UPLOADS";

function isSourceFilter(value: string): value is SourceFilter {
  return (
    value === "all" ||
    value === "reviews" ||
    value === "support" ||
    value === "surveys"
  );
}

// ✅ UI-only (display) normalization + dedupe for All Uploads mode
function normalizeForDisplay(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeForDisplay(list: FeedbackEntry[]) {
  const seen = new Set<string>();
  const out: FeedbackEntry[] = [];

  for (const item of list) {
    const key = normalizeForDisplay(item.content);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export default function FeedbackPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  // Uploads
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<string>("");

  // Filters
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // Entries + pagination
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const selectedUpload = useMemo(() => {
    return uploads.find((u) => u.id === selectedUploadId) ?? null;
  }, [uploads, selectedUploadId]);

  // ✅ What we actually show (dedupe only when viewing ALL uploads)
  const displayEntries = useMemo(() => {
    if (selectedUploadId === ALL_UPLOADS) return dedupeForDisplay(entries);
    return entries;
  }, [entries, selectedUploadId]);

  // ----------------------------
  // Auth guard + load uploads list (latest first)
  // ----------------------------
  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      setUploadsLoading(true);

      const { data: uploadRows, error } = await supabase
        .from("uploads")
        .select("id, source, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        setUploads([]);
        setSelectedUploadId("");
        setUploadsLoading(false);
        return;
      }

      const list = (uploadRows ?? []) as Upload[];
      setUploads(list);

      // Default = latest upload if exists, else empty
      setSelectedUploadId(list.length > 0 ? list[0].id : "");

      setUploadsLoading(false);
    }

    init();
  }, [projectId, router]);

  // ----------------------------
  // Load first page when:
  // - upload changes
  // - source filter changes
  // ----------------------------
  useEffect(() => {
    async function loadFirstPage() {
      if (!selectedUploadId) {
        setEntries([]);
        setTotalCount(null);
        setEntriesLoading(false);
        setHasMore(false);
        setPage(0);
        return;
      }

      setEntriesLoading(true);
      setPage(0);
      setHasMore(true);

      // ✅ Count (context only)
      let countQ = supabase
        .from("feedback_entries")
        .select("id", { count: "exact", head: true });

      if (selectedUploadId === ALL_UPLOADS) {
        countQ = countQ.eq("project_id", projectId);
      } else {
        countQ = countQ.eq("upload_id", selectedUploadId);
      }

      if (sourceFilter !== "all") {
        countQ = countQ.eq("source", sourceFilter);
      }

      const { count: cCount, error: cErr } = await countQ;
      if (cErr) {
        setTotalCount(null);
      } else {
        setTotalCount(cCount ?? 0);
      }

      // ✅ Fetch first page
      let q = supabase
        .from("feedback_entries")
        .select("id, content, created_at, source")
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (selectedUploadId === ALL_UPLOADS) {
        q = q.eq("project_id", projectId);
      } else {
        q = q.eq("upload_id", selectedUploadId);
      }

      if (sourceFilter !== "all") {
        q = q.eq("source", sourceFilter);
      }

      const { data, error } = await q;

      if (error) {
        setEntries([]);
        setHasMore(false);
        setEntriesLoading(false);
        return;
      }

      const rows = (data ?? []) as FeedbackEntry[];
      setEntries(rows);

      // ✅ hasMore based on count (most reliable)
      setHasMore((cCount ?? 0) > rows.length);

      setEntriesLoading(false);
    }

    loadFirstPage();
  }, [selectedUploadId, sourceFilter, projectId]);

  // ----------------------------
  // Load more (pagination)
  // ----------------------------
  async function loadMore() {
    if (!selectedUploadId) return;

    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setEntriesLoading(true);

    let q = supabase
      .from("feedback_entries")
      .select("id, content, created_at, source")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (selectedUploadId === ALL_UPLOADS) {
      q = q.eq("project_id", projectId);
    } else {
      q = q.eq("upload_id", selectedUploadId);
    }

    if (sourceFilter !== "all") {
      q = q.eq("source", sourceFilter);
    }

    const { data, error } = await q;

    if (error) {
      setEntriesLoading(false);
      setHasMore(false);
      return;
    }

    const rows = (data ?? []) as FeedbackEntry[];

    setEntries((prev) => {
      const next = [...prev, ...rows];

      // ✅ hasMore based on count if available
      if (totalCount !== null) {
        setHasMore(next.length < totalCount);
      } else {
        // fallback
        if (rows.length < PAGE_SIZE) setHasMore(false);
      }

      return next;
    });

    setPage(nextPage);
    setEntriesLoading(false);
  }

  // ----------------------------
  // UI helpers
  // ----------------------------
  const prettySource = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const sourceLabel =
    sourceFilter === "all" ? "All sources" : prettySource(sourceFilter);

  const batchLabel =
    selectedUploadId === ALL_UPLOADS
      ? "All uploads (project)"
      : "Single upload";

  const scopeLabel =
    selectedUploadId === ALL_UPLOADS ? "Project-wide" : "This upload only";

  // ----------------------------
  // Styles (calm, not dashboard)
  // ----------------------------
  const containerStyle: React.CSSProperties = {
    padding: 40,
    maxWidth: 860,
    margin: "0 auto",
    lineHeight: 1.5,
  };

  const cardStyle: React.CSSProperties = {
    marginTop: 18,
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 18,
    background: "#fff",
  };

  const subtleText: React.CSSProperties = {
    fontSize: 13,
    color: "#666",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#333",
    fontWeight: 600,
    marginBottom: 6,
  };

  const selectStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d0d0d0",
    background: "#fff",
    minWidth: 240,
  };

  const pillButtonStyle: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid #d0d0d0",
    background: "#fff",
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>
      <Link href={`/project/${projectId}`} style={{ textDecoration: "none" }}>
        ← Back to Project
      </Link>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Feedback</div>
        <div style={subtleText}>
          Inspect what was uploaded — clean, readable, and trustworthy.
        </div>
      </div>

      {/* Empty state: no uploads */}
      {!uploadsLoading && uploads.length === 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            No feedback uploaded yet.
          </div>
          <div style={{ marginTop: 6, color: "#444" }}>
            Upload feedback to begin analysis.
          </div>
        </div>
      )}

      {/* Header card */}
      {uploads.length > 0 && (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                Feedback from: {sourceLabel}
              </div>

              <div style={subtleText}>Batch: {batchLabel}</div>
              <div style={subtleText}>Scope: {scopeLabel}</div>

              <div style={subtleText}>
                Entries: {totalCount === null ? "—" : totalCount}
                {selectedUploadId === ALL_UPLOADS ? " (incl. repeats)" : ""}
              </div>

              <div style={subtleText}>
                Uploaded:{" "}
                {selectedUploadId === ALL_UPLOADS
                  ? "—"
                  : selectedUpload
                    ? formatTime(selectedUpload.created_at)
                    : "—"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={labelStyle}>Source</div>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isSourceFilter(value)) setSourceFilter(value);
                  }}
                  style={selectStyle}
                >
                  <option value="all">All</option>
                  <option value="reviews">Reviews</option>
                  <option value="support">Support</option>
                  <option value="surveys">Surveys</option>
                </select>
              </div>

              <div>
                <div style={labelStyle}>Upload batch</div>
                <select
                  value={selectedUploadId}
                  onChange={(e) => setSelectedUploadId(e.target.value)}
                  style={selectStyle}
                >
                  <option value={ALL_UPLOADS}>All uploads (project)</option>

                  {uploads.map((u, idx) => (
                    <option key={u.id} value={u.id}>
                      {idx === 0 ? "Latest" : `Previous (${idx})`} —{" "}
                      {prettySource(u.source)} — {formatTime(u.created_at)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entries */}
      {uploads.length > 0 && (
        <div style={cardStyle}>
          {entriesLoading ? (
            <div>Loading entries…</div>
          ) : displayEntries.length === 0 ? (
            <div>
              <div style={{ fontWeight: 700 }}>
                No feedback matches your filters.
              </div>
              <div style={{ marginTop: 6, color: "#444" }}>
                Try selecting a different source or upload batch.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 10, ...subtleText }}>
                Showing clean, normalized entries. (Read-only)
                {selectedUploadId === ALL_UPLOADS ? " (duplicates hidden)" : ""}
              </div>

              <div style={{ borderTop: "1px solid #eee" }}>
                {displayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      padding: "12px 0",
                      borderBottom: "1px solid #eee",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    • {entry.content}
                  </div>
                ))}
              </div>

              {hasMore && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={loadMore}
                    style={pillButtonStyle}
                    disabled={entriesLoading}
                  >
                    {entriesLoading ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
