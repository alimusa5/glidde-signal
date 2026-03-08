"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Topbar({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Theme handling (safe lazy initializer)
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") !== "light";
  });

  // Sync React state → DOM
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  function toggleTheme() {
    const next = !dark;

    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");

    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Left */}
        <div className="flex items-center gap-8">
          <div
            className="flex cursor-pointer items-center gap-2"
            onClick={() => router.push("/dashboard")}
          >
            <div className="relative h-8 w-8">
              <Image
                src="/glidde-logo.png"
                alt="Glidde Signal"
                fill
                className="object-contain"
              />
            </div>
            <span className="text-sm font-semibold tracking-wide">
              Glidde Signal
            </span>
          </div>

          <div className="hidden items-center gap-6 text-sm md:flex">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </button>

            <button
              onClick={() => router.push("/billing")}
              className="text-muted-foreground hover:text-foreground"
            >
              Billing
            </button>

            <button className="text-muted-foreground hover:text-foreground">
              Settings
            </button>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-border px-3 py-1 text-xs"
          >
            {dark ? "Light" : "Dark"}
          </button>

          {/* User */}
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 text-sm font-semibold text-white">
                {initials}
              </div>

              <span className="hidden text-sm text-muted-foreground md:block">
                {email}
              </span>
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl border border-border bg-card p-2 shadow-lg">
                <button
                  onClick={logout}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
