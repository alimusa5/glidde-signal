import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processRun } from "@/lib/runs/processRun";
import { getActiveSubscriptionForUser } from "@/lib/billing/getSubscription";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Body = {
  projectId: string;
  scope: "upload" | "project";
  uploadId?: string;
  sourceFilter: "all" | "reviews" | "support" | "surveys";
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// Fallbacks only (ideally not used because subscription row has these)
function startOfCurrentMonthISO(): string {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  );
  return start.toISOString();
}

function startOfNextMonthISO(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return next.toISOString();
}

function formatUpgradePayload() {
  return {
    title: "Upgrade to Pro",
    starterIncludes: [
      "1 Active Project",
      "Up to 3 Insight Runs per billing period",
      "History of last 5 runs",
    ],
    proUnlocks: [
      "Unlimited Projects",
      "Unlimited Insight Runs",
      "Full Run History",
      "Priority Processing",
    ],
    cta: "Upgrade to Pro — $399/mo",
  };
}

export async function POST(req: Request) {
  // 0) Auth
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const userId = userData.user.id;

  // 1) Subscription gate
  const sub = await getActiveSubscriptionForUser(userId);

  const allowedStatuses = new Set(["active", "trialing", "past_due"]);
  if (!sub || !allowedStatuses.has(sub.status)) {
    return NextResponse.json(
      {
        code: "NO_ACTIVE_SUBSCRIPTION",
        error: "No active subscription. Please subscribe to run insights.",
      },
      { status: 402 },
    );
  }

  const isPro = sub.plan === "pro";
  const plan = sub.plan;

  // 2) Billing window (Option A: subscription period for Starter + Pro)
  // If Lemon period is missing for some reason, fall back to calendar month.
  const periodStart = sub.current_period_start ?? startOfCurrentMonthISO();
  const periodEnd = sub.current_period_end ?? startOfNextMonthISO();
  const nextResetAt = periodEnd;

  // 3) Soft rate limit: prevent runs within last 10 seconds
  const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();

  const { count: recentRuns, error: rateErr } = await supabaseAdmin
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", tenSecondsAgo);

  if (rateErr) {
    return NextResponse.json(
      { error: "Failed to validate rate limit." },
      { status: 500 },
    );
  }

  if ((recentRuns ?? 0) > 0) {
    return NextResponse.json(
      {
        code: "RATE_LIMITED",
        error: "Please wait 10 seconds before creating another run.",
        waitSeconds: 10,
      },
      { status: 429 },
    );
  }

  // 4) Starter run-limit gate (3 per billing period; exclude failed runs)
  let runsUsedThisPeriod = 0;

  if (!isPro) {
    const { count: runCount, error: runCountErr } = await supabaseAdmin
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("status", "failed")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (runCountErr) {
      return NextResponse.json(
        { error: "Failed to validate run limit." },
        { status: 500 },
      );
    }

    runsUsedThisPeriod = runCount ?? 0;

    if (runsUsedThisPeriod >= 3) {
      return NextResponse.json(
        {
          code: "RUN_LIMIT_REACHED",
          error:
            "You’ve reached your limit for this billing period. Upgrade to Pro for unlimited insights.",
          entitlements: {
            plan,
            isPro,
            runsUsedThisPeriod,
            runsLimit: 3,
            nextResetAt,
            periodStart,
            periodEnd,
          },
          upgrade: formatUpgradePayload(),
        },
        { status: 402 },
      );
    }
  }

  // 5) Parse body
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectId, scope, uploadId, sourceFilter } = body;

  if (!projectId || !scope || !sourceFilter) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 },
    );
  }

  if (scope !== "upload" && scope !== "project") {
    return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
  }

  if (!["all", "reviews", "support", "surveys"].includes(sourceFilter)) {
    return NextResponse.json(
      { error: "Invalid sourceFilter." },
      { status: 400 },
    );
  }

  // 6) Validate project ownership
  const { data: proj, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (projErr || !proj) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (proj.user_id !== userId) {
    return NextResponse.json(
      { error: "Not authorized for this project." },
      { status: 403 },
    );
  }

  // 7) Resolve scope → latest upload if needed
  let resolvedUploadId: string | null = null;

  if (scope === "upload") {
    if (uploadId) {
      resolvedUploadId = uploadId;
    }

    if (!resolvedUploadId) {
      const { data: latestUpload } = await supabaseAdmin
        .from("uploads")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestUpload?.id) {
        return NextResponse.json(
          { error: "No uploads yet. Upload feedback to generate insights." },
          { status: 400 },
        );
      }

      resolvedUploadId = latestUpload.id;
    }

    // EXTRA SAFETY
    if (!resolvedUploadId) {
      return NextResponse.json(
        { error: "Upload resolution failed." },
        { status: 500 },
      );
    }
  }

  // 8) Count entries snapshot
  let q = supabaseAdmin
    .from("feedback_entries")
    .select("id", { count: "exact", head: true });

  if (scope === "upload") {
    q = q.eq("upload_id", resolvedUploadId);
  } else {
    q = q.eq("project_id", projectId);
  }

  if (sourceFilter !== "all") {
    q = q.eq("source", sourceFilter);
  }

  const { count, error: countErr } = await q;

  if (countErr) {
    return NextResponse.json(
      { error: "Failed to count entries." },
      { status: 500 },
    );
  }

  // 9) Create run
  const { data: run, error: runErr } = await supabaseAdmin
    .from("runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      scope,
      upload_id: resolvedUploadId,
      source_filter: sourceFilter,
      entry_count: count ?? 0,
      status: "queued",
    })
    .select("id")
    .single();

  if (runErr || !run) {
    return NextResponse.json(
      { error: "Failed to create run." },
      { status: 500 },
    );
  }

  // 10) Process run: queued → processing → completed/failed
  try {
    await supabaseAdmin
      .from("runs")
      .update({ status: "processing" })
      .eq("id", run.id);

    await processRun(run.id);

    await supabaseAdmin
      .from("runs")
      .update({ status: "completed" })
      .eq("id", run.id);
  } catch (e: unknown) {
    await supabaseAdmin
      .from("runs")
      .update({ status: "failed" })
      .eq("id", run.id);

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Run processing failed." },
      { status: 500 },
    );
  }

  // 11) Return runId + usage snapshot
  return NextResponse.json({
    runId: run.id,
    entitlements: isPro
      ? {
          plan,
          isPro,
          runsLimit: null,
          runsUsedThisPeriod: null,
          nextResetAt: null,
          periodStart,
          periodEnd,
        }
      : {
          plan,
          isPro,
          runsLimit: 3,
          runsUsedThisPeriod,
          nextResetAt,
          periodStart,
          periodEnd,
        },
  });
}
