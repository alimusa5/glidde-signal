"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Image from "next/image";

/* ================= TYPES ================= */

type Project = {
  id: string;
  name: string;
  created_at: string;
};

type UpgradePayload = {
  title: string;
  starterIncludes: string[];
  proUnlocks: string[];
  cta: string;
};

type EntitlementsPayload = {
  plan: "starter" | "pro";
  isPro: boolean;
  activeProjects?: number;
  maxActiveProjects?: number | null;
  runsUsedThisPeriod?: number;
  runsLimit?: number | null;
  nextResetAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

type ApiErrorPayload = {
  code?: string;
  error?: string;
  entitlements?: EntitlementsPayload;
  upgrade?: UpgradePayload;
};

type EntitlementsApiResponse = {
  entitlements?: EntitlementsPayload;
  error?: string;
};

/* ================= HELPERS ================= */

function formatDateShort(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/* ================= TOPBAR ================= */

function Topbar({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Fix: initialize from localStorage; avoid setState inside mount effect
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("theme");
    return saved !== "light";
  });

  // Keep DOM in sync with state
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  function toggleTheme() {
    if (dark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setDark(true);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <div
            onClick={() => router.push("/dashboard")}
            className="flex cursor-pointer items-center gap-2"
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

          <div className="hidden gap-6 text-sm md:flex">
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

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-border px-3 py-1 text-xs"
          >
            {dark ? "Light" : "Dark"}
          </button>

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

/* ================= MAIN COMPONENT ================= */

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<UpgradePayload | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsPayload | null>(
    null,
  );

  const isBlocked = useMemo(() => upgrade !== null, [upgrade]);

  /* ================= AUTH TOKEN ================= */

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Not authenticated. Please log in again.");
    }
    return data.session.access_token;
  }, []);

  /* ================= FETCH ENTITLEMENTS ================= */

  const fetchEntitlements = useCallback(async () => {
    try {
      const token = await getAccessToken();

      const res = await fetch("/api/entitlements", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = (await res
        .json()
        .catch(() => ({}))) as EntitlementsApiResponse;

      if (!res.ok) return;
      if (json.entitlements) setEntitlements(json.entitlements);
    } catch {}
  }, [getAccessToken]);

  /* ================= INIT ================= */

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? null);
      await fetchEntitlements();
      setChecking(false);
    }

    init();
  }, [router, fetchEntitlements]);

  /* ================= LOAD PROJECTS ================= */

  useEffect(() => {
    async function loadProjects() {
      if (!userId) return;

      const { data, error } = await supabase
        .from("projects")
        .select("id,name,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) setProjects(data as Project[]);
    }

    loadProjects();
  }, [userId]);

  /* ================= CREATE PROJECT ================= */

  async function createProject(e: React.FormEvent) {
    e.preventDefault();

    setCreating(true);
    setError(null);
    setUpgrade(null);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const payload: ApiErrorPayload | null = isRecord(json)
          ? (json as ApiErrorPayload)
          : null;

        if (res.status === 402 && payload?.upgrade) {
          setUpgrade(payload.upgrade);
          setEntitlements(payload.entitlements ?? entitlements ?? null);
          setError(payload.error ?? "Upgrade required.");
          return;
        }

        const msg =
          isRecord(json) && "error" in json
            ? String(json.error)
            : "Failed to create project";
        throw new Error(msg);
      }

      const projectId =
        isRecord(json) && "projectId" in json ? String(json.projectId) : null;

      if (!projectId) throw new Error("Missing projectId");

      setName("");
      await fetchEntitlements();
      router.push(`/project/${projectId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking session...
      </div>
    );

  const runPercent =
    entitlements?.runsLimit && entitlements.runsUsedThisPeriod !== undefined
      ? Math.min(
          100,
          (entitlements.runsUsedThisPeriod / entitlements.runsLimit) * 100,
        )
      : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar email={email} />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* ===== BIG DASHBOARD HEADING ADDED (ONLY THIS PART) ===== */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
        </div>
        {/* ENTITLEMENTS */}
        {entitlements && (
          <div className="mb-10 grid gap-6 md:grid-cols-3">
            <Card title="Plan">
              <span className="rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 px-3 py-1 text-xs font-semibold text-white">
                {entitlements.plan.toUpperCase()}
              </span>
            </Card>

            <Card title="Projects">
              {entitlements.maxActiveProjects == null
                ? "Unlimited"
                : `${entitlements.activeProjects ?? 0} / ${
                    entitlements.maxActiveProjects
                  }`}
            </Card>

            <Card title="Runs Used">
              {entitlements.runsLimit == null ? (
                "Unlimited"
              ) : (
                <div>
                  {entitlements.runsUsedThisPeriod ?? 0} /{" "}
                  {entitlements.runsLimit}
                  <div className="mt-2 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-linear-to-r from-pink-500 to-fuchsia-500 transition-all duration-700"
                      style={{ width: `${runPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* CREATE PROJECT */}
        <div className="mb-8 rounded-2xl border border-border bg-card p-6">
          <form
            onSubmit={createProject}
            className="flex flex-col gap-4 md:flex-row"
          >
            <input
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2"
            />
            <button
              disabled={creating || !name.trim() || isBlocked}
              className="rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-6 py-2 font-medium text-white disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>
          </form>
        </div>

        {/* UPGRADE CARD */}
        {upgrade && (
          <div className="mb-10 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{upgrade.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Starter plan is limited by design. Pro removes limits and supports
              continuous insight.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <UpgradeBox
                title="Starter includes"
                items={upgrade.starterIncludes}
                dark={false}
              />
              <UpgradeBox title="Pro unlocks" items={upgrade.proUnlocks} dark />
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => router.push("/billing")}
                className="rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-6 py-2 font-medium text-white"
              >
                {upgrade.cta}
              </button>
              <button
                onClick={() => {
                  setUpgrade(null);
                  setError(null);
                }}
                className="rounded-xl border border-border px-6 py-2"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {/* ERROR */}
        {error && !upgrade && (
          <p className="mb-6 text-sm text-red-500">{error}</p>
        )}

        {/* PROJECTS */}
        <div>
          <h2 className="mb-6 text-xl font-semibold">Your Projects</h2>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
              🚀 No projects yet.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}`)}
                  className="cursor-pointer rounded-2xl border border-border bg-card p-6 transition hover:border-pink-500/50"
                >
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Created {formatDateShort(p.created_at) ?? p.created_at}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= SMALL COMPONENTS ================= */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 text-lg font-semibold">{children}</div>
    </div>
  );
}

function UpgradeBox({
  title,
  items,
  dark,
}: {
  title: string;
  items: string[];
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 ${
        dark
          ? "bg-linear-to-br from-pink-500 to-fuchsia-500 text-white"
          : "bg-muted text-foreground"
      }`}
    >
      <div className="mb-4 font-semibold">{title}</div>
      <ul className="space-y-2 text-sm">
        {items.map((x) => (
          <li key={x}>• {x}</li>
        ))}
      </ul>
    </div>
  );
}
