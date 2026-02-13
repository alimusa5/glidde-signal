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
      /\b(mobile|phone|tablet|android|ios|iphone|ipad|samsung|pixel|oneplus|apk|play store|app store|touch id|face id|biometric|push notification|notification)\b/,
  },

  // Performance: slow, lag, timeout, loading, freezes, hangs
  {
    key: "performance",
    match:
      /\b(slow|sluggish|lag|laggy|performance|loading|load time|takes forever|timeout|timed out|hang|hanging|freeze|freezing|stuck|spinning|buffering|unresponsive|latency|delay|delayed|crashes on load)\b/,
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

function normalizeText(input: string) {
  return (input || "").toLowerCase().replace(/\s+/g, " ").trim();
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
      /\b(slow|sluggish|lag|laggy|timeout|timed out|loading|load time|freeze|freezing|stuck|unresponsive|latency|delay|delayed)\b/,
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
      /\b(notification|notifications|push notification|email notification)\b/,
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

  // 3) If no entries, clear problems/features and exit
  if (feedback.length === 0) {
    await supabaseAdmin.from("run_problems").delete().eq("run_id", runId);
    await supabaseAdmin.from("run_features").delete().eq("run_id", runId);
    return { created: 0 };
  }

  // 4) Build buckets
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

  // Keep top 5
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

  const { error: insertErr } = await supabaseAdmin
    .from("run_problems")
    .insert(rows);

  if (insertErr) {
    throw new Error(`Failed to write run problems: ${insertErr.message}`);
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

  return { created: rows.length, features: featureRows.length };
}
