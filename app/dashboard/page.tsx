"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Make sure user is logged in, otherwise redirect to /login
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUserId(data.user.id);
      setChecking(false);
    }
    init();
  }, [router]);

  // 2) Load projects for this user
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

    try {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("You are not logged in.");

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const json: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as Record<string, unknown>).error)
            : "Failed to create project";
        throw new Error(msg);
      }

      const projectId =
        typeof json === "object" && json !== null && "projectId" in json
          ? String((json as Record<string, unknown>).projectId)
          : null;

      if (!projectId) throw new Error("Missing projectId");

      setName("");
      router.push(`/project/${projectId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  if (checking) return <div style={{ padding: 24 }}>Checking session...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Dashboard</h1>

      <form
        onSubmit={createProject}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button disabled={creating || !name.trim()}>
          {creating ? "Creating..." : "Create Project"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        <h2>Your Projects</h2>

        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <a href={`/project/${p.id}`}>{p.name}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
