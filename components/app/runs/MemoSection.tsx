import MemoRenderer from "./MemoRenderer";
import { RunRecord } from "./types";

type Props = {
  run: RunRecord;
  memo: string;
  memoSavedAt: string | null;
  loadingMemo: boolean;
  memoError: string;
  copied: boolean;
  handleGenerateMemo: () => void;
  handleCopyMemo: () => void;
  formatTime: (iso: string) => string;
};

export default function MemoSection({
  run,
  memo,
  memoSavedAt,
  loadingMemo,
  memoError,
  copied,
  handleGenerateMemo,
  handleCopyMemo,
  formatTime,
}: Props) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Executive Decision Memo</h2>

      <p className="mt-1 text-sm text-muted-foreground">
        One-page memo you can paste into Slack.
      </p>

      {memoSavedAt && (
        <p className="mt-2 text-sm text-muted-foreground">
          Memo saved at: {formatTime(memoSavedAt)}
        </p>
      )}

      {run.status !== "completed" ? (
        <div className="mt-4 text-sm text-muted-foreground">
          Memo becomes available once the run completes.
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleGenerateMemo}
            disabled={loadingMemo}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              loadingMemo
                ? "animate-shimmer text-white border border-pink-500"
                : "border border-border bg-background hover:bg-muted"
            }`}
          >
            {loadingMemo
              ? "Generating…"
              : memo
                ? "Regenerate Memo"
                : "Generate Memo"}
          </button>

          {memo && (
            <button
              onClick={handleCopyMemo}
              className={`rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-all ${
                copied
                  ? "bg-pink-500 text-white animate-pink-pulse"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      )}

      {memoError && (
        <div className="mt-4 text-sm text-red-500">{memoError}</div>
      )}

      {memo && <MemoRenderer memo={memo} />}
    </section>
  );
}
