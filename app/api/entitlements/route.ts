import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getEntitlements } from "@/lib/entitlements";

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey);

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing auth token." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: "Not authorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const userId = userData.user.id;

    const entitlements = await getEntitlements({
      supabase: supabaseAdmin,
      userId,
    });

    return NextResponse.json(
      { entitlements },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
