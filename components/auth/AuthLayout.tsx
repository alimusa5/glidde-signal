import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07090D] text-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Left hero */}
        <div className="relative hidden overflow-hidden lg:block">
          <div className="absolute inset-0 bg-linear-to-br from-[#0B0F1A] via-[#4e2853] to-[#323b4e]" />

          {/* Abstract “ribbons” vibe */}
          <div className="absolute -left-40 -top-40 h-130 w-180 rotate-12 rounded-[80px] bg-linear-to-r from-fuchsia-500/35 via-pink-500/35 to-rose-500/35 blur-2xl" />
          <div className="absolute -left-10 top-40 h-105 w-160 -rotate-6 rounded-[80px] bg-linear-to-r from-rose-500/30 via-pink-500/25 to-fuchsia-500/25 blur-2xl" />
          <div className="absolute -bottom-30 left-20 h-105 w-160 rotate-6 rounded-[80px] bg-linear-to-r from-pink-500/25 via-rose-500/25 to-fuchsia-500/25 blur-2xl" />

          <div className="relative flex h-full flex-col justify-between p-10">
            {/* Brand (logo + name) */}
            <div className="flex items-center gap-3 text-l text-white/85">
              <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                <Image
                  src="/glidde-logo.png"
                  alt="Glidde Signal"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>
              <span className="font-medium tracking-wide">Glidde Signal</span>
            </div>

            {/* Headline + positioning */}
            <div className="max-w-xl pb-10">
              <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-white/95">
                Find the Signal in Customer Noise
              </h1>

              <p className="mt-4 max-w-lg text-base leading-relaxed text-white/60">
                AI-powered insights that turn feedback into product roadmap
                decisions.
              </p>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-3 py-1 text-sm text-white/60">
                <span className="text-white/50">Flow:</span>
                <span className="font-medium text-black/75">
                  noise → signal → decisions
                </span>
              </div>

              <div className="mt-6 grid gap-2 text-sm text-white/55">
                <div className="flex gap-2">
                  <span className="mt-1.75 h-1.5 w-1.5 rounded-full bg-pink-500/80" />
                  <span>Cut through the noise. Ship what matters.</span>
                </div>
                <div className="flex gap-2">
                  <span className="mt-1.75 h-1.5 w-1.5 rounded-full bg-pink-500/80" />
                  <span>Turn feedback into features.</span>
                </div>
                <div className="flex gap-2">
                  <span className="mt-1.75 h-1.5 w-1.5 rounded-full bg-pink-500/80" />
                  <span>Make customer insight your growth engine.</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-white/40">
              © {new Date().getFullYear()} Glidde Signal
            </div>
          </div>
        </div>

        {/* Right auth panel */}
        <div className="relative flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            {/* Mobile brand */}
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                <Image
                  src="/glidde-logo.png"
                  alt="Glidde Signal"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>
              <span className="text-sm font-medium tracking-wide text-white/85">
                Glidde Signal
              </span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/3 p-6 shadow-[0_0_0_1px_rgba(255, 255, 255, 0.03)] backdrop-blur sm:p-7">
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-sm text-white/55">{subtitle}</p>
              ) : null}

              <div className="mt-6">{children}</div>
            </div>

            <div className="mt-6 text-center text-xs text-white/40">
              By continuing, you agree to our{" "}
              <Link
                href="#"
                className="text-white/60 underline-offset-4 hover:underline"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="#"
                className="text-white/60 underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
