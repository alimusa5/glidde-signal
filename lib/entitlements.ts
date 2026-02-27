// lib/entitlements.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getActiveSubscriptionForUser } from "@/lib/billing/getSubscription";

export type Plan = "starter" | "pro";

export type Entitlements = {
  plan: Plan;
  isPro: boolean;

  // Starter usage visibility
  runsUsedThisPeriod: number;
  runsLimit: number | null; // null = unlimited
  nextResetAt: string | null;

  // Starter project cap
  activeProjects: number;
  maxActiveProjects: number | null;

  // Optional debugging / UI display
  periodStart: string | null;
  periodEnd: string | null;

  // Pricing-aligned visibility rules
  historyVisibleRuns: number | null; // Starter: 5, Pro: null (unlimited)
};

function getCalendarMonthWindowUTC(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { start, end };
}

function isAllowedSubStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Single source of truth for plan + limits + usage.
 * Option A: Uses subscription billing window (period_start/end) whenever present.
 * Fallback: calendar month only if billing window is missing.
 */
export async function getEntitlements(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<Entitlements> {
  const { supabase, userId } = opts;

  // 1) Subscription -> determine plan + allowed status
  const sub = await getActiveSubscriptionForUser(userId);

  const hasAllowedSub =
    !!sub &&
    isAllowedSubStatus(sub.status) &&
    (sub.plan === "starter" || sub.plan === "pro");

  const isPro = hasAllowedSub && sub!.plan === "pro";
  const plan: Plan = isPro ? "pro" : "starter";

  // 2) Define usage window (Option A)
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;

  if (hasAllowedSub && sub?.current_period_start && sub?.current_period_end) {
    periodStart = new Date(sub.current_period_start);
    periodEnd = new Date(sub.current_period_end);
  } else {
    const w = getCalendarMonthWindowUTC();
    periodStart = w.start;
    periodEnd = w.end;
  }

  // 3) Runs used this period (Starter only)
  let runsUsed = 0;

  if (!isPro && periodStart && periodEnd) {
    const { count, error } = await supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("status", "failed")
      .gte("created_at", periodStart.toISOString())
      .lt("created_at", periodEnd.toISOString());

    if (error) throw new Error(error.message);
    runsUsed = count ?? 0;
  }

  // 4) Active projects count
  const { count: projectCount, error: projErr } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (projErr) throw new Error(projErr.message);

  return {
    plan,
    isPro,

    runsUsedThisPeriod: isPro ? 0 : runsUsed,
    runsLimit: isPro ? null : 3,
    nextResetAt: isPro ? null : (periodEnd?.toISOString() ?? null),

    activeProjects: projectCount ?? 0,
    maxActiveProjects: isPro ? null : 1,

    periodStart: periodStart?.toISOString() ?? null,
    periodEnd: periodEnd?.toISOString() ?? null,

    // ✅ You requested Starter history cap = 5
    historyVisibleRuns: isPro ? null : 5,
  };
}
