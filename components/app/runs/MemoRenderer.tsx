export default function MemoRenderer({ memo }: { memo: string }) {
  const lines = memo.split("\n");

  return (
    <div className="mt-6 rounded-xl border border-border bg-background p-5 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const text = line.trim();

        if (!text) return <div key={idx} className="h-2" />;

        if (
          text === "Executive Summary" ||
          text === "This Month’s Customer Reality" ||
          text === "What Got Worse" ||
          text === "What Improved" ||
          text === "Top 3 Recommended Actions"
        ) {
          return (
            <div key={idx} className="text-base font-semibold mt-4 mb-2">
              {text}
            </div>
          );
        }

        if (text.startsWith("•")) {
          return (
            <div key={idx} className="ml-3 text-muted-foreground">
              {text}
            </div>
          );
        }

        return <div key={idx}>{text}</div>;
      })}
    </div>
  );
}
