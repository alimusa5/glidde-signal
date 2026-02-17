// app/api/runs/[runId]/actions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateProblemActions } from "@/lib/runs/generateProblemActions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ProblemActionRow = {
  problem_id: string;
  suggested_action: string | null;
  first_check: string | null;
  owner_guess: string | null;
  expected_impact: string | null;
  created_at: string | null;
};

type GeneratedBundle = {
  problem_id: string;
  suggested_action: string;
  first_check: string;
  owner_guess: string;
  expected_impact: string;
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function extractRunIdFromUrl(req: Request) {
  // /api/runs/<runId>/actions
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // parts: ["api","runs","<runId>","actions"]
  const runId = parts[2] ?? null;
  return runId;
}

function parseForce(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force");
  return force === "true" || force === "1";
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing auth token." },
        { status: 401 },
      );
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }

    const userId = userData.user.id;

    const runId = extractRunIdFromUrl(req);
    if (!runId) {
      return NextResponse.json({ error: "Missing runId." }, { status: 400 });
    }

    const force = parseForce(req);

    // 1) Validate run ownership
    const { data: run, error: runErr } = await supabaseAdmin
      .from("runs")
      .select("id, user_id, status")
      .eq("id", runId)
      .single();

    if (runErr || !run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (run.user_id !== userId) {
      return NextResponse.json(
        { error: "Not authorized for this run." },
        { status: 403 },
      );
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Run is not completed yet." },
        { status: 409 },
      );
    }

    // 2) Load Top 5 problem ids for this run
    const { data: problems, error: probErr } = await supabaseAdmin
      .from("run_problems")
      .select("id")
      .eq("run_id", runId)
      .order("rank", { ascending: true })
      .limit(5);

    if (probErr) {
      return NextResponse.json(
        { error: `Failed to load run problems: ${probErr.message}` },
        { status: 500 },
      );
    }

    const problemIds = (problems ?? []).map((p) => p.id);
    if (problemIds.length === 0) {
      return NextResponse.json({ run_id: runId, actions: [] });
    }

    // 3) Cache read (unless force)
    if (!force) {
      const { data: cached, error: cachedErr } = await supabaseAdmin
        .from("run_problem_actions")
        .select(
          "problem_id, suggested_action, first_check, owner_guess, expected_impact, created_at",
        )
        .eq("run_id", runId)
        .in("problem_id", problemIds)
        .order("created_at", { ascending: false });

      if (cachedErr) {
        return NextResponse.json(
          { error: `Failed to load cached actions: ${cachedErr.message}` },
          { status: 500 },
        );
      }

      // If we have actions for all Top-5 problems, return them
      const byProblem = new Map<string, ProblemActionRow>();
      for (const row of (cached ?? []) as ProblemActionRow[]) {
        if (!byProblem.has(row.problem_id)) byProblem.set(row.problem_id, row);
      }

      if (byProblem.size === problemIds.length) {
        const ordered = problemIds
          .map((id) => byProblem.get(id))
          .filter(Boolean);
        return NextResponse.json({ run_id: runId, actions: ordered });
      }
      // else: fall through and generate (we regenerate all for simplicity)
    }

    // 4) Generate via LLM (Top-5 only) with guardrails:
    // - If LLM fails, return cached if possible
    let bundles: GeneratedBundle[] = [];
    try {
      bundles = (await generateProblemActions(runId)) as GeneratedBundle[];
    } catch (e: unknown) {
      // fallback: return whatever cached actions exist (better than breaking UI)
      const { data: cachedFallback } = await supabaseAdmin
        .from("run_problem_actions")
        .select(
          "problem_id, suggested_action, first_check, owner_guess, expected_impact, created_at",
        )
        .eq("run_id", runId)
        .in("problem_id", problemIds);

      if (cachedFallback && cachedFallback.length > 0) {
        // keep order aligned to top-5
        const map = new Map<string, ProblemActionRow>();
        for (const row of cachedFallback as ProblemActionRow[]) {
          map.set(row.problem_id, row);
        }
        const ordered = problemIds.map((id) => map.get(id)).filter(Boolean);
        return NextResponse.json({ run_id: runId, force, actions: ordered });
      }

      const message =
        e instanceof Error ? e.message : "Action generation failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Keep only Top-5 (defensive)
    const filtered = bundles.filter((b) => problemIds.includes(b.problem_id));

    // 5) Upsert into run_problem_actions (idempotent by problem_id)
    const now = new Date().toISOString();

    const upsertRows = filtered.map((b) => ({
      run_id: runId,
      problem_id: b.problem_id,
      suggested_action: b.suggested_action,
      first_check: b.first_check,
      owner_guess: b.owner_guess,
      expected_impact: b.expected_impact,
      created_at: now, // refresh timestamp on regen
    }));

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("run_problem_actions")
        .upsert(upsertRows, { onConflict: "problem_id" });

      if (upsertErr) {
        // if save fails, still try to return cached (if present) to avoid UI breaking
        const { data: cachedFallback } = await supabaseAdmin
          .from("run_problem_actions")
          .select(
            "problem_id, suggested_action, first_check, owner_guess, expected_impact, created_at",
          )
          .eq("run_id", runId)
          .in("problem_id", problemIds);

        if (cachedFallback && cachedFallback.length > 0) {
          const map = new Map<string, ProblemActionRow>();
          for (const row of cachedFallback as ProblemActionRow[]) {
            map.set(row.problem_id, row);
          }
          const ordered = problemIds.map((id) => map.get(id)).filter(Boolean);
          return NextResponse.json({ run_id: runId, force, actions: ordered });
        }

        return NextResponse.json(
          { error: `Failed to save actions: ${upsertErr.message}` },
          { status: 500 },
        );
      }
    }

    // 6) Return saved actions (ordered)
    const { data: saved, error: savedErr } = await supabaseAdmin
      .from("run_problem_actions")
      .select(
        "problem_id, suggested_action, first_check, owner_guess, expected_impact, created_at",
      )
      .eq("run_id", runId)
      .in("problem_id", problemIds);

    if (savedErr) {
      return NextResponse.json(
        { error: `Failed to load saved actions: ${savedErr.message}` },
        { status: 500 },
      );
    }

    const byProblem = new Map<string, ProblemActionRow>();
    for (const row of (saved ?? []) as ProblemActionRow[]) {
      byProblem.set(row.problem_id, row);
    }

    const ordered = problemIds.map((id) => byProblem.get(id)).filter(Boolean);

    return NextResponse.json({ run_id: runId, force, actions: ordered });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
