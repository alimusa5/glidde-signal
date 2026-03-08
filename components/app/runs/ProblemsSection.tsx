"use client";

import ProcessingNotice from "./ProcessingNotice";
import { RunRecord, RunProblem, ProblemActionRow } from "./types";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type Props = {
  run: RunRecord;
  problems: RunProblem[];
  loadingProblems: boolean;
  loadingActions: boolean;
  actionsError: string;
  actionsByProblemId: Record<string, ProblemActionRow>;
  copiedAction: {
    problemId: string;
    format: "jira" | "linear" | "slack";
  } | null;
  loadProblemActions: (force?: boolean) => void;
  copyProblemExport: (
    problem: RunProblem,
    format: "jira" | "linear" | "slack",
  ) => void;
  router: AppRouterInstance;
};

export default function ProblemsSection({
  run,
  problems,
  loadingProblems,
  loadingActions,
  actionsError,
  actionsByProblemId,
  copiedAction,
  loadProblemActions,
  copyProblemExport,
  router,
}: Props) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Top Problems</h2>

        {run.status === "completed" && problems.length > 0 && (
          <button
            onClick={() => loadProblemActions(true)}
            disabled={loadingActions}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
              loadingActions
                ? "animate-shimmer border-pink-500 text-white"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {loadingActions ? "Regenerating…" : "Regenerate Actions"}
          </button>
        )}
      </div>

      {/* ERROR */}
      {actionsError && (
        <div className="mt-4 text-sm text-red-500">{actionsError}</div>
      )}

      {/* PROCESSING */}
      {run.status === "queued" || run.status === "processing" ? (
        <ProcessingNotice onRefresh={() => router.refresh()} />
      ) : run.status === "failed" ? (
        <div className="mt-4 text-red-500">
          This run failed. Try generating insights again.
        </div>
      ) : loadingProblems ? (
        <div className="mt-4 text-muted-foreground">Loading…</div>
      ) : problems.length === 0 ? (
        <div className="mt-4 text-muted-foreground">
          No problems generated for this run yet.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {problems.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-border bg-background p-5"
            >
              {/* TITLE */}
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">
                  #{p.rank} — {p.title}
                </div>

                <div className="text-xs text-muted-foreground">
                  {p.mention_count} mentions
                </div>
              </div>

              {/* META */}
              <div className="mt-2 text-sm text-muted-foreground">
                Seen in: {p.sources?.length ? p.sources.join(", ") : "—"}
              </div>

              {/* SUMMARY */}
              {p.summary && (
                <div className="mt-3 text-sm text-foreground/90">
                  {p.summary}
                </div>
              )}

              {/* QUOTES */}
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  REAL CUSTOMER QUOTES
                </div>

                {Array.isArray(p.quotes) && p.quotes.length > 0 ? (
                  <div className="space-y-3">
                    {p.quotes.slice(0, 3).map((q, idx) => (
                      <div
                        key={idx}
                        className="border-l-2 border-pink-500/50 pl-3 text-sm"
                      >
                        <div className="italic">“{q.text}”</div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {q.source}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No quotes available.
                  </div>
                )}
              </div>

              {/* DECISION ASSISTANT */}
              {actionsByProblemId[p.id] && (
                <div className="mt-5 rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Decision Assistant
                    </div>

                    {/* EXPORT BUTTONS */}
                    <div className="flex gap-3">
                      {/* JIRA */}
                      <button
                        onClick={() => copyProblemExport(p, "jira")}
                        className={`px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                          copiedAction?.problemId === p.id &&
                          copiedAction?.format === "jira"
                            ? "bg-pink-500 text-white animate-pink-pulse border-pink-500"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {copiedAction?.problemId === p.id &&
                        copiedAction?.format === "jira"
                          ? "Copied!"
                          : "Jira"}
                      </button>

                      {/* LINEAR */}
                      <button
                        onClick={() => copyProblemExport(p, "linear")}
                        className={`px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                          copiedAction?.problemId === p.id &&
                          copiedAction?.format === "linear"
                            ? "bg-pink-500 text-white animate-pink-pulse border-pink-500"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {copiedAction?.problemId === p.id &&
                        copiedAction?.format === "linear"
                          ? "Copied!"
                          : "Linear"}
                      </button>

                      {/* SLACK */}
                      <button
                        onClick={() => copyProblemExport(p, "slack")}
                        className={`px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                          copiedAction?.problemId === p.id &&
                          copiedAction?.format === "slack"
                            ? "bg-pink-500 text-white animate-pink-pulse border-pink-500"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {copiedAction?.problemId === p.id &&
                        copiedAction?.format === "slack"
                          ? "Copied!"
                          : "Slack"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div>
                      <span className="font-medium">Suggested Action</span>
                      <div className="text-muted-foreground">
                        {actionsByProblemId[p.id].suggested_action || "—"}
                      </div>
                    </div>

                    <div>
                      <span className="font-medium">First Check</span>
                      <div className="text-muted-foreground">
                        {actionsByProblemId[p.id].first_check || "—"}
                      </div>
                    </div>

                    <div>
                      <span className="font-medium">Suggested Owner</span>
                      <div className="text-muted-foreground">
                        {actionsByProblemId[p.id].owner_guess || "—"}
                      </div>
                    </div>

                    <div>
                      <span className="font-medium">Expected Impact</span>
                      <div className="text-muted-foreground">
                        {actionsByProblemId[p.id].expected_impact || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
