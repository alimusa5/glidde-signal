"use client";

/**
 * - Loads a single project (auth-gated)
 * - Upload feedback via CSV OR pasted text
 * - Calls API routes with Authorization: Bearer <access_token>
 * - Shows confirmation: "Entries ingested: X — Ready to analyze."
 * - Shows "Latest Upload Summary" (persisted via DB query)
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UploadResult = { uploadId: string; count: number };

type LatestUploadSummary = {
  uploadId: string;
  source: string;
  createdAt: string; // ISO string
  count: number;
};

export default function ProjectPage() {
  const router = useRouter();

  // Read project ID from the route: /project/[id]
  const params = useParams<{ id: string }>();
  const id = params.id;

  // -------------------------------
  // Project loading state
  // -------------------------------
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  // -------------------------------
  // Upload UI state
  // -------------------------------
  const [source, setSource] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");

  const [isUploading, setIsUploading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // -------------------------------
  // Latest upload summary
  // -------------------------------
  const [latest, setLatest] = useState<LatestUploadSummary | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  // -------------------------------
  // Auth helper: get access token
  // -------------------------------
  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Not authenticated. Please log in again.");

    const token = data.session?.access_token;
    if (!token) throw new Error("Not authenticated. Please log in again.");

    return token;
  }

  // -------------------------------
  // helper: load latest upload summary from DB
  // -------------------------------
  async function loadLatestUploadSummary(projectId: string) {
    setLoadingLatest(true);

    try {
      // 1) Get latest upload for this project
      const { data: u, error: uErr } = await supabase
        .from("uploads")
        .select("id, source, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (uErr) {
        // Not fatal; just don't show summary
        setLatest(null);
        return;
      }

      if (!u) {
        // No uploads yet
        setLatest(null);
        return;
      }

      // 2) Count entries for that upload (head:true avoids downloading rows)
      const { count, error: cErr } = await supabase
        .from("feedback_entries")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", u.id);

      if (cErr) {
        setLatest(null);
        return;
      }

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

  // -------------------------------
  // API helpers (send Authorization header)
  // -------------------------------
  async function uploadCsv(
    projectId: string,
    src: string,
    file: File,
  ): Promise<UploadResult> {
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

  async function uploadText(
    projectId: string,
    src: string,
    text: string,
  ): Promise<UploadResult> {
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

  // -------------------------------
  // Load project + enforce auth
  // -------------------------------
  useEffect(() => {
    async function load() {
      // Check if user is logged in
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      // Fetch project name
      const { data, error } = await supabase
        .from("projects")
        .select("name")
        .eq("id", id)
        .single();

      if (error || !data) {
        router.replace("/dashboard");
        return;
      }

      setName(data.name);
      setLoading(false);

      // load latest upload summary on page load
      await loadLatestUploadSummary(id);
    }

    load();
  }, [id, router]);

  if (loading) return <div style={{ padding: 24 }}>Loading project...</div>;

  const formatTime = (iso: string) => {
    // browser-local display
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>{name}</h1>

      {/*Latest Upload Summary */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 600 }}>Latest upload summary</div>

        {loadingLatest ? (
          <div>Loading latest upload…</div>
        ) : latest ? (
          <>
            <div>Source: {latest.source}</div>
            <div>Entries ingested: {latest.count}</div>
            <div>Time uploaded: {formatTime(latest.createdAt)}</div>
            <div>Status: Ready to analyze</div>
          </>
        ) : (
          <div>No uploads yet.</div>
        )}
      </div>

      {/* Upload section */}
      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 24,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 24 }}>Upload customer feedback</h2>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label>
            Source:&nbsp;
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select source</option>
              <option value="reviews">Reviews</option>
              <option value="support">Support</option>
              <option value="surveys">Surveys</option>
            </select>
          </label>

          <label>
            CSV:&nbsp;
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div>
          <div>Or paste text:</div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={7}
            style={{ width: "100%", marginTop: 6 }}
            placeholder="Paste feedback here..."
          />
        </div>

        <div>
          <button
            disabled={isUploading}
            style={{ width: 180 }}
            onClick={async () => {
              setResultMsg("");
              setErrorMsg("");

              // Validation: source is required
              if (!source) {
                setErrorMsg("Please select a Source.");
                return;
              }

              const hasCsv = !!csvFile;
              const hasText = rawText.trim().length > 0;

              if (!hasCsv && !hasText) {
                setErrorMsg("Please upload a CSV or paste text.");
                return;
              }

              if (hasCsv && hasText) {
                setErrorMsg("Please use either CSV or pasted text (not both).");
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

                // refresh latest upload summary after successful upload
                await loadLatestUploadSummary(id);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Upload failed";
                setErrorMsg(msg);
              } finally {
                setIsUploading(false);
              }
            }}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {errorMsg && <div style={{ color: "crimson" }}>{errorMsg}</div>}
        {resultMsg && <div>{resultMsg}</div>}
      </div>
    </div>
  );
}
