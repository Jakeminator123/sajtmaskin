interface IntegrationConfigNoticeProps {
  /** Short heading, e.g. "Betalningar är inte aktiverade ännu". */
  title: string;
  /** 1-2 calm sentences in the site's language explaining the next step. */
  message: string;
  /** Env key NAMES the site owner must set (names only — never any value). */
  envKeys: string[];
  /** Documented setup URL for the provider (opens in a new tab). */
  docHref: string;
  /** Link label; defaults to a neutral "Läs mer". */
  docLabel?: string;
  className?: string;
}

/**
 * Calm, theme-aware notice shown when an integration is selected but its
 * environment keys are missing. Uses neutral/muted tokens (never error-red) so
 * an unconfigured integration reads as "not set up yet", not "broken". Copy is
 * supplied by the caller so the same component serves every integration.
 */
export function IntegrationConfigNotice({
  title,
  message,
  envKeys,
  docHref,
  docLabel = "Läs mer",
  className,
}: IntegrationConfigNoticeProps) {
  return (
    <div
      role="note"
      className={[
        "rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {envKeys.length > 0 && (
        <p className="mt-3">
          Miljövariabler som behövs:{" "}
          {envKeys.map((key, index) => (
            <span key={key}>
              {index > 0 ? ", " : ""}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {key}
              </code>
            </span>
          ))}
        </p>
      )}
      <a
        href={docHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        {docLabel}
      </a>
    </div>
  );
}
