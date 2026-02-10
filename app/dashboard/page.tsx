"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      setChecking(false);
    }

    checkAuth();
  }, [router]);

  if (checking) {
    return <div style={{ padding: 24 }}>Checking session...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>You are logged in.</p>
    </div>
  );
}
