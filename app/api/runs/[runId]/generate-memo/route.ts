// app/api/runs/[runId]/generate-memo/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateMemo } from "@/lib/runs/generateMemo";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function POST(req: Request) {
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

    // ✅ Extract runId from URL: /api/runs/<runId>/generate-memo
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const runId = parts[parts.length - 2]; // second last segment

    if (!runId) {
      return NextResponse.json({ error: "Missing runId." }, { status: 400 });
    }

    // ✅ Day 9: memo caching behavior
    // Default (no force): if memo exists, return it without calling OpenAI
    const force = url.searchParams.get("force") === "true";

    // Load run + validate ownership + completed
    const { data: run, error: runErr } = await supabaseAdmin
      .from("runs")
      .select("id, project_id, user_id, status")
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
        { error: "Run is not completed." },
        { status: 400 },
      );
    }

    // ✅ If not forcing regen, return existing memo if present (fast + saves cost)
    if (!force) {
      const { data: existingMemo, error: memoErr } = await supabaseAdmin
        .from("run_memos")
        .select("content, created_at")
        .eq("run_id", runId)
        .eq("user_id", userId)
        .maybeSingle();

      if (memoErr) {
        return NextResponse.json(
          { error: `Failed to load memo: ${memoErr.message}` },
          { status: 500 },
        );
      }

      if (existingMemo?.content) {
        return NextResponse.json({
          memo: existingMemo.content,
          memoSavedAt: existingMemo.created_at ?? null,
          cached: true,
        });
      }
    }

    // Generate memo (calls OpenAI)
    const { memoText } = await generateMemo(runId);

    // ✅ Idempotent save: delete only this user's memo for this run
    const { error: delErr } = await supabaseAdmin
      .from("run_memos")
      .delete()
      .eq("run_id", runId)
      .eq("user_id", userId);

    if (delErr) {
      return NextResponse.json(
        { error: `Failed to replace memo: ${delErr.message}` },
        { status: 500 },
      );
    }

    // ✅ Insert and return created_at for “Memo saved at” (instant UI update)
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("run_memos")
      .insert({
        run_id: runId,
        project_id: run.project_id,
        user_id: userId,
        content: memoText,
      })
      .select("created_at")
      .single();

    if (insErr) {
      return NextResponse.json(
        { error: `Failed to save memo: ${insErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      memo: memoText,
      memoSavedAt: inserted?.created_at ?? null,
      cached: false,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
