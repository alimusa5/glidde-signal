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

export default function PrivacyPage() {
  const router = useRouter();
  const lastUpdated = useMemo(() => new Date().toLocaleDateString(), []);

  const handleBack = () => {
    // Best UX: go back if browser has history
    if (window.history.length > 1) {
      router.back();
      return;
    }

    // No history? Decide fallback based on referrer
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
                Privacy Policy
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
            This Privacy Policy explains how Glidde Signal (“we”, “us”)
            collects, uses, and protects your information when you use our
            Service.
          </p>

          <Section title="1. Information We Collect">
            <p>
              <span className="text-white/80">Account information:</span> name,
              email address, and authentication identifiers.
            </p>
            <p>
              <span className="text-white/80">Customer Content:</span> feedback,
              text, files, or other data you upload for analysis.
            </p>
            <p>
              <span className="text-white/80">Usage data:</span> basic analytics
              such as pages visited and feature usage to improve the Service.
            </p>
          </Section>

          <Section title="2. How We Use Information">
            <p>We use your information to:</p>
            <ul className="ml-5 list-disc space-y-2 text-sm leading-6 text-white/65">
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate users and secure accounts</li>
              <li>Process Customer Content to generate insights and outputs</li>
              <li>Communicate product updates and support messages</li>
              <li>Prevent fraud, abuse, and security incidents</li>
            </ul>
          </Section>

          <Section title="3. How We Share Information">
            <p>
              We do not sell your personal information. We may share information
              with trusted service providers (e.g., hosting, analytics,
              payments) only as needed to operate the Service.
            </p>
          </Section>

          <Section title="4. Data Retention">
            <p>
              We retain personal data and Customer Content for as long as needed
              to provide the Service, comply with legal obligations, resolve
              disputes, and enforce agreements. You may request deletion subject
              to legal and operational limits.
            </p>
          </Section>

          <Section title="5. Security">
            <p>
              We use reasonable administrative, technical, and organizational
              measures to protect your information. No system is 100% secure, so
              we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="6. Cookies and Analytics">
            <p>
              We may use cookies or similar technologies for authentication and
              basic analytics. You can control cookies through your browser
              settings.
            </p>
          </Section>

          <Section title="7. International Transfers">
            <p>
              Your information may be processed in countries other than your
              own. We take steps to ensure appropriate safeguards where
              required.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>
              Depending on your location, you may have rights to access,
              correct, export, or delete your information. You can contact us to
              exercise these rights.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will post
              the updated version on this page and update the “Last updated”
              date.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              For privacy questions, contact us at{" "}
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
