export default function Home() {
  return (
    <div className="max-w-xl mx-auto text-center py-12 space-y-6">
      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
        Reliable Household Service Providers in Nairobi
      </h1>
      <p className="text-slate-600 leading-relaxed">
        Our context-aware recommendation engine analyzes live traffic patterns,
        spatial corridors, road quality, and historical arrival reliability to match
        you with verified local service providers.
      </p>
      <div className="pt-4 flex justify-center gap-4">
        <a
          href="/request"
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
        >
          Request a Service
        </a>
        <a
          href="/results"
          className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 text-base font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        >
          View Demo Results
        </a>
      </div>
    </div>
  );
}
