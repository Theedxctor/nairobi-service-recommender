import { AppTabs, PageIntro } from "../ui";

export default function ClientProfilePage() {
  return <main className="mx-auto max-w-6xl px-5 py-14"><PageIntro eyebrow="Account" title="Your profile" copy="Keep your details up to date so providers can find you and arrive prepared." /><AppTabs active="Profile" /><div className="panel max-w-2xl p-6"><div className="grid gap-5 md:grid-cols-2"><label><span className="label">Full name</span><input className="field" defaultValue="Wanjiku Kamau" /></label><label><span className="label">Phone</span><input className="field" defaultValue="+254 712 345 678" /></label><label><span className="label">Email</span><input className="field" defaultValue="wanjiku@example.com" /></label><label><span className="label">Home area</span><input className="field" defaultValue="Kilimani" /></label></div><button className="btn-primary mt-6">Save changes</button></div></main>;
}
