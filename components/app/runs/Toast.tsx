export default function Toast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #eee",
        background: "#fafafa",
        fontSize: 14,
        color: "#111",
      }}
    >
      {message}
    </div>
  );
}
