import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RunRow = {
  id: string;
  project_id: string;
  user_id: string;
  scope: "upload" | "project";
  upload_id: string | null;
  source_filter: "all" | "reviews" | "support" | "surveys";
};

type FeedbackEntry = {
  id: string;
  text: string; // aliased from feedback_entries.content
  source: "reviews" | "support" | "surveys";
  upload_id: string;
};

type ProblemBucket = {
  key: BucketKey;
  title: string;
  entryIds: string[];
  sources: Set<string>;
  quotes: { text: string; source: string; entry_id: string }[];
};

type BucketKey =
  | "pricing"
  | "checkout"
  | "login"
  | "performance"
  | "crash_bug"
  | "ui_ux"
  | "mobile"
  | "support"
  | "other";

type DeltaItem = {
  title: string;
  prev_count?: number;
  curr_count?: number;
  delta?: number;
};

// Controls how many items you show per delta bucket (Top 3 or Top 5)
const TOP_DELTA_ITEMS = 5;

// For “resolved/new” correctness we must consider *all* bucket keys every time.
const ALL_BUCKET_KEYS: BucketKey[] = [
  "pricing",
  "checkout",
  "login",
  "performance",
  "crash_bug",
  "ui_ux",
  "mobile",
  "support",
  "other",
];

/**
 * Keyword rules (baseline MVP, deterministic).
 * IMPORTANT: order matters. We put PRICING before CHECKOUT to avoid "billing" overlap.
 * We also remove "billing" from checkout to avoid misclassification.
 */
