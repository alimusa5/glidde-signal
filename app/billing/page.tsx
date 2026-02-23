"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Plan = "starter" | "pro";

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const json: unknown = await res.json();

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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json: unknown = await res.json();

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Billing
          </h1>
          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            Choose a plan to activate subscriptions inside the product.
          </p>
        </div>

        <button
          onClick={openCustomerPortal}
          disabled={openingPortal || loadingPlan !== null}
          style={{
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #111",
            cursor: openingPortal || loadingPlan ? "not-allowed" : "pointer",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {openingPortal ? "Opening..." : "Manage Billing"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            border: "1px solid #ffb4b4",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16,
        }}
      >
        <section
          style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Starter</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            $199/month • 1 project • up to 3 runs/month
          </p>

          <button
            onClick={() => startCheckout("starter")}
            disabled={loadingPlan !== null || openingPortal}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              cursor: loadingPlan || openingPortal ? "not-allowed" : "pointer",
              width: "100%",
              fontWeight: 600,
            }}
          >
            {loadingPlan === "starter"
              ? "Redirecting..."
              : "Upgrade to Starter"}
          </button>
        </section>

        <section
          style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Pro</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            $399/month • unlimited projects • unlimited runs
          </p>

          <button
            onClick={() => startCheckout("pro")}
            disabled={loadingPlan !== null || openingPortal}
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              cursor: loadingPlan || openingPortal ? "not-allowed" : "pointer",
              width: "100%",
              fontWeight: 600,
            }}
          >
            {loadingPlan === "pro" ? "Redirecting..." : "Upgrade to Pro"}
          </button>
        </section>
      </div>
    </main>
  );
}
