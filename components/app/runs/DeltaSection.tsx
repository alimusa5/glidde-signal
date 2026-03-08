import { RunRecord, RunDeltaDbRow } from "./types";
import DeltaList from "./DeltaList";
import ProcessingNotice from "./ProcessingNotice";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type DeltaSectionProps = {
  run: RunRecord;
  deltaRow: RunDeltaDbRow | null;
  loadingDeltas: boolean;
  router: AppRouterInstance;
};

export default function DeltaSection({
  run,
  deltaRow,
  loadingDeltas,
  router,
}: DeltaSectionProps) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">
        What Changed Since Last Run
      </h2>

      {run.status === "queued" || run.status === "processing" ? (
        <ProcessingNotice onRefresh={() => router.refresh()} />
      ) : run.status === "failed" ? (
        <div className="text-red-500">
          This run failed. Try generating insights again.
        </div>
      ) : loadingDeltas ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !deltaRow ? (
        <div className="text-muted-foreground">
          No previous run to compare yet.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
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
  );
}
