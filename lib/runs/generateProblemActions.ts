// lib/runs/generateProblemActions.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type ProblemQuote = { text: string; source: string; entry_id: string };

type ProblemRow = {
  id: string;
  title: string;
  mention_count: number;
  quotes: ProblemQuote[];
};

type ProblemRowDb = ProblemRow & { rank?: number | null };

type LinkRow = { feedback_entry_id: string };

type FeedbackEntry = {
  id: string;
  content: string;
  source: string;
};

export type OwnerGuess =
  | "Backend"
  | "Frontend"
  | "Mobile"
  | "Product"
  | "Support"
  | "Data"
  | "Ops";

type ActionBundle = {
  problem_id: string;
  suggested_action: string;
  first_check: string;
  owner_guess: OwnerGuess;
  expected_impact: string;
};

const OWNER_ENUM: OwnerGuess[] = [
  "Backend",
  "Frontend",
  "Mobile",
  "Product",
  "Support",
  "Data",
  "Ops",
];

function truncate(text: string, max = 320) {
  if (!text) return "";
  const t = String(text).trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function sanitizeOwnerGuess(v: unknown): OwnerGuess {
  const raw = typeof v === "string" ? v.trim() : "";

  // exact enum match
  if ((OWNER_ENUM as string[]).includes(raw)) return raw as OwnerGuess;

  // soft mapping for common variants
  const lower = raw.toLowerCase();
  if (lower.includes("back")) return "Backend";
  if (lower.includes("front") || lower.includes("ui")) return "Frontend";
  if (
    lower.includes("ios") ||
    lower.includes("android") ||
    lower.includes("mobile")
  )
    return "Mobile";
  if (
    lower.includes("support") ||
    lower.includes("cs") ||
    lower.includes("success")
  )
    return "Support";
  if (lower.includes("data") || lower.includes("analytics")) return "Data";
  if (
    lower.includes("ops") ||
    lower.includes("devops") ||
    lower.includes("infra")
  )
    return "Ops";
  if (lower.includes("product") || lower.includes("pm")) return "Product";

  // safe default (routing hint)
  return "Product";
}

// small “tone hardening” pass to keep outputs conservative
function conservativeWording(text: string) {
  let t = text;

  // remove overconfident terms
  t = t.replace(
    /\b(root cause|definitely|guarantee|certainly|for sure)\b/gi,
    "contributors",
  );
  t = t.replace(/\b(likely to|very likely to|highly likely to)\b/gi, "may");
  t = t.replace(/\b(significant portion)\b/gi, "some");
  t = t.replace(/\b(moderate probability of)\b/gi, "may");

  // avoid assuming tools exist
  t = t.replace(/\b(analytics)\b/gi, "analytics (if available)");
  t = t.replace(
    /\b(monitor|monitoring)\b/gi,
    "check (and add temporary monitoring if needed)",
  );
  t = t.replace(/\blogs\b/gi, "logs (if available)");

  // avoid assuming “recent changes”
  t = t.replace(/\brecent changes\b/gi, "recent releases/changes (if any)");

  // ✅ FIX: remove duplicate "(if available)" caused by multiple passes
  t = t.replace(/\(if available\)\s*\(if available\)/gi, "(if available)");

  return t.trim().replace(/\s+/g, " ");
}

function clampNonEmpty(text: string, fallback: string, max: number) {
  const v = truncate(text, max);
  return v.length ? v : fallback;
}

export async function generateProblemActions(
  runId: string,
): Promise<ActionBundle[]> {
  // 1) Load Top problems for run (already ranked)
  const { data: problemsRaw, error: probErr } = await supabaseAdmin
    .from("run_problems")
    .select("id, title, mention_count, quotes, rank")
    .eq("run_id", runId)
    .order("rank", { ascending: true });

  if (probErr)
    throw new Error(`Failed to load run problems: ${probErr.message}`);

  const problems = (problemsRaw ?? []) as ProblemRowDb[];
  if (problems.length === 0) return [];

  const results: ActionBundle[] = [];

  // System prompt: conservative + no assumptions + strict enum
  const systemPrompt = `
You are an operational decision assistant for startup founders.

Your job is to convert customer pain into a clear, sprint-ready action.

CORE BEHAVIOR:
- Be decisive.
- Be concise.
- Be operational.
- No fluff.
- No consultant-style writing.

HARD RULES:

Brevity:
- suggested_action must be 1–2 sentences.
- Maximum 2 concrete steps.
- Do NOT list multiple investigation branches.
- Do NOT create multi-phase plans.
- Write like a Jira ticket instruction.

First Check:
- Must be a single step.
- Must be doable in under 30 minutes.
- Must validate whether the problem is real and measurable.

Assumptions:
- Do NOT assume tools, monitoring, analytics, vendors, or telemetry exist.
- If referencing logs, say: "check logs (if available)".
- Do NOT assume “recent changes” unless evidence mentions it.
- Do NOT invent technical details not present in evidence.

Language:
- Avoid certainty words: root cause, definitely, highly likely, significant.
- Prefer: may, confirm, validate, aim to.
- Avoid vague phrases like: coordinate with, review recent deployments, check with provider — unless explicitly supported by evidence.

- If evidence includes both positive and negative statements about the same area, acknowledge mixed evidence and propose a confirmatory first check.

Owner Constraint:
- owner_guess must be EXACTLY one of:
  Backend, Frontend, Mobile, Product, Support, Data, Ops
- No other values allowed.

Tone:
- Crisp.
- Direct.
- Operator-grade.
- Feels like a sprint task, not a strategic memo.

Return ONLY valid JSON with exactly these keys:
suggested_action, first_check, owner_guess, expected_impact
`.trim();

  for (const problem of problems) {
    // 2) Load up to 12 mapped feedback entries (evidence)
    const { data: linksRaw, error: linkErr } = await supabaseAdmin
      .from("run_problem_entries")
      .select("feedback_entry_id")
      .eq("problem_id", problem.id)
      .limit(12);

    if (linkErr) {
      throw new Error(`Failed to load run_problem_entries: ${linkErr.message}`);
    }

    const links = (linksRaw ?? []) as LinkRow[];
    const entryIds = links.map((l) => l.feedback_entry_id).filter(Boolean);

    // ✅ Guardrail: if we have no mapped entries, do NOT call the LLM.
    // IMPORTANT: this should be rare; if it happens often, your mapping pipeline is broken.
    if (entryIds.length === 0) {
      results.push({
        problem_id: problem.id,
        suggested_action:
          "Gather 5 representative examples and map them to this problem so actions can be generated from evidence.",
        first_check:
          "Confirm whether this problem has any mapped feedback entries for this run.",
        owner_guess: "Product",
        expected_impact:
          "May prevent generic guidance by ensuring actions are generated from real evidence.",
      });
      continue;
    }

    // Load evidence entries
    const { data: entriesRaw, error: entryErr } = await supabaseAdmin
      .from("feedback_entries")
      .select("id, content, source")
      .in("id", entryIds);

    if (entryErr) {
      throw new Error(`Failed to load feedback entries: ${entryErr.message}`);
    }

    const evidenceEntries = (entriesRaw ?? []) as FeedbackEntry[];

    // ✅ Additional guardrail: mapping exists but entries lookup returned nothing (IDs mismatch / stale refs)
    if (evidenceEntries.length === 0) {
      results.push({
        problem_id: problem.id,
        suggested_action:
          "Fix evidence linking for this problem, then regenerate actions so recommendations are based on real feedback.",
        first_check:
          "Verify run_problem_entries.feedback_entry_id values exist in feedback_entries for this run.",
        owner_guess: "Data",
        expected_impact:
          "May restore evidence-based actions and prevent generic recommendations.",
      });
      continue;
    }

    const evidence = evidenceEntries.map((e) => ({
      id: e.id,
      source: e.source,
      text: truncate(e.content, 320),
    }));

    const quoteTexts = (problem.quotes ?? [])
      .slice(0, 3)
      .map((q) => truncate(q.text, 240));

    // 3) Prompt payload (structured, minimal, deterministic)
    const userPayload = {
      problem: {
        title: problem.title,
        mention_count: problem.mention_count,
        representative_quotes: quoteTexts,
        evidence_entries: evidence,
      },
      output_rules: {
        owner_guess_enum: OWNER_ENUM,
        max_lengths: {
          suggested_action: 300,
          first_check: 200,
          expected_impact: 250,
        },
      },
    };

    // 4) LLM call (JSON mode)
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    let parsedObj: Record<string, unknown> = {};
    try {
      const parsedUnknown: unknown = JSON.parse(raw);
      if (isRecord(parsedUnknown)) parsedObj = parsedUnknown;
    } catch {
      parsedObj = {};
    }

    // 5) Post-process: enforce enum + conservative wording + length limits
    const suggested_action = conservativeWording(
      clampNonEmpty(
        getString(parsedObj, "suggested_action"),
        "Identify the most common failure mode and propose a small fix or an instrumentation step.",
        300,
      ),
    );

    const first_check = conservativeWording(
      clampNonEmpty(
        getString(parsedObj, "first_check"),
        "Pick one recent example and reproduce or inspect logs (if available) to confirm the failure pattern.",
        200,
      ),
    );

    const expected_impact = conservativeWording(
      clampNonEmpty(
        getString(parsedObj, "expected_impact"),
        "May reduce related support volume and improve reliability once confirmed and addressed.",
        250,
      ),
    );

    const owner_guess = sanitizeOwnerGuess(parsedObj["owner_guess"]);

    results.push({
      problem_id: problem.id,
      suggested_action: truncate(suggested_action, 300),
      first_check: truncate(first_check, 200),
      owner_guess,
      expected_impact: truncate(expected_impact, 250),
    });
  }

  return results;
}
