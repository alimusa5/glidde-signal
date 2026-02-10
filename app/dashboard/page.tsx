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

  // 3) Create a new project, then redirect to /project/[id]
  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setCreating(true);
    setError(null);

    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim(), user_id: userId })
      .select("id")
      .single();

    setCreating(false);

    if (error) {
      setError(error.message);
      return;
    }

    setName("");
    router.push(`/project/${data.id}`);
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
