"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Topbar from "@/components/app/Topbar";

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

  const [email, setEmail] = useState<string | null>(null);

  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<string>("");

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const selectedUpload = useMemo(() => {
    return uploads.find((u) => u.id === selectedUploadId) ?? null;
  }, [uploads, selectedUploadId]);

  const displayEntries = useMemo(() => {
    if (selectedUploadId === ALL_UPLOADS) return dedupeForDisplay(entries);
    return entries;
  }, [entries, selectedUploadId]);

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      setEmail(userData.user.email ?? null);

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
      setSelectedUploadId(list.length > 0 ? list[0].id : "");

      setUploadsLoading(false);
    }

    init();
  }, [projectId, router]);

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

      const { count: cCount } = await countQ;

      setTotalCount(cCount ?? 0);

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

      const { data } = await q;

      const rows = (data ?? []) as FeedbackEntry[];

      setEntries(rows);
      setHasMore((cCount ?? 0) > rows.length);

      setEntriesLoading(false);
    }

    loadFirstPage();
  }, [selectedUploadId, sourceFilter, projectId]);

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

    const { data } = await q;

    const rows = (data ?? []) as FeedbackEntry[];

    setEntries((prev) => {
      const next = [...prev, ...rows];

      if (totalCount !== null) {
        setHasMore(next.length < totalCount);
      }

      return next;
    });

    setPage(nextPage);
    setEntriesLoading(false);
  }

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={email} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={`/project/${projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Project
        </Link>

        <div className="mt-6 mb-10">
          <h1 className="text-3xl font-semibold">Feedback</h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Inspect uploaded customer feedback in a clean, readable format.
          </p>
        </div>

        {!uploadsLoading && uploads.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="text-lg font-semibold">
              No feedback uploaded yet
            </div>
            <div className="mt-2 text-muted-foreground">
              Upload feedback to begin analysis.
            </div>
          </div>
        )}

        {uploads.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 mb-8">
            <div className="flex flex-wrap justify-between gap-6">
              <div className="space-y-1">
                <div className="font-semibold">
                  Feedback from: {sourceLabel}
                </div>

                <div className="text-sm text-muted-foreground">
                  Batch: {batchLabel}
                </div>

                <div className="text-sm text-muted-foreground">
                  Scope: {scopeLabel}
                </div>

                <div className="text-sm text-muted-foreground">
                  Entries: {totalCount ?? "—"}
                </div>

                <div className="text-sm text-muted-foreground">
                  Uploaded:{" "}
                  {selectedUploadId === ALL_UPLOADS
                    ? "—"
                    : selectedUpload
                      ? formatTime(selectedUpload.created_at)
                      : "—"}
                </div>
              </div>

              <div className="flex gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Source
                  </div>

                  <select
                    value={sourceFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (isSourceFilter(value)) setSourceFilter(value);
                    }}
                    className="rounded-xl border border-border bg-background px-4 py-2"
                  >
                    <option value="all">All</option>
                    <option value="reviews">Reviews</option>
                    <option value="support">Support</option>
                    <option value="surveys">Surveys</option>
                  </select>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Upload batch
                  </div>

                  <select
                    value={selectedUploadId}
                    onChange={(e) => setSelectedUploadId(e.target.value)}
                    className="rounded-xl border border-border bg-background px-4 py-2"
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

        {uploads.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6">
            {entriesLoading ? (
              <div className="text-muted-foreground">Loading entries...</div>
            ) : displayEntries.length === 0 ? (
              <div>
                <div className="font-semibold">
                  No feedback matches your filters.
                </div>

                <div className="mt-2 text-muted-foreground">
                  Try selecting a different source or upload batch.
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground mb-4">
                  Showing normalized entries
                  {selectedUploadId === ALL_UPLOADS && " (duplicates hidden)"}
                </div>

                <div className="border-t border-border">
                  {displayEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-b border-border py-3 whitespace-pre-wrap"
                    >
                      • {entry.content}
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={entriesLoading}
                    className="mt-6 rounded-xl border border-border px-4 py-2 hover:bg-muted"
                  >
                    {entriesLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
