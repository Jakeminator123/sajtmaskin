export interface LogoCloudItem {
  /** Brand or partner name. Used as the image alt text and as the text
   *  wordmark when `src` is missing. */
  name: string;
  /** Optional logo image URL (SVG or PNG). When omitted, `name` renders as a
   *  muted wordmark so the row never shows a broken image. */
  src?: string;
  /** Optional link to the brand site. Wraps the logo in an anchor. */
  href?: string;
}

interface LogoCloudProps {
  items: LogoCloudItem[];
  title?: string;
  description?: string;
  className?: string;
}

const REVEAL =
  "opacity-70 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0";

function LogoMedia({ item }: { item: LogoCloudItem }) {
  if (item.src) {
    return (
      // Plain <img> keeps the dossier scaffold-agnostic — next/image would
      // require the consuming project to allowlist the logo host in
      // next.config.ts `images.remotePatterns`, which a dossier must not assume.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt={item.name}
        loading="lazy"
        className={`h-8 w-auto object-contain md:h-10 ${REVEAL}`}
      />
    );
  }
  return (
    <span
      className={`text-lg font-semibold tracking-tight text-muted-foreground md:text-xl ${REVEAL}`}
    >
      {item.name}
    </span>
  );
}

export function LogoCloud({ items, title, description, className }: LogoCloudProps) {
  return (
    <section className={className}>
      {(title || description) && (
        <header className="mb-8 text-center">
          {title && (
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
          )}
          {description && (
            <p className="mt-2 text-base text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
        {items.map((item, idx) => (
          <li key={`${idx}-${item.name}`} className="flex items-center justify-center">
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.name}
                className="group inline-flex items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <LogoMedia item={item} />
              </a>
            ) : (
              <span className="group inline-flex items-center justify-center">
                <LogoMedia item={item} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
