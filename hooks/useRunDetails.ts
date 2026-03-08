"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

import {
  RunRecord,
  UploadInfo,
  RunProblem,
  RunFeature,
  RunDeltaDbRow,
  ProblemActionRow,
  RunMemoRow,
} from "@/components/app/runs/types";

export function useRunDetails(runId: string) {
  const [loading, setLoading] = useState(true);

  const [run, setRun] = useState<RunRecord | null>(null);
  const [upload, setUpload] = useState<UploadInfo | null>(null);

  const [problems, setProblems] = useState<RunProblem[]>([]);
  const [features, setFeatures] = useState<RunFeature[]>([]);
  const [deltaRow, setDeltaRow] = useState<RunDeltaDbRow | null>(null);

  const [memo, setMemo] = useState("");
  const [memoSavedAt, setMemoSavedAt] = useState<string | null>(null);

  const [loadingProblems, setLoadingProblems] = useState(false);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [loadingDeltas, setLoadingDeltas] = useState(false);

  const [loadingMemo, setLoadingMemo] = useState(false);
  const [memoError, setMemoError] = useState("");

  const [actionsByProblemId, setActionsByProblemId] = useState<
    Record<string, ProblemActionRow>
  >({});

  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsError, setActionsError] = useState("");

  const loadProblemActions = useCallback(
    async (force = false) => {
      setLoadingActions(true);
      setActionsError("");

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) return;

        const res = await fetch(
          `/api/runs/${runId}/actions${force ? "?force=true" : ""}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const json = await res.json();

        if (!res.ok) {
          setActionsError(json.error || "Failed to load actions.");
          return;
        }

        const rows = json.actions ?? [];

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

  async function generateMemo(existingMemo: string) {
    setMemoError("");
    setLoadingMemo(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) return;

      const force = !!existingMemo;

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

      if (json.memoSavedAt) setMemoSavedAt(json.memoSavedAt);
    } finally {
      setLoadingMemo(false);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: r } = await supabase
        .from("runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();

      if (!r) return;

      const runRecord = r as RunRecord;
      setRun(runRecord);

      if (runRecord.scope === "upload" && runRecord.upload_id) {
        const { data: u } = await supabase
          .from("uploads")
          .select("id, source, created_at")
          .eq("id", runRecord.upload_id)
          .maybeSingle();

        if (u) setUpload(u as UploadInfo);
      }

      setLoadingProblems(true);

      const { data: p } = await supabase
        .from("run_problems")
        .select("*")
        .eq("run_id", runId)
        .order("rank", { ascending: true });

      setProblems((p ?? []) as RunProblem[]);
      setLoadingProblems(false);

      await loadProblemActions(false);

      setLoadingFeatures(true);

      const { data: f } = await supabase
        .from("run_features")
        .select("*")
        .eq("run_id", runId)
        .order("mention_count", { ascending: false });

      setFeatures((f ?? []) as RunFeature[]);
      setLoadingFeatures(false);

      setLoadingDeltas(true);

      const { data: d } = await supabase
        .from("run_deltas")
        .select("*")
        .eq("current_run_id", runId)
        .maybeSingle();

      setDeltaRow((d as RunDeltaDbRow) ?? null);
      setLoadingDeltas(false);

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

      setLoading(false);
    }

    load();
  }, [runId, loadProblemActions]);

  return {
    loading,
    run,
    upload,
    problems,
    features,
    deltaRow,
    memo,
    memoSavedAt,

    loadingProblems,
    loadingFeatures,
    loadingDeltas,
    loadingMemo,

    memoError,

    actionsByProblemId,
    loadingActions,
    actionsError,

    loadProblemActions,
    generateMemo,
  };
}
