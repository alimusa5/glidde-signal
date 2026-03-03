"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AuthLayout from "@/components/auth/AuthLayout";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !loading;
  }, [email, password, loading]);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Start transforming customer feedback into roadmap-ready intelligence."
    >
      <form onSubmit={onSignup} className="grid gap-4">
        {/* Email */}
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-white/70">Email</label>
          <input
            type="email"
            placeholder="Email"
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

        {/* Password */}
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-white/70">Password</label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={cn(
                "h-11 w-full rounded-xl border border-white/10 bg-white/3 px-3 pr-11 text-sm text-white/90",
                "placeholder:text-white/30 outline-none transition",
                "focus:border-pink-500/60 focus:ring-2 focus:ring-pink-500/15",
              )}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/45 transition hover:bg-white/5 hover:text-white/70"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          <p className="text-[11px] text-white/40">
            Tip: Use 8+ characters (add a number/symbol for stronger security).
          </p>
        </div>

        {/* Error */}
        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        {/* Submit */}
        <button
          disabled={!canSubmit}
          className={cn(
            "h-11 w-full rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 text-sm font-semibold",
            "shadow-[0_10px_30px_-12px_rgba(236,72,153,0.6)] transition",
            "hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        {/* Footer links */}
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-white/50">
          <span>Already have an account?</span>
          <Link href="/login" className="text-white/70 hover:text-white/90">
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
      <path d="M9.88 5.08A10.1 10.1 0 0 1 12 5c6.5 0 10 7 10 7a18.1 18.1 0 0 1-3.28 4.52" />
      <path d="M6.61 6.61C3.6 8.82 2 12 2 12s3.5 7 10 7c1.06 0 2.06-.19 3-.52" />
    </svg>
  );
}
