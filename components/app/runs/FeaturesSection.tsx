import ProcessingNotice from "./ProcessingNotice";
import { RunFeature, RunRecord } from "./types";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type Props = {
  run: RunRecord;
  features: RunFeature[];
  loadingFeatures: boolean;
  router: AppRouterInstance;
};

export default function FeaturesSection({
  run,
  features,
  loadingFeatures,
  router,
}: Props) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Feature-Level Pain Map</h2>

      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Counts are feature mentions. One entry can mention multiple features.
      </p>

      {run.status === "queued" || run.status === "processing" ? (
        <ProcessingNotice onRefresh={() => router.refresh()} />
      ) : loadingFeatures ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : features.length === 0 ? (
        <div className="text-muted-foreground">No feature mentions found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Feature</th>
                <th className="py-2 text-left">Mentions</th>
                <th className="py-2 text-left">Dominant Issue</th>
              </tr>
            </thead>

            <tbody>
              {features.map((f) => (
                <tr key={f.id} className="border-b border-border">
                  <td className="py-3">{f.feature}</td>
                  <td className="py-3">{f.mention_count}</td>
                  <td className="py-3 text-muted-foreground">
                    {f.dominant_problem ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
