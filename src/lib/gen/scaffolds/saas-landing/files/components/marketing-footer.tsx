const links = {
  Product: ["Features", "Pricing", "FAQ"],
  Company: ["About", "Contact", "Support"],
};

export function MarketingFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/75 p-8 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">
            {"{{PRODUCT_NAME}}"}
          </p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Product-led SaaS starter for clearer positioning, pricing, and launch messaging.
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
