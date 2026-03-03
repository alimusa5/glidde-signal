"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Topbar from "@/components/app/Topbar";

type Plan = "starter" | "pro";

export default function BillingPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);

  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = useMemo(
    () => openingPortal || loadingPlan !== null,
    [openingPortal, loadingPlan],
  );

  // Ensure authenticated + get email for topbar
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? null);
    }
    init();
  }, [router]);

  async function startCheckout(plan: Plan) {
    setError(null);
    setLoadingPlan(plan);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const token = data.session?.access_token;
      if (!token) throw new Error("You are not logged in.");

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as Record<string, unknown>).error)
            : "Checkout failed";
        throw new Error(msg);
      }

      const checkoutUrl =
        typeof json === "object" && json !== null && "checkoutUrl" in json
          ? String((json as Record<string, unknown>).checkoutUrl)
          : null;

      if (!checkoutUrl) throw new Error("Missing checkout URL.");

      window.location.href = checkoutUrl;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setLoadingPlan(null);
    }
  }

  async function openCustomerPortal() {
    setError(null);
    setOpeningPortal(true);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const token = data.session?.access_token;
      if (!token) throw new Error("You are not logged in.");

      const res = await fetch("/api/billing/portal", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as Record<string, unknown>).error)
            : "Failed to open billing portal";
        throw new Error(msg);
      }

      const url =
        typeof json === "object" && json !== null && "url" in json
          ? String((json as Record<string, unknown>).url)
          : null;

      if (!url) throw new Error("Missing portal URL.");

      window.location.href = url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setOpeningPortal(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={email} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Billing</h1>
            <p className="mt-2 text-muted-foreground">
              Choose a plan to activate subscriptions inside Glidde Signal.
            </p>
          </div>

          <button
            onClick={openCustomerPortal}
            disabled={busy}
            className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
          >
            {openingPortal ? "Opening..." : "Manage Billing"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Plans */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Starter */}
          <PlanCard
            name="Starter"
            price="$199"
            cadence="/month"
            subtitle="Best for early teams validating signal."
            bullets={[
              "1 active project",
              "Up to 3 runs per month",
              "Email support",
            ]}
            buttonLabel={
              loadingPlan === "starter"
                ? "Redirecting..."
                : "Upgrade to Starter"
            }
            onClick={() => startCheckout("starter")}
            disabled={busy}
            variant="default"
          />

          {/* Pro */}
          <PlanCard
            name="Pro"
            price="$399"
            cadence="/month"
            subtitle="Best for product teams shipping weekly."
            bullets={[
              "Unlimited projects",
              "Unlimited runs",
              "Priority support",
            ]}
            buttonLabel={
              loadingPlan === "pro" ? "Redirecting..." : "Upgrade to Pro"
            }
            onClick={() => startCheckout("pro")}
            disabled={busy}
            variant="featured"
          />
        </div>

        <div className="mt-10 text-sm text-muted-foreground">
          Already subscribed? Use{" "}
          <button
            onClick={openCustomerPortal}
            className="font-medium text-foreground underline underline-offset-4 hover:opacity-80"
          >
            Manage Billing
          </button>{" "}
          to update payment method, view invoices, or cancel.
        </div>
      </div>
    </div>
  );
}

/* ================= PLAN CARD ================= */

function PlanCard({
  name,
  price,
  cadence,
  subtitle,
  bullets,
  buttonLabel,
  onClick,
  disabled,
  variant,
}: {
  name: string;
  price: string;
  cadence: string;
  subtitle: string;
  bullets: string[];
  buttonLabel: string;
  onClick: () => void;
  disabled: boolean;
  variant: "default" | "featured";
}) {
  const featured = variant === "featured";

  return (
    <section
      className={`rounded-2xl border border-border bg-card p-6 ${
        featured ? "relative overflow-hidden" : ""
      }`}
    >
      {featured && (
        <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-linear-to-r from-pink-500/20 to-fuchsia-500/20 blur-2xl" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{name}</h2>
          {featured && (
            <span className="rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white">
              Recommended
            </span>
          )}
        </div>

        <div className="mt-4 flex items-end gap-2">
          <span className="text-4xl font-semibold">{price}</span>
          <span className="pb-1 text-sm text-muted-foreground">{cadence}</span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>

        <ul className="mt-5 space-y-2 text-sm">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onClick}
          disabled={disabled}
          className={`mt-6 w-full rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            featured
              ? "bg-linear-to-r from-pink-500 to-fuchsia-500 text-white hover:brightness-110"
              : "border border-border bg-background hover:bg-muted"
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
