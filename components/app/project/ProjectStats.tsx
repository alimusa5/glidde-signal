"use client";

import type { EntitlementsPayload, LatestUploadSummary } from "./types";

type Props = {
  entitlements: EntitlementsPayload | null;
  latest: LatestUploadSummary | null;
};

function formatResetDate(date?: string | null) {
  if (!date) return "—";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectStats({ entitlements }: Props) {
  const used = entitlements?.runsUsedThisPeriod ?? 0;
  const limit = entitlements?.runsLimit;

  const percent = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      {/* PLAN */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="text-xs text-muted-foreground">Plan</div>

        <div className="mt-2">
          {entitlements ? (
            <span className="rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white">
              {entitlements.plan.toUpperCase()}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Loading...</span>
          )}
        </div>
      </div>

      {/* RUNS USED */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="text-xs text-muted-foreground">Runs Used</div>

        {limit == null ? (
          <div className="mt-2 text-base font-semibold">Unlimited</div>
        ) : (
          <>
            <div className="mt-2 text-base font-semibold">
              {used} / {limit}
            </div>

            {/* progress bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 transition-all duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* RESET DATE */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="text-xs text-muted-foreground">Reset Date</div>

        <div className="mt-2 text-base font-semibold">
          {formatResetDate(entitlements?.nextResetAt)}
        </div>
      </div>
    </div>
  );
}
