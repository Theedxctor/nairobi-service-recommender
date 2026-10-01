const FOOTER_LINKS: Record<string, [string, string][]> = {
  Product: [
    ["How it works", "/#how-it-works"],
    ["Why NaiServe", "/#why-naiserve"],
    ["Request a service", "/register"],
  ],
  Company: [
    ["About", "#"],
    ["Careers", "#"],
    ["Contact", "#"],
  ],
  Legal: [
    ["Privacy Policy", "#"],
    ["Terms of Service", "#"],
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <span className="font-heading text-xl font-semibold text-stone-900">
              Nai<span className="text-teal-700">Serve</span>
            </span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-500">
              Matching Nairobi households with service providers who actually show up on time.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-sm font-semibold text-stone-900">{heading}</h3>
              <ul className="mt-4 space-y-3">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-sm text-stone-500 transition-colors hover:text-stone-900">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-stone-200 pt-8 text-sm text-stone-400">
          &copy; {new Date().getFullYear()} NaiServe. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
