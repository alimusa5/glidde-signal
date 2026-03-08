"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EntitlementsPayload } from "@/components/app/project/types";

export default function useEntitlements() {
  const [entitlements, setEntitlements] = useState<EntitlementsPayload | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session?.access_token) return;

        const token = data.session.access_token;

        const res = await fetch("/api/entitlements", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json().catch(() => ({}));

        if (res.ok && json.entitlements) {
          setEntitlements(json.entitlements);
        }
      } catch (err) {
        console.error("Failed to fetch entitlements", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { entitlements, loading };
}
