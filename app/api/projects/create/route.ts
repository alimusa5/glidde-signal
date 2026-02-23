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

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const token = getBearerToken(req);
    if (!token)
      return NextResponse.json(
        { error: "Missing bearer token" },
        { status: 401 },
      );

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
    if (!isRecord(body))
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const nameVal = body.name;
    const name = typeof nameVal === "string" ? nameVal.trim() : "";

    if (!name)
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    if (name.length > 80)
      return NextResponse.json(
        { error: "Project name too long" },
        { status: 400 },
      );

    const userId = userData.user.id;

    // ✅ Billing gate: Starter = max 1 project
    const sub = await getActiveSubscriptionForUser(userId);

    // If no subscription, treat as Starter locked (or block completely)
    // Here: we block project creation unless user has active subscription.
    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) {
      return NextResponse.json(
        {
          error:
            "No active subscription. Please subscribe to create a project.",
        },
        { status: 402 },
      );
    }

    if (sub.plan === "starter") {
      const { count, error: countErr } = await supabaseAdmin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (countErr)
        return NextResponse.json({ error: countErr.message }, { status: 500 });

      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          {
            error:
              "Starter plan allows only 1 active project. Upgrade to Pro for unlimited projects.",
          },
          { status: 403 },
        );
      }
    }

    // Create project
    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({ name, user_id: userId })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create project" },
        { status: 500 },
      );
    }

    return NextResponse.json({ projectId: data.id }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
