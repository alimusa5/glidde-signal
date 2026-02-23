import { createClient } from "@supabase/supabase-js";

export type Plan = "starter" | "pro";
export type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired";

export type Subscription = {
  plan: Plan;
  status: SubStatus;
  current_period_start: string | null;
  current_period_end: string | null;
};

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function getActiveSubscriptionForUser(
  userId: string,
): Promise<Subscription | null> {
  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Prefer active/trialing/past_due/paused in that order
  const preferredStatuses: SubStatus[] = [
    "active",
    "trialing",
    "past_due",
    "paused",
  ];

  for (const status of preferredStatuses) {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status,current_period_start,current_period_end,updated_at")
      .eq("user_id", userId)
      .eq("status", status)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      const row = data[0] as {
        plan: Plan;
        status: SubStatus;
        current_period_start: string | null;
        current_period_end: string | null;
      };

      return {
        plan: row.plan,
        status: row.status,
        current_period_start: row.current_period_start,
        current_period_end: row.current_period_end,
      };
    }
  }

  return null;
}
