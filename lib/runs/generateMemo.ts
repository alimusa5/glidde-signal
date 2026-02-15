// libs/runs/generateMemo.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type DeltaItem = {
  title: string;
  prev_count?: number;
  curr_count?: number;
  delta?: number; // worsening positive, improving negative
};

type MemoInput = {
  runId: string;
  projectId: string;
  userId: string;
  topProblems: Array<{
    title: string;
    mention_count: number;
    summary?: string | null;
    quotes?: Array<{ text: string; source: string; entry_id: string }>;
  }>;
  deltas: {
    new_problems: DeltaItem[];
    worsening: DeltaItem[];
    improving: DeltaItem[];
    resolved: DeltaItem[];
  };
  featureMap: Array<{
    feature: string;
    mention_count: number;
    dominant_problem: string | null;
  }>;
};

type MemoOutput = {
  executiveSummary: string;
  customerReality: string;
  gotWorse: string[];
  improved: string[];
  recommendedActions: string[]; // exactly 3
};

// -------------------- DB row typings --------------------

type RunRowLite = {
  id: string;
  project_id: string;
  user_id: string;
  status: string;
};

type RunProblemRow = {
  title: string;
  summary: string | null;
  mention_count: number;
  quotes: Array<{ text: string; source: string; entry_id: string }> | null;
  rank: number;
};

type RunDeltasRow = {
  new_problems: DeltaItem[] | null;
  worsening: DeltaItem[] | null;
  improving: DeltaItem[] | null;
  resolved: DeltaItem[] | null;
};

type RunFeatureRow = {
  feature: string;
  mention_count: number;
  dominant_problem: string | null;
};

// -------------------- helpers --------------------

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars for service client.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY.");
  return new OpenAI({ apiKey: key });
}

function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function formatMemoText(m: MemoOutput) {
  const bullet = (items: string[]) => items.map((x) => `• ${x}`).join("\n");

  return [
    "Executive Summary",
    m.executiveSummary.trim(),
    "",
    "This Month’s Customer Reality",
    m.customerReality.trim(),
    "",
    "What Got Worse",
    bullet(m.gotWorse),
    "",
    "What Improved",
    bullet(m.improved),
    "",
    "Top 3 Recommended Actions",
    m.recommendedActions.map((x) => x.trim()).join("\n"),
  ].join("\n");
}

