import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Plan = "starter" | "pro";
type CheckoutRequestBody = { plan?: Plan };

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCheckoutUrl(lemonJson: unknown): string | null {
  if (!isRecord(lemonJson)) return null;

  const data = lemonJson.data;
  if (!isRecord(data)) return null;

  const attributes = data.attributes;
  if (!isRecord(attributes)) return null;

  const url = attributes.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length ? token : null;
}

function getVariantId(plan: Plan): string {
  const starter = process.env.LEMONSQUEEZY_STARTER_VARIANT_ID;
  const pro = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;

  if (plan === "starter" && starter) return starter;
  if (plan === "pro" && pro) return pro;

  throw new Error("Missing Lemon Squeezy variant id env var");
}

export async function POST(req: NextRequest) {
  try {
    // Required env vars
    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
    const lemonApiKey = assertEnv("LEMONSQUEEZY_API_KEY");
    const storeId = assertEnv("LEMONSQUEEZY_STORE_ID");
    const appUrl = assertEnv("NEXT_PUBLIC_APP_URL");

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

    // Body
    const body: unknown = await req.json();
    const parsed = isRecord(body) ? (body as CheckoutRequestBody) : {};
    const plan = parsed.plan;

    if (plan !== "starter" && plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const variantId = getVariantId(plan);

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          // ✅ Redirect goes here (per Lemon docs)
          product_options: {
            redirect_url: `${appUrl}/billing/success`,
          },
          checkout_data: {
            custom: {
              supabase_user_id: userData.user.id,
              supabase_email: userData.user.email ?? "",
              plan,
            },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    };

    const lemonRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lemonApiKey}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(payload),
    });

    const lemonJson: unknown = await lemonRes.json();

    if (!lemonRes.ok) {
      return NextResponse.json(
        { error: "Failed to create checkout", details: lemonJson },
        { status: 500 },
      );
    }

    const checkoutUrl = extractCheckoutUrl(lemonJson);
    if (!checkoutUrl) {
      return NextResponse.json(
        {
          error: "No checkout URL returned by Lemon Squeezy",
          details: lemonJson,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ checkoutUrl }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
