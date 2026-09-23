export default function NotFound() {
  return <main className="mx-auto flex min-h-[65vh] max-w-6xl items-center px-5 py-20"><div><p className="eyebrow">404 · Page not found</p><h1 className="mt-4 max-w-xl text-7xl leading-[.9] tracking-[-.05em]">This street isn&apos;t on our map.</h1><p className="mt-6 max-w-md text-lg leading-7" style={{ color: "var(--muted)" }}>The page you&apos;re looking for may have moved. Let&apos;s get you back to somewhere useful.</p><a href="/" className="btn-primary mt-8">Back home <span>↗</span></a></div></main>;
}
