"use client";

type Props = {
  source: string;
  setSource: (value: string) => void;
  csvFile: File | null;
  setCsvFile: (file: File | null) => void;
  rawText: string;
  setRawText: (value: string) => void;
  isUploading: boolean;
  errorMsg: string;
  resultMsg: string;
  onUpload: () => Promise<void>;
};

export default function UploadSection({
  source,
  setSource,
  csvFile,
  setCsvFile,
  rawText,
  setRawText,
  isUploading,
  errorMsg,
  resultMsg,
  onUpload,
}: Props) {
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-6">Upload Customer Feedback</h2>

      <div className="flex gap-4 flex-wrap items-center">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-xl border border-border bg-background px-4 py-2"
        >
          <option value="">Select source</option>
          <option value="reviews">Reviews</option>
          <option value="support">Support</option>
          <option value="surveys">Surveys</option>
        </select>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          className="rounded-xl border border-border bg-background px-4 py-2"
        />

        {/* Show selected file */}
        {csvFile && (
          <div className="flex items-center gap-3 text-sm bg-muted px-3 py-1 rounded-lg">
            <span>{csvFile.name}</span>

            <button
              onClick={() => setCsvFile(null)}
              className="text-red-400 hover:text-red-500"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={6}
        placeholder="Or paste feedback here..."
        className="w-full rounded-xl border border-border bg-background px-4 py-3 mt-5"
      />

      <button
        disabled={isUploading}
        onClick={onUpload}
        className="mt-5 rounded-xl bg-linear-to-r from-pink-500 to-fuchsia-500 px-6 py-2 text-white font-semibold disabled:opacity-50"
      >
        {isUploading ? "Uploading..." : "Upload"}
      </button>

      {errorMsg && <div className="text-red-400 text-sm mt-3">{errorMsg}</div>}

      {resultMsg && (
        <div className="text-green-400 text-sm mt-3">{resultMsg}</div>
      )}
    </section>
  );
}
