"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

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

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // generic errors
  const [error, setError] = useState<string | null>(null);

  // upgrade + entitlements (Day 12 polish)
  const [upgrade, setUpgrade] = useState<UpgradePayload | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsPayload | null>(
    null,
  );

  const isBlocked = useMemo(() => upgrade !== null, [upgrade]);

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Not authenticated. Please log in again.");
    }
    return data.session.access_token;
  }

  async function fetchEntitlements() {
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
    } catch {
      // swallow errors (dashboard should still load)
    }
  }

  // 1) Auth + initial entitlements
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      setUserId(data.user.id);

      // Day 12: show plan + usage immediately
      await fetchEntitlements();

      setChecking(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 2) Load projects
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

        // Day 12: premium upgrade path
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

      // refresh entitlements because activeProjects changes
      await fetchEntitlements();

      router.push(`/project/${projectId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  if (checking) return <div style={{ padding: 24 }}>Checking session...</div>;

  const showRunsCounter =
    entitlements &&
    typeof entitlements.runsLimit !== "undefined" &&
    typeof entitlements.runsUsedThisPeriod !== "undefined";

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1 style={{ marginBottom: 8 }}>Dashboard</h1>

      {/* Plan / Usage header (Day 12 visibility) */}
      {entitlements && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: "#fff",
              }}
            >
              Current Plan:{" "}
              <b style={{ textTransform: "capitalize" }}>{entitlements.plan}</b>
            </span>

            {/* Projects */}
            {typeof entitlements.activeProjects === "number" &&
              typeof entitlements.maxActiveProjects === "number" && (
                <span style={{ fontSize: 13 }}>
                  Projects: <b>{entitlements.activeProjects}</b> /{" "}
                  {entitlements.maxActiveProjects}
                </span>
              )}

            {entitlements.maxActiveProjects == null && (
              <span style={{ fontSize: 13 }}>
                Projects: <b>Unlimited</b>
              </span>
            )}

            {/* Runs */}
            {showRunsCounter &&
              typeof entitlements.runsLimit === "number" &&
              typeof entitlements.runsUsedThisPeriod === "number" && (
                <span style={{ fontSize: 13 }}>
                  Runs Used: <b>{entitlements.runsUsedThisPeriod}</b> /{" "}
                  {entitlements.runsLimit} this period
                </span>
              )}

            {showRunsCounter && entitlements.runsLimit == null && (
              <span style={{ fontSize: 13 }}>
                Runs: <b>Unlimited</b>
              </span>
            )}

            {/* Reset */}
            {entitlements.nextResetAt && (
              <span style={{ fontSize: 13 }}>
                Next Reset:{" "}
                <b>
                  {formatDateShort(entitlements.nextResetAt) ??
                    entitlements.nextResetAt}
                </b>
              </span>
            )}
          </div>

          {entitlements.periodStart && entitlements.periodEnd && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
              Billing period:{" "}
              {formatDateShort(entitlements.periodStart) ??
                entitlements.periodStart}{" "}
              →{" "}
              {formatDateShort(entitlements.periodEnd) ??
                entitlements.periodEnd}
            </div>
          )}
        </div>
      )}

      {/* Create Project */}
      <form
        onSubmit={createProject}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
          disabled={creating}
        />
        <button
          disabled={creating || !name.trim() || isBlocked}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: isBlocked ? "#ddd" : "#111",
            color: isBlocked ? "#666" : "#fff",
            cursor: isBlocked ? "not-allowed" : "pointer",
          }}
        >
          {creating ? "Creating..." : "Create Project"}
        </button>
      </form>

      {/* Premium Upgrade Card (Day 12 polish) */}
      {upgrade && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 14,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{upgrade.title}</div>
          <div style={{ marginTop: 6, color: "#444", fontSize: 13 }}>
            Starter plan is limited by design. Pro removes limits and supports
            continuous insight.
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#fafafa",
                border: "1px solid #eee",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Starter includes
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: "#333",
                }}
              >
                {upgrade.starterIncludes.map((x) => (
                  <li key={x} style={{ marginBottom: 6 }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#111",
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Pro unlocks
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: "#fff",
                }}
              >
                {upgrade.proUnlocks.map((x) => (
                  <li key={x} style={{ marginBottom: 6 }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/billing")}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {upgrade.cta}
            </button>
            <button
              type="button"
              onClick={() => {
                setUpgrade(null);
                setError(null);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Generic error text */}
      {error && !upgrade && (
        <p style={{ color: "red", marginTop: 10 }}>{error}</p>
      )}

      {/* Projects list */}
      <div style={{ marginTop: 24 }}>
        <h2>Your Projects</h2>

        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul style={{ paddingLeft: 18 }}>
            {projects.map((p) => (
              <li key={p.id} style={{ marginBottom: 6 }}>
                <a href={`/project/${p.id}`}>{p.name}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