const RULES: Array<{ key: BucketKey; match: RegExp }> = [
  // Pricing: plans, tiers, subscription, invoices, refunds, cancellation
  {
    key: "pricing",
    match:
      /\b(pricing|price|prices|plan|plans|tier|tiers|package|packages|subscription|subscriptions|subscribe|unsubscrib(e|ing)|cancel|cancellation|renew|renewal|upgrade|downgrade|trial|free trial|invoice|invoic(e|ed)|receipt|chargeback|refund|refunded|refunds|overcharg(e|ed)|billing cycle|billed|bill)\b/,
  },

  // Checkout & Payments: transaction success/failure, cart, card, apple/google pay, payment gateway
  {
    key: "checkout",
    match:
      /\b(checkout|cart|basket|purchase|buy now|place order|order|ordered|transaction|payment|payments|pay|paid|paying|card|credit card|debit card|visa|mastercard|amex|apple pay|google pay|paypal|stripe|gateway|processing fee|payment failed|declin(e|ed)|authorization|authorised|3ds|3-d secure)\b/,
  },

  // Login/Auth: sign in issues, OTP, password reset, session, 2FA
  {
    key: "login",
    match:
      /\b(login|log in|logged in|sign in|signin|sign-in|sign up|signup|register|registration|account|auth|authenticate|authentication|authorization|password|passcode|otp|one[- ]time|verification|verify|2fa|two[- ]factor|mfa|reset password|forgot password|magic link|session|token|invalid credential|locked out)\b/,
  },

  // Mobile-specific: device/platform keywords + common mobile terms
  {
    key: "mobile",
    match:
      /\b(mobile|phone|tablet|android|ios|iphone|ipad|samsung|pixel|oneplus|apk|play store|app store|touch id|face id|biometric|push notification|push notifications|notification|notifications)\b/,
  },

  // Performance: slow, lag, timeout, loading, freezes, hangs
  {
    key: "performance",
    match:
      /\b(slow|sluggish|lag|laggy|performance|loading|load time|takes forever|timeout|timed out|hang|hanging|freeze|freezes|freezing|stuck|spinning|buffering|unresponsive|latency|delay|delayed|crashes on load)\b/,
  },

  // Crash/Bug/Error: crash/crashed/crashing, error codes, broken flows
  {
    key: "crash_bug",
    match:
      /\b(crash|crashed|crashing|bug|bugs|glitch|issue|issues|error|errors|exception|stack trace|500|404|403|502|503|failed|failing|failure|broken|not working|doesn't work|does not work|cannot|can't|cant|won't|wont)\b/,
  },

  // UI/UX: confusion, navigation, cannot find, hard to use, steps, onboarding friction
  {
    key: "ui_ux",
    match:
      /\b(confusing|confused|ui|ux|user interface|user experience|hard to use|difficult|too many steps|too many clicks|can't find|cant find|cannot find|where is|navigation|layout|design|onboarding|setup|tutorial|unclear|not clear|misleading)\b/,
  },

  // Support experience: ticket delays, agents, response time
  {
    key: "support",
    match:
      /\b(support|ticket|tickets|help desk|helpdesk|agent|customer service|cs|response time|no response|waiting|escalat(e|ed)|resolved|unresolved)\b/,
  },
];

// ✅ Fix: normalize smart quotes + smart dashes so regex rules match reliably
function normalizeText(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'") // smart apostrophes → straight
    .replace(/[“”]/g, '"') // smart quotes → straight
    .replace(/[–—]/g, "-") // en/em dash → hyphen
    .replace(/\s+/g, " ")
    .trim();
}

function detectBucketKey(textRaw: string): BucketKey {
  const text = normalizeText(textRaw);

  // ✅ Priority override 1: TRUE crash/exception signals only
  const crashPriority =
    /\b(crash|crashed|crashing|exception|stack trace|segfault|panic|fatal error)\b|(?:\b(error)\b.*\b(500|502|503|504|429|404|403)\b)|(?:\b(500|502|503|504|429|404|403)\b)/;

  if (crashPriority.test(text)) return "crash_bug";

  // ✅ Priority override 2: navigation / findability issues are UI/UX
  const findability =
    /\b(can't find|cant find|cannot find|hard to find|where is|where do i|hidden|hard to locate|couldn't find|could not find)\b/;

  if (findability.test(text)) return "ui_ux";

  // ✅ Priority override 3: general UI/UX friction, but don't steal pure pricing confusion
  const uiPriority =
    /\b(confusing|confused|hard to use|difficult|too many steps|too many clicks|navigation|layout|unclear|not clear|misleading)\b/;

  const pricingStrong =
    /\b(pricing|price|plan|plans|tier|tiers|invoice|invoic(e|ed)|receipt|refund|refunded|chargeback|charged|billing|billed|renew|renewal|upgrade|downgrade|trial)\b/;

  // Note: subscription/cancel intentionally NOT included here,
  // because those often appear in "can't find cancel subscription" UX issues.
  if (uiPriority.test(text) && !pricingStrong.test(text)) return "ui_ux";

  // ✅ Otherwise, fall back to normal rules (order-based)
  for (const r of RULES) {
    if (r.match.test(text)) return r.key;
  }

  return "other";
}

function bucketTitle(key: BucketKey): string {
  switch (key) {
    case "checkout":
      return "Checkout & Payments Failing";
    case "login":
      return "Login / Authentication Issues";
    case "pricing":
      return "Pricing & Plan Confusion";
    case "performance":
      return "App Performance & Load Issues";
    case "crash_bug":
      return "Crashes, Errors & Broken Flows";
    case "ui_ux":
      return "Confusing UI / UX Friction";
    case "mobile":
      return "Mobile-Specific Issues";
    case "support":
      return "Support Experience Issues";
    default:
      return "Other Common Issues";
  }
}

/**
 * Quote picker that prefers quotes that match the bucket's own regex,
 * to avoid "billing" / overlap mistakes showing the wrong quote under a bucket.
 */
function pickTopQuotesForBucket(
  bucketKey: BucketKey,
  entries: FeedbackEntry[],
  max = 3,
) {
  const bucketRule = RULES.find((r) => r.key === bucketKey);

  const normalized = entries.map((e) => ({
    ...e,
    _norm: normalizeText(e.text),
  }));

  const matching = bucketRule
    ? normalized.filter((e) => bucketRule.match.test(e._norm))
    : normalized;

  const pool = matching.length > 0 ? matching : normalized;

  // Choose longer, more descriptive entries first
  const sorted = [...pool].sort(
    (a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0),
  );

  return sorted.slice(0, max).map((e) => ({
    text: e.text.length > 240 ? e.text.slice(0, 240) + "…" : e.text,
    source: e.source,
    entry_id: e.id,
  }));
}

// ---------------- Day 6: Feature-Level Pain Map ----------------

// Rule-based feature detection (MVP). Order matters — specific first.
const FEATURE_RULES: Array<{ feature: string; match: RegExp }> = [
  {
    feature: "Checkout",
    match: /\b(checkout|cart|basket|buy now|place order|order|ordered)\b/,
  },
  {
    feature: "Payments",
    match:
      /\b(payment|payments|pay|paid|paying|card|credit card|debit card|visa|mastercard|amex|paypal|apple pay|google pay|stripe|gateway|transaction|chargeback)\b/,
  },
  {
    feature: "Pricing",
    match:
      /\b(pricing|price|prices|plan|plans|tier|tiers|package|packages|invoice|invoic(e|ed)|receipt|refund|refunded|billing|billed|renew|renewal|upgrade|downgrade|trial)\b/,
  },
  {
    feature: "Login",
    match:
      /\b(login|log in|sign in|signin|sign-in|password|passcode|otp|2fa|two[- ]factor|mfa|reset password|forgot password|auth|authentication|magic link|session|token)\b/,
  },
  {
    feature: "Mobile",
    match:
      /\b(mobile|phone|tablet|android|ios|iphone|ipad|apk|play store|app store|touch id|face id|biometric)\b/,
  },
  {
    feature: "Performance",
    match:
      /\b(slow|sluggish|lag|laggy|timeout|timed out|loading|load time|freeze|freezes|freezing|stuck|unresponsive|latency|delay|delayed)\b/,
  },
  {
    feature: "Support",
    match:
      /\b(support|ticket|tickets|agent|help desk|helpdesk|customer service|response time|no response|waiting|escalat(e|ed))\b/,
  },
  {
    feature: "Onboarding",
    match:
      /\b(onboarding|setup|tutorial|get started|getting started|walkthrough)\b/,
  },
  {
    feature: "Notifications",
    match:
      /\b(notification|notifications|push notification|push notifications|email notification)\b/,
  },
];

function detectFeatures(textRaw: string): string[] {
  const t = normalizeText(textRaw);
  const hits: string[] = [];
  for (const r of FEATURE_RULES) {
    if (r.match.test(t)) hits.push(r.feature);
  }
  return Array.from(new Set(hits));
}

// ---------------- Day 7: Run Deltas (improved) ----------------

async function findPreviousCompletedRun(
  projectId: string,
  currentRunId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("runs")
    .select(
      "id, project_id, user_id, scope, upload_id, source_filter, created_at, status",
    )
    .eq("project_id", projectId)
    .eq("status", "completed")
    .neq("id", currentRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as RunRow | null) ?? null;
}

async function loadFeedbackForRun(run: RunRow) {
  let q = supabaseAdmin
    .from("feedback_entries")
    .select("id, text:content, source, upload_id");

  if (run.scope === "upload") {
    if (!run.upload_id) {
      throw new Error("Previous run scope is upload but upload_id is missing.");
    }
    q = q.eq("upload_id", run.upload_id);
  } else {
    q = q.eq("project_id", run.project_id);
  }

  if (run.source_filter !== "all") {
    q = q.eq("source", run.source_filter);
  }

  // same safety limit you already use
  q = q.limit(2000);

  const { data, error } = await q;
  if (error) {
    throw new Error(
      `Failed to load feedback entries for previous run: ${error.message}`,
    );
  }

  return ((data ?? []) as FeedbackEntry[]).filter(
    (e) => typeof e.text === "string" && e.text.trim().length > 0,
  );
}

function computeAllBucketCountsFromFeedback(feedback: FeedbackEntry[]) {
  const counts = new Map<BucketKey, number>();
  for (const k of ALL_BUCKET_KEYS) counts.set(k, 0);

  for (const e of feedback) {
    const key = detectBucketKey(e.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function computeDeltaBucketsFromCounts(
  prevCounts: Map<BucketKey, number>,
  currCounts: Map<BucketKey, number>,
) {
  const new_problems: DeltaItem[] = [];
  const worsening: DeltaItem[] = [];
  const improving: DeltaItem[] = [];
  const resolved: DeltaItem[] = [];

  for (const key of ALL_BUCKET_KEYS) {
    const prev = prevCounts.get(key) ?? 0;
    const curr = currCounts.get(key) ?? 0;
    const title = bucketTitle(key);

    if (prev === 0 && curr > 0) {
      new_problems.push({ title, curr_count: curr });
      continue;
    }

    if (prev > 0 && curr === 0) {
      resolved.push({ title, prev_count: prev });
      continue;
    }

    if (prev > 0 && curr > 0 && curr !== prev) {
      const delta = curr - prev;
      if (delta > 0) {
        worsening.push({ title, prev_count: prev, curr_count: curr, delta });
      } else {
        improving.push({ title, prev_count: prev, curr_count: curr, delta }); // negative
      }
    }
  }

  // decision-first sorting + limiting to Top N per bucket
  new_problems.sort((a, b) => (b.curr_count ?? 0) - (a.curr_count ?? 0));
  worsening.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  improving.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)); // most negative first
  resolved.sort((a, b) => (b.prev_count ?? 0) - (a.prev_count ?? 0));

  return {
    new_problems: new_problems.slice(0, TOP_DELTA_ITEMS),
    worsening: worsening.slice(0, TOP_DELTA_ITEMS),
    improving: improving.slice(0, TOP_DELTA_ITEMS),
    resolved: resolved.slice(0, TOP_DELTA_ITEMS),
  };
}

export async function processRun(runId: string) {
  // 1) Load the run
  const { data: run, error: runErr } = await supabaseAdmin
    .from("runs")
    .select("id, project_id, user_id, scope, upload_id, source_filter")
    .eq("id", runId)
    .single();

  if (runErr || !run) throw new Error("Run not found.");

  const r = run as RunRow;

  // 2) Load matching feedback entries (content aliased to text)
  let q = supabaseAdmin
    .from("feedback_entries")
    .select("id, text:content, source, upload_id");

  if (r.scope === "upload") {
    if (!r.upload_id) {
      throw new Error("Run scope is upload but upload_id is missing.");
    }
    q = q.eq("upload_id", r.upload_id);
  } else {
    q = q.eq("project_id", r.project_id);
  }

  if (r.source_filter !== "all") {
    q = q.eq("source", r.source_filter);
  }

  // MVP safety limit
  q = q.limit(2000);

  const { data: entries, error: entriesErr } = await q;
  if (entriesErr) {
    throw new Error(`Failed to load feedback entries: ${entriesErr.message}`);
  }

  // Keep only safe/usable rows
  const feedback = ((entries ?? []) as FeedbackEntry[]).filter(
    (e) => typeof e.text === "string" && e.text.trim().length > 0,
  );

  // 3) If no entries, clear problems/features/deltas and exit
  if (feedback.length === 0) {
    await supabaseAdmin.from("run_problems").delete().eq("run_id", runId);
    await supabaseAdmin.from("run_features").delete().eq("run_id", runId);
    await supabaseAdmin.from("run_deltas").delete().eq("current_run_id", runId);
    // ✅ Clear mappings too (avoid stale evidence)
    await supabaseAdmin
      .from("run_problem_entries")
      .delete()
      .eq("run_id", runId);
    return { created: 0, features: 0, deltas: false };
  }

  // 4) Build buckets (used for Top Problems only)
  const buckets = new Map<BucketKey, ProblemBucket>();

  for (const e of feedback) {
    const key = detectBucketKey(e.text);
    const title = bucketTitle(key);

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        title,
        entryIds: [],
        sources: new Set<string>(),
        quotes: [],
      });
    }

    const b = buckets.get(key)!;
    b.entryIds.push(e.id);
    b.sources.add(e.source);
  }

  // 5) Rank buckets by size (mention count)
  const ranked = [...buckets.values()].sort(
    (a, b) => b.entryIds.length - a.entryIds.length,
  );

  // Keep top 5 for run_problems (unchanged)
  const top = ranked.slice(0, 5);

  // 6) Prepare rows for insertion (with quote selection tied to bucket)
  const rows = top.map((b, idx) => {
    const bucketEntries = feedback.filter((e) => b.entryIds.includes(e.id));
    const quotes = pickTopQuotesForBucket(b.key, bucketEntries, 3);

    return {
      run_id: runId,
      rank: idx + 1,
      title: b.title,
      summary: null,
      mention_count: b.entryIds.length,
      sources: Array.from(b.sources),
      quotes, // jsonb
    };
  });

  // 7) Idempotent: clear existing problems for this run, then insert fresh
  await supabaseAdmin.from("run_problems").delete().eq("run_id", runId);

  // Insert and RETURN inserted rows (we need their IDs)
  const { data: insertedProblems, error: insertErr } = await supabaseAdmin
    .from("run_problems")
    .insert(rows)
    .select("id, title");

  if (insertErr) {
    throw new Error(`Failed to write run problems: ${insertErr.message}`);
  }

  if (!insertedProblems || insertedProblems.length === 0) {
    throw new Error("Inserted problems missing.");
  }

  // ----------------------------------------------------
  // ✅ Persist feedback_entry → problem mapping
  // ----------------------------------------------------

  // ✅ Clear previous mappings for THIS RUN (safe + complete)
  await supabaseAdmin.from("run_problem_entries").delete().eq("run_id", runId);

  // Map title → problem_id (DB IDs)
  const titleToProblemId = new Map<string, string>();
  for (const p of insertedProblems) {
    titleToProblemId.set(p.title, p.id);
  }

  // Build mapping rows (include run_id)
  const mappingRows: Array<{
    run_id: string;
    problem_id: string;
    feedback_entry_id: string;
  }> = [];

  for (const b of top) {
    const problemId = titleToProblemId.get(b.title);
    if (!problemId) continue;

    for (const entryId of b.entryIds) {
      mappingRows.push({
        run_id: runId,
        problem_id: problemId,
        feedback_entry_id: entryId,
      });
    }
  }

  // Insert mappings
  if (mappingRows.length > 0) {
    const { error: mapErr } = await supabaseAdmin
      .from("run_problem_entries")
      .insert(mappingRows);

    if (mapErr) {
      throw new Error(
        `Failed to write problem-entry mappings: ${mapErr.message}`,
      );
    }
  }

  // ---------------- Day 6: write run_features (Feature-Level Pain Map) ----------------

  // Map entry_id -> problem title (based on bucket titles)
  const entryIdToProblemTitle = new Map<string, string>();
  for (const b of top) {
    for (const entryId of b.entryIds) {
      entryIdToProblemTitle.set(entryId, b.title);
    }
  }

  // Aggregate per feature
  const featureAgg = new Map<
    string,
    { mention_count: number; problemCounts: Map<string, number> }
  >();

  for (const e of feedback) {
    const feats = detectFeatures(e.text);
    if (feats.length === 0) continue;

    const pTitle = entryIdToProblemTitle.get(e.id) ?? "Other Common Issues";

    for (const f of feats) {
      if (!featureAgg.has(f)) {
        featureAgg.set(f, { mention_count: 0, problemCounts: new Map() });
      }
      const agg = featureAgg.get(f)!;
      agg.mention_count += 1;
      agg.problemCounts.set(pTitle, (agg.problemCounts.get(pTitle) ?? 0) + 1);
    }
  }

  const featureRows = Array.from(featureAgg.entries())
    .map(([feature, agg]) => {
      let dominant_problem: string | null = null;
      let best = 0;

      for (const [pTitle, cnt] of agg.problemCounts.entries()) {
        if (cnt > best) {
          best = cnt;
          dominant_problem = pTitle;
        }
      }

      return {
        run_id: runId,
        feature,
        mention_count: agg.mention_count,
        dominant_problem,
      };
    })
    .sort((a, b) => b.mention_count - a.mention_count)
    .slice(0, 12);

  // Idempotent write for this run
  await supabaseAdmin.from("run_features").delete().eq("run_id", runId);

  if (featureRows.length > 0) {
    const { error: featErr } = await supabaseAdmin
      .from("run_features")
      .insert(featureRows);

    if (featErr) {
      throw new Error(`Failed to write run features: ${featErr.message}`);
    }
  }

  // ---------------- Day 7 (updated): deltas computed from ALL buckets ----------------

  let deltasSaved = false;

  const prevRun = await findPreviousCompletedRun(r.project_id, runId);

  if (!prevRun) {
    // First run: ensure no stale delta row exists for this run
    await supabaseAdmin.from("run_deltas").delete().eq("current_run_id", runId);
  } else {
    // Load previous run's feedback and compute counts
    const prevFeedback = await loadFeedbackForRun(prevRun);
    const prevCounts = computeAllBucketCountsFromFeedback(prevFeedback);

    // Current run counts computed from current feedback (no extra query)
    const currCounts = computeAllBucketCountsFromFeedback(feedback);

    const { new_problems, worsening, improving, resolved } =
      computeDeltaBucketsFromCounts(prevCounts, currCounts);

    // Idempotent save: delete then insert
    await supabaseAdmin.from("run_deltas").delete().eq("current_run_id", runId);

    const { error: deltaInsErr } = await supabaseAdmin
      .from("run_deltas")
      .insert({
        project_id: r.project_id,
        user_id: r.user_id,
        current_run_id: runId,
        previous_run_id: prevRun.id,
        new_problems,
        worsening,
        improving,
        resolved,
      });

    if (deltaInsErr) {
      throw new Error(`Failed to write run deltas: ${deltaInsErr.message}`);
    }

    deltasSaved = true;
  }

  return {
    created: rows.length,
    features: featureRows.length,
    deltas: deltasSaved,
    previous_run_id: prevRun?.id ?? null,
  };
}