export async function generateMemo(
  runId: string,
): Promise<{ memoText: string; memoJson: MemoOutput; input: MemoInput }> {
  const supabase = getServiceSupabase();

  // 1) Load run
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .select("id, project_id, user_id, status")
    .eq("id", runId)
    .single<RunRowLite>();

  if (runErr) throw new Error(`Failed to load run: ${runErr.message}`);
  if (!run) throw new Error("Run not found.");
  if (run.status !== "completed") throw new Error("Run is not completed.");

  // 2) Load top problems
  const { data: problems, error: pErr } = await supabase
    .from("run_problems")
    .select("title, summary, mention_count, quotes, rank")
    .eq("run_id", runId)
    .order("rank", { ascending: true })
    .limit(5)
    .returns<RunProblemRow[]>();

  if (pErr) throw new Error(`Failed to load run_problems: ${pErr.message}`);

  // 3) Load deltas (single row per run)
  const { data: deltaRow, error: dErr } = await supabase
    .from("run_deltas")
    .select("new_problems, worsening, improving, resolved")
    .eq("current_run_id", runId)
    .maybeSingle<RunDeltasRow>();

  if (dErr) throw new Error(`Failed to load run_deltas: ${dErr.message}`);

  const deltas = {
    new_problems: safeArray<DeltaItem>(deltaRow?.new_problems),
    worsening: safeArray<DeltaItem>(deltaRow?.worsening),
    improving: safeArray<DeltaItem>(deltaRow?.improving),
    resolved: safeArray<DeltaItem>(deltaRow?.resolved),
  };

  // 4) Load feature map
  const { data: features, error: fErr } = await supabase
    .from("run_features")
    .select("feature, mention_count, dominant_problem")
    .eq("run_id", runId)
    .order("mention_count", { ascending: false })
    .limit(12)
    .returns<RunFeatureRow[]>();

  if (fErr) throw new Error(`Failed to load run_features: ${fErr.message}`);

  const input: MemoInput = {
    runId: run.id,
    projectId: run.project_id,
    userId: run.user_id,
    topProblems: (problems ?? []).map((p) => ({
      title: p.title,
      mention_count: p.mention_count ?? 0,
      summary: p.summary ?? null,
      quotes: safeArray<{ text: string; source: string; entry_id: string }>(
        p.quotes,
      ),
    })),
    deltas,
    featureMap: (features ?? []).map((x) => ({
      feature: x.feature,
      mention_count: x.mention_count ?? 0,
      dominant_problem: x.dominant_problem ?? null,
    })),
  };

  // 5) OpenAI call (Structured Output)
  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const schema = {
    name: "ExecutiveMemo",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "executiveSummary",
        "customerReality",
        "gotWorse",
        "improved",
        "recommendedActions",
      ],
      properties: {
        executiveSummary: { type: "string", minLength: 40, maxLength: 520 },
        customerReality: { type: "string", minLength: 60, maxLength: 800 },
        gotWorse: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: { type: "string", minLength: 6, maxLength: 120 },
        },
        improved: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: { type: "string", minLength: 6, maxLength: 120 },
        },
        recommendedActions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          // ✅ Increase per-action max length to prevent truncation
          items: { type: "string", minLength: 12, maxLength: 220 },
        },
      },
    },
  } as const;

  const system = [
    "You are a product intelligence assistant.",
    "You interpret structured customer feedback outputs and convert them into a conservative executive memo.",
    "Do NOT speculate. Do NOT invent metrics or percentages. Do NOT claim causation.",
    "Only reference problem titles/features that exist in the input JSON.",
    "Use safe, actionable language: Investigate, Validate, Monitor, Simplify, Clarify.",
    "Avoid: massive overhaul, complete redesign, guaranteed outcomes.",
    "Do not end any sentence mid-thought. Finish sentences.",
    // ✅ Increase overall budget so the model can finish actions
    "Keep the full memo under ~3200 characters total.",
    "Keep it one page, plain English.",
  ].join(" ");

  const user = [
    "Write an executive decision memo from the INPUT JSON.",
    "Rules:",
    "- Use only the titles/features present in the input (no new problem names).",
    "- If deltas are empty, rely on topProblems + featureMap and say what to monitor.",
    "- gotWorse should primarily reflect deltas.worsening + deltas.new_problems (if present).",
    "- improved should primarily reflect deltas.improving + deltas.resolved (if present).",
    "- Each recommended action must explicitly mention a problem title or feature from the input (no generic actions).",
    "- recommendedActions must be exactly 3 concise, safe actions (Investigate/Validate/Monitor/Simplify/Clarify).",
    "- Each recommended action must be written as a short bullet-style sentence (no numbering).",
    "- Do NOT prefix with 1., 2., 3. — they will be rendered as bullets in UI.",
    "- Do not include extra headings beyond the required sections.",
    "",
    "INPUT JSON:",
    JSON.stringify(input),
  ].join("\n");

  const resp = await openai.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        schema: schema.schema,
        strict: true,
      },
    },
  });

  const jsonText = resp.output_text;
  if (!jsonText) throw new Error("OpenAI returned empty memo JSON.");

  let memoJson: MemoOutput;
  try {
    memoJson = JSON.parse(jsonText) as MemoOutput;
  } catch {
    throw new Error("Failed to parse memo JSON from OpenAI.");
  }

  const memoText = formatMemoText(memoJson);
  return { memoText, memoJson, input };
}
