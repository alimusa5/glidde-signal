import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifySignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return timingSafeEqual(digest, signatureHeader);
}

type Plan = "starter" | "pro";

function parsePlanFromCustomData(customData: unknown): Plan | null {
  if (!isRecord(customData)) return null;
  const plan = customData.plan;
  return plan === "starter" || plan === "pro" ? plan : null;
}

function parseSupabaseUserId(customData: unknown): string | null {
  if (!isRecord(customData)) return null;
  const id = customData.supabase_user_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function parseIsoDateToTimestamptz(value: string | null): string | null {
  // Supabase accepts ISO strings for timestamptz inserts/updates
  return value && value.length > 0 ? value : null;
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Lemon webhook endpoint reachable. Use POST for real webhooks.",
    },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
    const webhookSecret = assertEnv("LEMONSQUEEZY_WEBHOOK_SECRET");

    // 1) Raw body + signature verify
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");

    const signatureOk = verifySignature(rawBody, webhookSecret, signature);
    if (!signatureOk) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2) Parse body
    const parsedUnknown: unknown = JSON.parse(rawBody);
    if (!isRecord(parsedUnknown)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const eventName = req.headers.get("x-event-name") ?? "unknown";

    // ✅ Allowlist (ignore everything else but still return 200 so Lemon won't retry)
    const allowed = new Set([
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_expired",
      "subscription_payment_failed",
      "subscription_payment_success",
    ]);

    if (!allowed.has(eventName)) {
      return NextResponse.json(
        { ok: true, ignored: true, event: eventName },
        { status: 200 },
      );
    }

    // payload.meta.custom_data contains our custom checkout data
    const meta = parsedUnknown.meta;
    const metaRec = isRecord(meta) ? meta : null;
    const customData = metaRec ? metaRec.custom_data : null;

    const supabaseUserId = parseSupabaseUserId(customData);
    if (!supabaseUserId) {
      return NextResponse.json(
        { error: "Missing supabase_user_id in custom_data" },
        { status: 400 },
      );
    }

    const plan = parsePlanFromCustomData(customData) ?? "starter";

    // 3) Extract subscription object
    const data = parsedUnknown.data;
    const dataRec = isRecord(data) ? data : null;

    const lemonSubscriptionId = dataRec ? pickString(dataRec, "id") : null;

    const attrs =
      dataRec && isRecord(dataRec.attributes)
        ? (dataRec.attributes as Record<string, unknown>)
        : {};

    // ✅ Robust status mapping
    const statusRaw = (pickString(attrs, "status") ?? "active").toLowerCase();

    let statusAllowed:
      | "active"
      | "trialing"
      | "past_due"
      | "paused"
      | "canceled"
      | "expired" = "active";

    if (statusRaw === "active") statusAllowed = "active";
    else if (statusRaw === "trialing") statusAllowed = "trialing";
    else if (statusRaw === "past_due") statusAllowed = "past_due";
    else if (statusRaw === "paused") statusAllowed = "paused";
    else if (statusRaw === "canceled" || statusRaw === "cancelled")
      statusAllowed = "canceled";
    else if (statusRaw === "expired") statusAllowed = "expired";
    else if (statusRaw === "unpaid") statusAllowed = "past_due";
    else statusAllowed = "active";

    // period fields may vary; we store whichever exists
    const currentPeriodStart =
      parseIsoDateToTimestamptz(pickString(attrs, "current_period_start")) ??
      parseIsoDateToTimestamptz(pickString(attrs, "created_at"));

    const currentPeriodEnd =
      parseIsoDateToTimestamptz(pickString(attrs, "current_period_end")) ??
      parseIsoDateToTimestamptz(pickString(attrs, "renews_at")) ??
      parseIsoDateToTimestamptz(pickString(attrs, "ends_at"));

    const lemonCustomerId =
      pickString(attrs, "customer_id") ?? pickString(attrs, "customer") ?? null;

    // 4) Upsert into Supabase
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (!lemonSubscriptionId) {
      return NextResponse.json(
        {
          error: "Missing subscription id in payload.data.id",
          event: eventName,
        },
        { status: 400 },
      );
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: supabaseUserId,
          lemon_subscription_id: lemonSubscriptionId,
          lemon_customer_id: lemonCustomerId,
          plan,
          status: statusAllowed,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
        },
        { onConflict: "lemon_subscription_id" },
      );

    if (upsertErr) {
      return NextResponse.json(
        {
          error: "DB upsert failed",
          details: upsertErr.message,
          event: eventName,
        },
        { status: 500 },
      );
    }

    // ✅ If a subscription becomes active/trialing, ensure it's the only "current" one
    // for this user. Demote any other active-like subs to canceled.
    if (statusAllowed === "active" || statusAllowed === "trialing") {
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("user_id", supabaseUserId)
        .neq("lemon_subscription_id", lemonSubscriptionId)
        .in("status", ["active", "trialing", "past_due", "paused"]);
    }

    return NextResponse.json({ ok: true, event: eventName }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
