import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeText, dedupeExact } from "@/lib/normalize";

async function insertEntriesInChunks(
  supabase: SupabaseClient,
  rows: Array<{
    upload_id: string;
    project_id: string;
    user_id: string;
    source: string;
    content: string;
  }>,
  chunkSize = 500,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("feedback_entries").insert(chunk);
    if (error) throw new Error(error.message);
  }
}

function splitIntoLines(text: string) {
  // Split on newlines; keep it simple for Day 3
  // (Normalization will later remove noise like signatures/extra whitespace)
  return text
    .split(/\r?\n+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function POST(req: Request) {
  try {
    // 1) Read Bearer token
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return NextResponse.json({ error: "Empty token" }, { status: 401 });
    }

    // 2) Create Supabase client as the user (RLS enforced)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    // 3) Verify user via token
    const { data: userData, error: userErr } =
      await supabase.auth.getUser(token);
    const user = userData.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: userErr?.message ?? "Unauthorized" },
        { status: 401 },
      );
    }

    // 4) Parse JSON body
    const body = await req.json().catch(() => null);
    const projectId = String(body?.projectId ?? "");
    const source = String(body?.source ?? "");
    const text = String(body?.text ?? "");

    if (!projectId || !source || !text.trim()) {
      return NextResponse.json(
        { error: "Missing projectId, source, or text" },
        { status: 400 },
      );
    }

    // 5) Ensure user owns project
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projErr || !proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 6) Normalize + dedupe
    const lines = splitIntoLines(text);
    const normalized = lines
      .map((t) => normalizeText(t))
      .filter((t) => t.length > 0);
    const unique = dedupeExact(normalized);

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "No valid feedback lines found" },
        { status: 400 },
      );
    }

    // 7) Create upload batch
    const { data: upload, error: uploadErr } = await supabase
      .from("uploads")
      .insert({
        project_id: projectId,
        user_id: user.id,
        source,
        original_filename: null,
      })
      .select("id")
      .single();

    if (uploadErr || !upload) {
      return NextResponse.json(
        { error: uploadErr?.message ?? "Upload insert failed" },
        { status: 500 },
      );
    }

    // 8) Insert entries (content, not text)
    const entryRows = unique.map((content) => ({
      upload_id: upload.id,
      project_id: projectId,
      user_id: user.id,
      source,
      content,
    }));

    await insertEntriesInChunks(supabase, entryRows);

    return NextResponse.json({ uploadId: upload.id, count: unique.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
