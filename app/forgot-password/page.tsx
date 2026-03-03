"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/lib/supabase";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && !loading,
    [email, loading],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSent(false);

    // Send reset email (Supabase will email a link)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We’ll email you a link to set a new password."
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-white/70">Email</label>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={cn(
              "h-11 w-full rounded-xl border border-white/10 bg-white/3 px-3 text-sm text-white/90",
              "placeholder:text-white/30 outline-none transition",
              "focus:border-pink-500/60 focus:ring-2 focus:ring-pink-500/15",
            )}
          />
        </div>

        {sent ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            If an account exists for{" "}
            <span className="font-medium">{email}</span>, you’ll receive a reset
            link shortly. Check spam/junk too.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        <button
          disabled={!canSubmit}
          className={cn(
            "h-11 w-full rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 text-sm font-semibold",
            "shadow-[0_10px_30px_-12px_rgba(236,72,153,0.6)] transition",
            "hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-white/50">
          <Link href="/login" className="hover:text-white/70">
            Back to sign in
          </Link>
          <span className="text-white/20">|</span>
          <a
            href="mailto:support@gliddeai.com?subject=Glidde%20Signal%20Support%20Request"
            className="hover:text-white/70"
          >
            Contact support
          </a>
        </div>
      </form>
    </AuthLayout>
  );
}
