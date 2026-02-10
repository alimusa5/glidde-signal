"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select("name")
        .eq("id", id)
        .single();

      if (error || !data) {
        router.replace("/dashboard");
        return;
      }

      setName(data.name);
      setLoading(false);
    }

    load();
  }, [id, router]);

  if (loading) return <div style={{ padding: 24 }}>Loading project...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>{name}</h1>

      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 24,
          minHeight: 200,
          display: "grid",
          gap: 12,
          alignContent: "center",
        }}
      >
        <h2 style={{ fontSize: 24 }}>
          Upload customer feedback → get decisions.
        </h2>
        <button disabled style={{ width: 180 }}>
          Upload Feedback
        </button>
      </div>
    </div>
  );
}
