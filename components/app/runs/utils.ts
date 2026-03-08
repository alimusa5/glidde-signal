import { DeltaItem } from "./types";

export function formatDeltaItem(
  item: DeltaItem,
  kind: "new" | "resolved" | "change",
) {
  if (kind === "new") return `New: ${item.title}`;
  if (kind === "resolved") return item.title;

  const d = item.delta ?? 0;
  const abs = Math.abs(d);
  const word = abs === 1 ? "mention" : "mentions";
  const sign = d > 0 ? `+${d}` : `${d}`;

  return `${item.title} (${sign} ${word})`;
}

export const formatTime = (iso: string) => new Date(iso).toLocaleString();
