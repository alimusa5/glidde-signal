// app/api/runs/[runId]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function extractRunIdFromUrl(req: Request) {
  // /api/runs/<runId>
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export async function PATCH(req: Request) {
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

    let body: { label?: string | null };
    try {
      body = (await req.json()) as { label?: string | null };
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    // Normalize label: trim, cap length, allow null/empty
    const raw = body?.label;
    const label =
      raw === null || raw === undefined
        ? null
        : String(raw).trim().slice(0, 60) || null;

    // Validate run ownership
    const { data: run, error: runErr } = await supabaseAdmin
      .from("runs")
      .select("id, user_id")
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

    // Update label
    const { error: updErr } = await supabaseAdmin
      .from("runs")
      .update({ label })
      .eq("id", runId)
      .eq("user_id", userId);

    if (updErr) {
      return NextResponse.json(
        { error: `Failed to save label: ${updErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, label });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
