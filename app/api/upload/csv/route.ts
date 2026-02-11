import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeText, dedupeExact } from "@/lib/normalize";

function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };

  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    if (!inQuotes && ch === "\r") continue;

    cur += ch;
  }

  pushCell();
  pushRow();

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const objects = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").toString();
    });
    return obj;
  });

  return { headers, rows: objects };
}

function pickTextColumn(headers: string[]): string | null {
  const preferred = [
    "text",
    "review",
    "message",
    "comment",
    "feedback",
    "body",
    "description",
    "content",
  ];
  const normalized = headers.map((h) => ({
    original: h,
    key: h.trim().toLowerCase(),
  }));

  for (const p of preferred) {
    const match = normalized.find((h) => h.key === p);
    if (match) return match.original;
  }
  return headers.length ? headers[0] : null;
}

async function insertEntriesInChunks(
  supabase: SupabaseClient,
  rows: Array<{
    upload_id: string;
    project_id: string;
    user_id: string;
    source: string;
    content: string; // renamed
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    const { data: userData, error: userErr } =
      await supabase.auth.getUser(token);
    const user = userData.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: userErr?.message ?? "Unauthorized" },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const projectId = String(formData.get("projectId") ?? "");
    const source = String(formData.get("source") ?? "");
    const file = formData.get("file");

    if (!projectId || !source) {
      return NextResponse.json(
        { error: "Missing projectId or source" },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
    }

    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projErr || !proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const csvText = await file.text();
    const parsed = parseCsv(csvText);

    const textCol = pickTextColumn(parsed.headers);
    if (!textCol) {
      return NextResponse.json(
        { error: "No CSV columns found" },
        { status: 400 },
      );
    }

    const rawTexts = parsed.rows.map((r) => normalizeText(r[textCol] ?? ""));
    const unique = dedupeExact(rawTexts.filter((t) => t.length > 0));

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "No valid text rows found in CSV" },
        { status: 400 },
      );
    }

    const { data: upload, error: uploadErr } = await supabase
      .from("uploads")
      .insert({
        project_id: projectId,
        user_id: user.id,
        source,
        original_filename: file.name,
      })
      .select("id")
      .single();

    if (uploadErr || !upload) {
      return NextResponse.json(
        { error: uploadErr?.message ?? "Upload insert failed" },
        { status: 500 },
      );
    }

    // INSERT INTO content (not text)
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
