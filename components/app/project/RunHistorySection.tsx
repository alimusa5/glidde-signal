"use client";

import Link from "next/link";
import type { MemoMetaByRunId, RunHistoryItem } from "./types";
import { formatDateTime, titleCase } from "./utils";

type Props = {
  projectId: string;
  runs: RunHistoryItem[];
  memoMeta: MemoMetaByRunId;
  loadingRuns: boolean;
  historyLimit: number;
};

export default function RunHistorySection({
  projectId,
  runs,
  memoMeta,
  loadingRuns,
}: Props) {
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-6">
      <div className="flex justify-between mb-6">
        <h2 className="text-lg font-semibold">Run History</h2>
        <span className="text-sm text-muted-foreground">
          {runs.length} runs
        </span>
      </div>

      {loadingRuns ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-muted-foreground">No runs yet.</div>
      ) : (
        <div className="grid gap-4">
          {runs.map((run) => {
            const memoSavedAt = memoMeta[run.id]?.created_at;

            return (
              <Link
                key={run.id}
                href={`/project/${projectId}/runs/${run.id}`}
                className="rounded-xl border border-border bg-background p-5 hover:border-pink-500/50 transition"
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold">
                    {formatDateTime(run.created_at)}
                  </span>

                  <span className="text-xs px-3 py-1 rounded-full bg-muted">
                    {run.status}
                  </span>
                </div>

                <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                  <span>
                    Scope: <b>{run.scope}</b>
                  </span>

                  <span>
                    Source: <b>{titleCase(run.source_filter)}</b>
                  </span>

                  <span>
                    Entries: <b>{run.entry_count}</b>
                  </span>
                </div>

                <div className="text-sm mt-2">
                  {memoSavedAt ? (
                    <span className="text-green-400">Executive memo saved</span>
                  ) : (
                    <span className="text-muted-foreground">
                      No executive memo
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
