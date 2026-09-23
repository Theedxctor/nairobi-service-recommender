export const providers = [
  { id: "P0023", name: "Auma Cheruiyot", service: "Plumber", area: "Kilimani", rating: 4.8, score: 0.94, eta: 18, price: 894, jobs: 286, verified: true, reason: "Strong completion record and a clear route from Kilimani." },
  { id: "P0152", name: "Diana Kariuki", service: "Plumber", area: "Lavington", rating: 4.7, score: 0.91, eta: 22, price: 504, jobs: 174, verified: true, reason: "Good road access and reliable weekday availability." },
  { id: "P0040", name: "Njoroge Langat", service: "Plumber", area: "Kileleshwa", rating: 4.6, score: 0.87, eta: 27, price: 1000, jobs: 342, verified: true, reason: "Consistent arrival history on this corridor." },
];

export function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="mb-8 max-w-2xl"><p className="eyebrow">{eyebrow}</p><h1 className="mt-3 text-5xl leading-none tracking-[-.04em]">{title}</h1>{copy && <p className="mt-4 text-base leading-7" style={{ color: "var(--muted)" }}>{copy}</p>}</div>;
}

export function AppTabs({ active }: { active: string }) {
  const tabs = [["Overview", "/dashboard"], ["Bookings", "/dashboard#bookings"], ["Profile", "/profile"]];
  return <nav className="mb-8 flex gap-6 border-b text-sm font-bold" style={{ borderColor: "var(--line)" }}>{tabs.map(([label, href]) => <a key={label} href={href} className="border-b-2 pb-3" style={{ color: label === active ? "var(--green)" : "var(--muted)", borderColor: label === active ? "var(--green)" : "transparent" }}>{label}</a>)}</nav>;
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="label">{label}</span>{children}</label>;
}

export function ProviderCard({ provider, compact = false }: { provider: typeof providers[number]; compact?: boolean }) {
  return <article className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-12 w-12 items-center justify-center bg-[#dce8d2] text-lg font-bold text-[#176b4d]">{provider.name.split(" ").map((n) => n[0]).join("")}</div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl">{provider.name}</h2>{provider.verified && <span className="text-[10px] font-bold uppercase tracking-wider text-[#176b4d]">Verified</span>}</div><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{provider.service} · {provider.area}</p></div></div><span className="text-sm font-bold text-[#ad6a2f]">★ {provider.rating}</span></div><div className="mt-5 grid grid-cols-3 gap-3 border-y py-4 text-sm" style={{ borderColor: "var(--line)" }}><div><p className="text-xs" style={{ color: "var(--muted)" }}>Reliability</p><b className="text-2xl text-[#176b4d]">{Math.round(provider.score * 100)}%</b></div><div><p className="text-xs" style={{ color: "var(--muted)" }}>Arrival</p><b className="text-lg">{provider.eta} min</b></div><div><p className="text-xs" style={{ color: "var(--muted)" }}>From</p><b className="text-lg">KES {provider.price.toLocaleString()}</b></div></div>{!compact && <><p className="mt-4 text-sm leading-6" style={{ color: "var(--muted)" }}><span className="font-bold" style={{ color: "var(--ink)" }}>Why this match: </span>{provider.reason}</p><div className="mt-5 flex gap-2"><a href={`/provider/${provider.id}`} className="btn-secondary flex-1 px-3 py-2">View profile</a><a href={`/booking/confirmation?provider=${provider.id}`} className="btn-primary flex-1 px-3 py-2">Choose provider</a></div></>}</article>;
}
