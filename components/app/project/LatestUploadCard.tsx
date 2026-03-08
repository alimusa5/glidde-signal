"use client";

import Link from "next/link";
import type {
  EntitlementsPayload,
  LatestUploadSummary,
  UpgradePayload,
} from "./types";
import { formatDateTime, titleCase } from "./utils";

type Props = {
  projectId: string;
  loadingLatest: boolean;
  latest: LatestUploadSummary | null;
  runEntitlements: EntitlementsPayload | null;
  isCreatingRun: boolean;
  runBlocked: boolean;
  runUpgrade: UpgradePayload | null;
  runError: string;
  runMsg: string;
  onGenerateInsights: () => Promise<void>;
  onUpgradeClick: () => void;
  onDismissUpgrade: () => void;
};

export default function LatestUploadCard({
  projectId,
  loadingLatest,
  latest,
  isCreatingRun,
  runBlocked,
  runUpgrade,
  runError,
  runMsg,
  onGenerateInsights,
  onUpgradeClick,
  onDismissUpgrade,
}: Props) {
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 text-lg font-semibold">Latest Upload</div>

      {loadingLatest ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : latest ? (
        <>
          {/* Upload info */}
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div>
              Source: <b>{titleCase(latest.source)}</b>
            </div>

            <div>
              Entries: <b>{latest.count}</b>
            </div>

            <div>
              Uploaded: <b>{formatDateTime(latest.createdAt)}</b>
            </div>

            <div className="text-green-400">Status: Ready to analyze</div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/project/${projectId}/feedback`}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
            >
              View Feedback
            </Link>

            <button
              disabled={isCreatingRun || !latest || runBlocked}
              onClick={onGenerateInsights}
              className="rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110"
            >
              {isCreatingRun ? "Creating Run..." : "Generate Insights"}
            </button>
          </div>

          {/* Upgrade Card */}
          {runUpgrade && (
            <div className="mt-6 rounded-2xl border border-border bg-background p-6">
              <h3 className="text-lg font-semibold">{runUpgrade.title}</h3>

              <p className="mt-2 text-sm text-muted-foreground">
                Starter plan has limited runs per billing period. Upgrade to Pro
                to remove limits and unlock continuous insight.
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {/* Starter */}
                <div className="rounded-xl border border-border bg-muted p-4">
                  <div className="mb-3 text-sm font-semibold">
                    Starter includes
                  </div>

                  <ul className="space-y-2 text-sm">
                    {runUpgrade.starterIncludes.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>

                {/* Pro */}
                <div className="rounded-xl bg-linear-to-br from-pink-500 to-fuchsia-500 p-4 text-white">
                  <div className="mb-3 text-sm font-semibold">Pro unlocks</div>

                  <ul className="space-y-2 text-sm">
                    {runUpgrade.proUnlocks.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={onUpgradeClick}
                  className="rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-5 py-2 font-semibold text-white"
                >
                  {runUpgrade.cta}
                </button>

                <button
                  onClick={onDismissUpgrade}
                  className="rounded-xl border border-border px-5 py-2"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {runError && !runUpgrade && (
            <div className="mt-4 text-sm text-red-400">{runError}</div>
          )}

          {runMsg && <div className="mt-4 text-sm">{runMsg}</div>}
        </>
      ) : (
        <div className="text-muted-foreground">
          No uploads yet. Upload feedback to generate insights.
        </div>
      )}
    </section>
  );
}
