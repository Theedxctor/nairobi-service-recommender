import Link from "next/link";

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Request a Service",
    desc: "Tell us what you need, your area, and when you need it done.",
  },
  {
    number: "02",
    title: "Get Matched",
    desc: "Our model ranks available providers by real arrival reliability.",
  },
  {
    number: "03",
    title: "Book with Confidence",
    desc: "See exactly why each provider was ranked before you commit.",
  },
];

const WHY_NAISERVE = [
  {
    title: "Traffic-Aware Matching",
    desc: "Every ranking accounts for real Nairobi congestion patterns and corridors, not just straight-line distance.",
  },
  {
    title: "Verified Providers",
    desc: "Every provider passes background and credential checks before they can appear in your results.",
  },
  {
    title: "Transparent Rankings",
    desc: "See the reasoning behind every recommendation — reliability score, ETA, and why it matters.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Nairobi&apos;s context-aware service network
          </p>
          <h1 className="mt-6 font-heading text-5xl font-semibold leading-[1.05] tracking-tight text-stone-900 md:text-6xl lg:text-7xl">
            Find a reliable service provider, not just the nearest one.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-stone-600 md:text-xl">
            We rank plumbers, electricians, cleaners, and technicians by how likely they are to
            actually show up on time — accounting for Nairobi&apos;s real traffic and congestion
            patterns, not just distance.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-teal-700 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="text-base font-medium text-stone-500 transition-colors hover:text-stone-900"
            >
              Already have an account?{" "}
              <span className="underline underline-offset-4">Log in</span>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-stone-200 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              How it works
            </p>
            <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              Three steps to a booking you can count on.
            </h2>
          </div>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.number}>
                <span className="font-heading text-4xl font-semibold text-teal-700/25">
                  {step.number}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-stone-900">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-stone-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why NaiServe */}
      <section id="why-naiserve" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              Why NaiServe
            </p>
            <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              Built for reliability, not just convenience.
            </h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {WHY_NAISERVE.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-stone-200 bg-white p-8">
                <h3 className="text-xl font-semibold text-stone-900">{feature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-stone-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}


