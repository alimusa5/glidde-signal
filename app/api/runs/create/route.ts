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

export async function POST(req: Request) {
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

  // ✅ Billing gate (Starter: 3 runs per billing period, Pro: unlimited)
  const sub = await getActiveSubscriptionForUser(userId);

  if (!sub || (sub.status !== "active" && sub.status !== "trialing")) {
    return NextResponse.json(
      { error: "No active subscription. Please subscribe to run insights." },
      { status: 402 },
    );
  }

  // Determine the billing period to count runs within
  // If webhook didn’t populate period fields, fall back to current calendar month
  const periodStart = sub.current_period_start ?? startOfCurrentMonthISO();
  const periodEnd = sub.current_period_end ?? startOfNextMonthISO();

  if (sub.plan === "starter") {
    const { count: runCount, error: runCountErr } = await supabaseAdmin
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    if (runCountErr) {
      return NextResponse.json(
        { error: "Failed to validate run limit." },
        { status: 500 },
      );
    }

    if ((runCount ?? 0) >= 3) {
      return NextResponse.json(
        {
          error:
            "Starter plan includes up to 3 insight runs per billing period. Upgrade to Pro for unlimited runs.",
        },
        { status: 403 },
      );
    }
  }

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

  // 1) Validate project ownership (assumes projects.user_id exists)
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

  // 2) Resolve scope → latest upload if needed
  let resolvedUploadId: string | null = null;

  if (scope === "upload") {
    if (uploadId) {
      resolvedUploadId = uploadId;
    } else {
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
  }

  // 3) Count entries snapshot
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

  // 4) Create run with lifecycle: queued → processing → completed/failed
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

  // 5) Mark processing
  const { error: processingErr } = await supabaseAdmin
    .from("runs")
    .update({ status: "processing" })
    .eq("id", run.id);

  if (processingErr) {
    await supabaseAdmin
      .from("runs")
      .update({ status: "failed" })
      .eq("id", run.id);
    return NextResponse.json(
      { error: "Run created but failed to enter processing state." },
      { status: 500 },
    );
  }

  // 6) Actually process the run and write Top 5 problems to run_problems
  try {
    await processRun(run.id);
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

  // 7) Mark completed
  const { error: completedErr } = await supabaseAdmin
    .from("runs")
    .update({ status: "completed" })
    .eq("id", run.id);

  if (completedErr) {
    await supabaseAdmin
      .from("runs")
      .update({ status: "failed" })
      .eq("id", run.id);
    return NextResponse.json(
      { error: "Run processed but failed to complete." },
      { status: 500 },
    );
  }

  return NextResponse.json({ runId: run.id });
}
