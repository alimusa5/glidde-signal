import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeText, splitRawText, dedupeExact } from "@/lib/normalize";

async function insertEntriesInChunks(
  supabase: SupabaseClient,
  rows: Array<{
    upload_id: string;
    project_id: string;
    user_id: string;
    source: string;
    text: string;
  }>,
  chunkSize = 500,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("feedback_entries").insert(chunk);
    if (error) throw new Error(error.message);
  }
}

export async function POST(req: Request) {
  try {
    // 1) Read Bearer token from Authorization header
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

    // 2) Create Supabase client that runs queries as the user (RLS enforced)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    // 3) Verify user explicitly using token
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
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { projectId, source, text } = body as {
      projectId?: unknown;
      source?: unknown;
      text?: unknown;
    };

    const projectIdStr = typeof projectId === "string" ? projectId : "";
    const sourceStr = typeof source === "string" ? source : "";
    const textStr = typeof text === "string" ? text : "";

    if (!projectIdStr || !sourceStr) {
      return NextResponse.json(
        { error: "Missing projectId or source" },
        { status: 400 },
      );
    }
    if (!textStr.trim()) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    // 5) Ensure user owns the project
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectIdStr)
      .eq("user_id", user.id)
      .single();

    if (projErr || !proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 6) Split → normalize → dedupe
    const parts = splitRawText(textStr).map(normalizeText);
    const unique = dedupeExact(parts.filter((t) => t.length > 0));

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "No valid entries found" },
        { status: 400 },
      );
    }

    // 7) Create upload batch
    const { data: upload, error: uploadErr } = await supabase
      .from("uploads")
      .insert({
        project_id: projectIdStr,
        user_id: user.id,
        source: sourceStr,
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

    // 8) Insert entries
    const entryRows = unique.map((t) => ({
      upload_id: upload.id,
      project_id: projectIdStr,
      user_id: user.id,
      source: sourceStr,
      text: t,
    }));

    await insertEntriesInChunks(supabase, entryRows);

    return NextResponse.json({ uploadId: upload.id, count: unique.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
