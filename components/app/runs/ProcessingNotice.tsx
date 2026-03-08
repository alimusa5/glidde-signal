export default function ProcessingNotice({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  return (
    <div className="text-sm text-muted-foreground">
      <p className="mb-4">
        This run is still processing. Insights will appear automatically once
        indexing completes.
      </p>

      <button
        onClick={onRefresh}
        className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
      >
        Refresh
      </button>
    </div>
  );
}
