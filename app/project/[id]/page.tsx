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

            {/* 👇 Step 1: View Feedback Doorway */}
            <div style={{ marginTop: 16 }}>
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
            </div>
          </>
        ) : (
          <div>No uploads yet.</div>
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
                let result;

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
