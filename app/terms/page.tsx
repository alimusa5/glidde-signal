"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-white/90">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-white/65">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  const router = useRouter();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    const ref = document.referrer || "";
    if (ref.includes("/signup")) router.push("/signup");
    else router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#07090D] text-white">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Terms of Service
              </h1>
              <p className="mt-2 text-sm text-white/55">
                Last updated:{" "}
                <span className="text-white/70">{lastUpdated}</span>
              </p>
            </div>

            <button
              onClick={handleBack}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/75 hover:bg-white/10"
              type="button"
            >
              Go Back
            </button>
          </div>

          <p className="mt-6 text-sm leading-6 text-white/65">
            These Terms govern your access to and use of Glidde Signal
            (“Service”). By using the Service, you agree to these Terms.
          </p>

          <Section title="1. Use of the Service">
            <p>
              You may use the Service only in compliance with these Terms and
              all applicable laws. You are responsible for your account activity
              and for maintaining the confidentiality of your credentials.
            </p>
            <p>
              You agree not to misuse the Service, including attempting to gain
              unauthorized access, interfering with our systems, or uploading
              harmful content.
            </p>
          </Section>

          <Section title="2. Accounts">
            <p>
              You must provide accurate information and keep it updated. We may
              suspend or terminate accounts that violate these Terms or pose a
              security risk.
            </p>
          </Section>

          <Section title="3. Customer Content">
            <p>
              “Customer Content” includes text, files, feedback, or other data
              you upload to the Service. You retain ownership of your Customer
              Content.
            </p>
            <p>
              You grant us a limited license to host, process, and display your
              Customer Content solely to provide and improve the Service. You
              represent you have the rights needed to upload and use the
              content.
            </p>
          </Section>

          <Section title="4. AI Outputs and Limitations">
            <p>
              The Service may generate summaries, insights, classifications, or
              recommendations. AI output may be inaccurate or incomplete and
              should be reviewed before making decisions. You are responsible
              for how you use the outputs.
            </p>
          </Section>

          <Section title="5. Subscriptions and Billing">
            <p>
              Paid plans are billed in advance and may renew automatically
              unless canceled. Fees are non-refundable except where required by
              law.
            </p>
          </Section>

          <Section title="6. Acceptable Use">
            <p>
              You may not use the Service to store or transmit unlawful,
              harmful, or infringing content, or to attempt to reverse engineer
              or exploit the Service.
            </p>
          </Section>

          <Section title="7. Termination">
            <p>
              You may stop using the Service at any time. We may suspend or
              terminate access if you violate these Terms or if required to
              comply with law.
            </p>
          </Section>

          <Section title="8. Disclaimers">
            <p>
              The Service is provided “as is” and “as available.” We disclaim
              all warranties to the maximum extent permitted by law.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Glidde Signal will not be
              liable for indirect, incidental, special, consequential, or
              punitive damages, or for any loss of profits, data, or goodwill.
            </p>
          </Section>

          <Section title="10. Changes to These Terms">
            <p>
              We may update these Terms from time to time. If changes are
              material, we will provide notice by posting an updated version in
              the Service.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              Questions about these Terms? Contact us at{" "}
              <span className="text-white/80">support@gliddeai.com</span>.
            </p>
          </Section>
        </div>

        <p className="mt-6 text-center text-xs text-white/35">
          © {new Date().getFullYear()} Glidde Signal
        </p>
      </div>
    </div>
  );
}
