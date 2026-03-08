import { DeltaItem } from "./types";
import { formatDeltaItem } from "./utils";

export default function DeltaList({
  title,
  items,
  kind,
}: {
  title: string;
  items: DeltaItem[];
  kind: "new" | "resolved" | "change";
}) {
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No changes.</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((it, idx) => (
            <li
              key={`${it.title}-${idx}`}
              className="rounded-lg border border-border bg-background px-3 py-2"
            >
              {formatDeltaItem(it, kind)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
