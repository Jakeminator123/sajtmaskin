const links = {
  Navigation: ["Work", "Writing", "About"],
  Connect: ["Email", "LinkedIn", "GitHub"],
};

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/75 p-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Personal portfolio starter for creatives, consultants, and founder-led brands that need a sharper first impression.
          </p>
        </div>
        {Object.entries(links).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((item) => (
                <a key={item} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}

export default SiteFooter;
