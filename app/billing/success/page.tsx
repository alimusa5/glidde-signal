export default function BillingSuccessPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Payment received
      </h1>
      <p style={{ opacity: 0.8 }}>
        Thanks — your subscription will activate as soon as we receive the
        billing confirmation.
      </p>

      <p style={{ marginTop: 18 }}>You can go back to your dashboard now.</p>
    </main>
  );
}
