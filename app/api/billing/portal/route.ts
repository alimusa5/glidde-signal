import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSubscriptionForUser } from "@/lib/billing/getSubscription";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length ? token : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractCustomerPortalUrl(lemonJson: unknown): string | null {
  if (!isRecord(lemonJson)) return null;
  const data = lemonJson.data;
  if (!isRecord(data)) return null;
  const attributes = data.attributes;
  if (!isRecord(attributes)) return null;
  const urls = attributes.urls;
  if (!isRecord(urls)) return null;
  const portal = urls.customer_portal;
  return typeof portal === "string" && portal.length > 0 ? portal : null;
}

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
    const lemonApiKey = assertEnv("LEMONSQUEEZY_API_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing bearer token" },
        { status: 401 },
      );
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { error: "Invalid user session" },
        { status: 401 },
      );
    }

    const userId = userData.user.id;

    // Find active subscription in our DB
    const sub = await getActiveSubscriptionForUser(userId);
    if (
      !sub ||
      (sub.status !== "active" &&
        sub.status !== "trialing" &&
        sub.status !== "past_due" &&
        sub.status !== "paused")
    ) {
      return NextResponse.json(
        { error: "No subscription found for this user." },
        { status: 404 },
      );
    }

    // We need the Lemon subscription id from our subscriptions table
    const { data: rows, error: rowErr } = await supabaseAdmin
      .from("subscriptions")
      .select("lemon_subscription_id, status, updated_at")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due", "paused"])
      .order("updated_at", { ascending: false })
      .limit(1);

    if (rowErr) {
      return NextResponse.json({ error: rowErr.message }, { status: 500 });
    }

    const lemonSubscriptionId = rows?.[0]?.lemon_subscription_id as
      | string
      | undefined;
    if (!lemonSubscriptionId) {
      return NextResponse.json(
        { error: "Missing lemon_subscription_id." },
        { status: 500 },
      );
    }

    // Request a fresh signed portal URL by retrieving the subscription (recommended) :contentReference[oaicite:1]{index=1}
    const lemonRes = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(lemonSubscriptionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${lemonApiKey}`,
          Accept: "application/vnd.api+json",
        },
      },
    );

    const lemonJson: unknown = await lemonRes.json();

    if (!lemonRes.ok) {
      return NextResponse.json(
        {
          error: "Failed to retrieve subscription from Lemon",
          details: lemonJson,
        },
        { status: 502 },
      );
    }

    const url = extractCustomerPortalUrl(lemonJson);
    if (!url) {
      return NextResponse.json(
        {
          error: "No customer_portal URL returned by Lemon",
          details: lemonJson,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
