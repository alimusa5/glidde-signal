import type { CSSProperties } from "react";
import type { RunHistoryItem } from "./types";

export function formatDateShort(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function titleCase(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusChipStyle(
  status: RunHistoryItem["status"],
): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#fafafa",
    color: "#111",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };

  if (status === "completed") return base;
  if (status === "processing") {
    return { ...base, background: "#fff", border: "1px solid #ccc" };
  }
  if (status === "failed") {
    return { ...base, background: "#fff", border: "1px solid #bbb" };
  }

  return { ...base, background: "#f3f3f3" };
}

export function statusLabel(status: RunHistoryItem["status"]) {
  if (status === "completed") return "Completed";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Queued";
}

export function statusDotStyle(
  status: RunHistoryItem["status"],
): CSSProperties {
  const base: CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: 999,
    display: "inline-block",
    background: "#111",
    opacity: 0.25,
  };

  if (status === "completed") return { ...base, opacity: 0.45 };
  if (status === "processing") return { ...base, opacity: 0.35 };
  if (status === "failed") return { ...base, opacity: 0.55 };
  return { ...base, opacity: 0.25 };
}
