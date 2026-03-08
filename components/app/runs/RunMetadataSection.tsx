import { RunRecord, UploadInfo } from "./types";

export default function RunMetadataSection({
  run,
  upload,
  formatTime,
}: {
  run: RunRecord;
  upload: UploadInfo | null;
  formatTime: (iso: string) => string;
}) {
  const scopeLabel = run.scope === "project" ? "Project-wide" : "Single upload";

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Snapshot Metadata</h2>

      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <div>Run ID: {run.id}</div>
        <div>Created: {formatTime(run.created_at)}</div>
        <div>Status: {run.status}</div>
        <div>Scope: {scopeLabel}</div>
        <div>Source filter: {run.source_filter}</div>
        <div>Entry count at run time: {run.entry_count}</div>
      </div>

      {run.scope === "upload" && (
        <div className="mt-6">
          <h3 className="mb-2 font-semibold">Upload Included</h3>

          {upload ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>Upload ID: {upload.id}</div>
              <div>Upload source: {upload.source}</div>
              <div>Uploaded: {formatTime(upload.created_at)}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Upload info unavailable.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
