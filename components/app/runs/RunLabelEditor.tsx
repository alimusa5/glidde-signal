type RunLabelEditorProps = {
  labelDraft: string;
  savingLabel: boolean;
  setLabelDraft: React.Dispatch<React.SetStateAction<string>>;
  handleSaveLabel: () => void;
};

export default function RunLabelEditor({
  labelDraft,
  savingLabel,
  setLabelDraft,
  handleSaveLabel,
}: RunLabelEditorProps) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <input
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        placeholder="Add a label (e.g., January Feedback)"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          fontSize: 14,
        }}
      />

      <button
        disabled={savingLabel}
        onClick={handleSaveLabel}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: savingLabel ? "not-allowed" : "pointer",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {savingLabel ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
