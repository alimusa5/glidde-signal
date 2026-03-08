"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

import { useRunDetails } from "@/hooks/useRunDetails";

import ProblemsSection from "@/components/app/runs/ProblemsSection";
import FeaturesSection from "@/components/app/runs/FeaturesSection";
import DeltaSection from "@/components/app/runs/DeltaSection";
import MemoSection from "@/components/app/runs/MemoSection";
import RunMetadataSection from "@/components/app/runs/RunMetadataSection";
import { formatTime } from "@/components/app/runs/utils";
import { RunProblem } from "@/components/app/runs/types";

import Topbar from "@/components/app/Topbar";
import { ArrowLeft } from "lucide-react";

export default function RunDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string; runId: string }>();

  const projectId = params.id;
  const runId = params.runId;

  const {
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
  } = useRunDetails(runId);

  /* ================= COPY STATES ================= */

  const [copiedAction, setCopiedAction] = useState<{
    problemId: string;
    format: "jira" | "linear" | "slack";
  } | null>(null);

  const [copiedMemo, setCopiedMemo] = useState(false);

  /* ================= RUN LABEL STATES ================= */

  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  /* ================= INIT LABEL ================= */

  useEffect(() => {
    if (run?.label) {
      setLabelDraft(run.label);
    }
  }, [run]);

  /* ================= COPY PROBLEM ================= */

  function copyProblemExport(
    problem: RunProblem,
    format: "jira" | "linear" | "slack",
  ) {
    const actions = actionsByProblemId[problem.id];

    const quotes =
      problem.quotes?.length > 0
        ? problem.quotes
            .slice(0, 2)
            .map((q) => `"${q.text}"`)
            .join("\n")
        : "No quotes available";

    let text = "";

    if (format === "jira") {
      text = `
h3. Problem
${problem.title}

h3. Customer Impact
${problem.mention_count} mentions across ${
        problem.sources?.join(", ") ?? "unknown sources"
      }.

h3. Customer Quotes
${quotes}

h3. Suggested Action
${actions?.suggested_action ?? "—"}

h3. First Check
${actions?.first_check ?? "—"}

h3. Suggested Owner
${actions?.owner_guess ?? "—"}

h3. Expected Impact
${actions?.expected_impact ?? "—"}
`;
    }

    if (format === "linear") {
      text = `
Issue: ${problem.title}

Impact
${problem.mention_count} mentions across ${
        problem.sources?.join(", ") ?? "unknown"
      }.

Customer Quotes
${quotes}

Suggested Action
${actions?.suggested_action ?? "—"}

First Check
${actions?.first_check ?? "—"}

Owner
${actions?.owner_guess ?? "—"}

Expected Impact
${actions?.expected_impact ?? "—"}
`;
    }

    if (format === "slack") {
      text = `
*Problem:* ${problem.title}

*Impact:* ${problem.mention_count} mentions

*Quotes*
${quotes}

*Suggested Action*
${actions?.suggested_action ?? "—"}

*Owner:* ${actions?.owner_guess ?? "—"}
`;
    }

    navigator.clipboard.writeText(text.trim());

    setCopiedAction({
      problemId: problem.id,
      format,
    });

    setTimeout(() => {
      setCopiedAction(null);
    }, 2000);
  }

  /* ================= COPY MEMO ================= */

  function handleCopyMemo() {
    if (!memo) return;

    navigator.clipboard.writeText(memo);

    setCopiedMemo(true);

    setTimeout(() => {
      setCopiedMemo(false);
    }, 2000);
  }

  /* ================= SAVE LABEL ================= */

  async function handleSaveLabel() {
    if (!run) return;

    setSavingLabel(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) return;

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

      if (!res.ok) return;

      // update local state
      run.label = labelDraft.trim() || null;
    } finally {
      setSavingLabel(false);
    }
  }

  /* ================= LOADING ================= */

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading run...
      </div>
    );

  if (!run) return null;

  /* ================= PAGE ================= */

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={null} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* HEADER */}
        <div className="mb-10">
          <Link
            href={`/project/${projectId}`}
            className="group inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:-translate-y-px hover:border-pink-500 hover:bg-pink-500/10 hover:text-pink-600 hover:shadow-md"
          >
            <ArrowLeft
              size={18}
              className="transition-transform duration-200 group-hover:-translate-x-1"
            />
            Back to Project
          </Link>

          {/* Title Row */}
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold">
                {run.label || "Run Details"}
              </h1>

              <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                <span>{run.entry_count} entries analyzed</span>

                <span>•</span>

                <span>{formatTime(run.created_at)}</span>

                <span>•</span>

                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    run.status === "completed"
                      ? "bg-green-500/10 text-green-600"
                      : run.status === "processing"
                        ? "bg-yellow-500/10 text-yellow-600"
                        : run.status === "failed"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {run.status}
                </span>
              </div>
            </div>
          </div>

          {/* Run Label Card */}
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="Add a label (e.g., January Feedback)"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />

            <button
              disabled={savingLabel}
              onClick={handleSaveLabel}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                savingLabel
                  ? "animate-shimmer border-pink-500 text-white"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              {savingLabel ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* METADATA */}
        <RunMetadataSection run={run} upload={upload} formatTime={formatTime} />

        {/* PROBLEMS */}
        <ProblemsSection
          run={run}
          problems={problems}
          loadingProblems={loadingProblems}
          loadingActions={loadingActions}
          actionsError={actionsError}
          actionsByProblemId={actionsByProblemId}
          copiedAction={copiedAction}
          loadProblemActions={loadProblemActions}
          copyProblemExport={copyProblemExport}
          router={router}
        />

        {/* FEATURES */}
        <FeaturesSection
          run={run}
          features={features}
          loadingFeatures={loadingFeatures}
          router={router}
        />

        {/* DELTAS */}
        <DeltaSection
          run={run}
          deltaRow={deltaRow}
          loadingDeltas={loadingDeltas}
          router={router}
        />

        {/* MEMO */}
        <MemoSection
          run={run}
          memo={memo}
          memoSavedAt={memoSavedAt}
          loadingMemo={loadingMemo}
          memoError={memoError}
          copied={copiedMemo}
          handleGenerateMemo={() => generateMemo(memo)}
          handleCopyMemo={handleCopyMemo}
          formatTime={formatTime}
        />
      </div>
    </div>
  );
}
