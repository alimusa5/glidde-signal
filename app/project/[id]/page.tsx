"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import useEntitlements from "@/hooks/useEntitlements";

import ProjectStats from "@/components/app/project/ProjectStats";
import Topbar from "@/components/app/Topbar";

import LatestUploadCard from "@/components/app/project/LatestUploadCard";
import RunHistorySection from "@/components/app/project/RunHistorySection";
import UploadSection from "@/components/app/project/UploadSection";

import type {
  LatestUploadSummary,
  MemoMetaByRunId,
  RunCreateError,
  RunCreateSuccess,
  RunHistoryItem,
  RunMemoMeta,
  UpgradePayload,
  UploadResult,
} from "@/components/app/project/types";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { entitlements } = useEntitlements();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  const [email, setEmail] = useState<string | null>(null);

  const [source, setSource] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [latest, setLatest] = useState<LatestUploadSummary | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [runError, setRunError] = useState("");

  const [runUpgrade, setRunUpgrade] = useState<UpgradePayload | null>(null);

  const runBlocked = useMemo(() => runUpgrade !== null, [runUpgrade]);

  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [memoMeta, setMemoMeta] = useState<MemoMetaByRunId>({});

  const historyLimit = entitlements?.isPro ? 50 : 5;

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Not authenticated. Please log in again.");
    }

    return data.session.access_token;
  }

  const loadLatestUploadSummary = useCallback(async (projectId: string) => {
    setLoadingLatest(true);

    try {
      const { data: uploadRow } = await supabase
        .from("uploads")
        .select("id, source, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!uploadRow) {
        setLatest(null);
        return;
      }

      const { count } = await supabase
        .from("feedback_entries")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", uploadRow.id);

      setLatest({
        uploadId: uploadRow.id,
        source: uploadRow.source,
        createdAt: uploadRow.created_at,
        count: count ?? 0,
      });
    } finally {
      setLoadingLatest(false);
    }
  }, []);

  const loadRunHistory = useCallback(
    async (projectId: string) => {
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
          .limit(historyLimit);

        const runsList = (runRows ?? []) as RunHistoryItem[];
        setRuns(runsList);

        const runIds = runsList.map((run) => run.id);

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

        const memoMap: MemoMetaByRunId = {};

        ((memoRows ?? []) as RunMemoMeta[]).forEach((memo) => {
          memoMap[memo.run_id] = { created_at: memo.created_at };
        });

        setMemoMeta(memoMap);
      } finally {
        setLoadingRuns(false);
      }
    },
    [historyLimit],
  );

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

    if (!res.ok) {
      throw new Error(data?.error ?? "CSV upload failed");
    }

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

    if (!res.ok) {
      throw new Error(data?.error ?? "Text upload failed");
    }

    return data as UploadResult;
  }

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

    if (!res.ok) {
      return { ok: false, status: res.status, data };
    }

    return { ok: true, data: data as RunCreateSuccess };
  }

  async function handleGenerateInsights() {
    setRunMsg("");
    setRunError("");
    setRunUpgrade(null);

    if (!latest) {
      setRunError("No uploads yet.");
      return;
    }

    setIsCreatingRun(true);

    try {
      const result = await createRun(id);

      if (!result.ok) {
        if (result.status === 402 && result.data?.upgrade) {
          setRunUpgrade(result.data.upgrade);
          setRunError(result.data.error ?? "Upgrade required.");
          return;
        }

        setRunError(result.data?.error ?? "Unable to create run.");
        return;
      }

      const { runId } = result.data;

      await loadRunHistory(id);

      router.push(`/project/${id}/runs/${runId}`);
    } finally {
      setIsCreatingRun(false);
    }
  }

  async function handleUpload() {
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

      setResultMsg(`Entries ingested: ${result.count} — Ready to analyze.`);

      await loadLatestUploadSummary(id);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace("/login");
        return;
      }

      setEmail(userData.user.email ?? null);

      const { data: projectData } = await supabase
        .from("projects")
        .select("name")
        .eq("id", id)
        .single();

      if (!projectData) {
        router.replace("/dashboard");
        return;
      }

      setName(projectData.name);
      setLoading(false);

      await loadLatestUploadSummary(id);
      await loadRunHistory(id);
    }

    load();
  }, [id, router, loadLatestUploadSummary, loadRunHistory]);

  if (loading) {
    return <div className="p-8">Loading project...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={email} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold">{name}</h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Upload customer feedback and generate AI-powered insights.
          </p>

          <ProjectStats entitlements={entitlements} latest={latest} />
        </div>

        <LatestUploadCard
          projectId={id}
          loadingLatest={loadingLatest}
          latest={latest}
          runEntitlements={entitlements}
          isCreatingRun={isCreatingRun}
          runBlocked={runBlocked}
          runUpgrade={runUpgrade}
          runError={runError}
          runMsg={runMsg}
          onGenerateInsights={handleGenerateInsights}
          onUpgradeClick={() => router.push("/billing")}
          onDismissUpgrade={() => {
            setRunUpgrade(null);
            setRunError("");
          }}
        />

        <RunHistorySection
          projectId={id}
          runs={runs}
          memoMeta={memoMeta}
          loadingRuns={loadingRuns}
          historyLimit={historyLimit}
        />

        <UploadSection
          source={source}
          setSource={setSource}
          csvFile={csvFile}
          setCsvFile={setCsvFile}
          rawText={rawText}
          setRawText={setRawText}
          isUploading={isUploading}
          errorMsg={errorMsg}
          resultMsg={resultMsg}
          onUpload={handleUpload}
        />
      </div>
    </div>
  );
}
