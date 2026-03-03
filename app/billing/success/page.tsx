"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Topbar from "@/components/app/Topbar";

export default function BillingSuccessPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={email} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500" />
            Billing status
          </div>

          <h1 className="text-3xl font-semibold">Payment received</h1>

          <p className="mt-3 text-muted-foreground">
            Thanks — your subscription will activate as soon as we receive the
            billing confirmation.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-6 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Back to Dashboard
            </button>

            <button
              onClick={() => router.push("/billing")}
              className="rounded-xl border border-border bg-background px-6 py-2 text-sm font-semibold hover:bg-muted"
            >
              View Billing
            </button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            If something looks wrong, contact support from the Billing page.
          </p>
        </div>
      </div>
    </div>
  );
}
