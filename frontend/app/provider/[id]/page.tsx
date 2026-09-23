import { PageIntro, ProviderCard, providers } from "../../ui";

export default async function ProviderProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = providers.find((item) => item.id === id) ?? providers[0];
  return <main className="mx-auto max-w-6xl px-5 py-14"><PageIntro eyebrow="Provider profile" title={provider.name} copy={`${provider.service} serving ${provider.area} and nearby Nairobi areas.`} /><div className="grid gap-8 md:grid-cols-[1fr_360px]"><div><ProviderCard provider={provider} compact /><div className="panel mt-6 p-6"><h2 className="text-2xl">What clients say</h2><div className="mt-5 border-t pt-5" style={{ borderColor: "var(--line)" }}><p className="text-lg">&quot;Arrived on time, explained the issue clearly and left everything tidy.&quot;</p><p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>— Brian M., Kilimani</p></div></div></div><aside className="panel h-fit p-6"><p className="eyebrow">Ready to book?</p><p className="mt-3 text-sm leading-6" style={{ color: "var(--muted)" }}>Choose a time and we&apos;ll confirm this provider&apos;s availability.</p><a href={`/booking/confirmation?provider=${provider.id}`} className="btn-primary mt-5 w-full">Book {provider.name.split(" ")[0]}</a><a href="/results" className="btn-secondary mt-2 w-full">Compare providers</a></aside></div></main>;
}
