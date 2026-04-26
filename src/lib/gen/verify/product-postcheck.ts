import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";

export type ProductPostcheckWarningCode =
  | "broken_anchor"
  | "broken_image"
  | "cta_no_handler"
  | "mobile_menu_failed"
  | "fake_form";

export type ProductPostcheckSkipReason =
  | "feature_disabled"
  | "missing_preview_url"
  | "url_not_allowed"
  | "navigation_failed"
  | "playwright_unavailable"
  | "timeout"
  | "runtime_error";

export type ProductPostcheckWarning = {
  code: ProductPostcheckWarningCode;
  message: string;
  selector?: string | null;
  text?: string | null;
  href?: string | null;
  src?: string | null;
  alt?: string | null;
  formId?: string | null;
};

export type ProductPostcheckResult = {
  ok: true;
  skipped: boolean;
  skippedReason: ProductPostcheckSkipReason | null;
  warnings: ProductPostcheckWarning[];
  warningCount: number;
  productBlocked: boolean;
  durationMs: number;
  checkedUrl: string | null;
};

type DomSnapshot = {
  anchors: Array<{ href: string; text: string | null; targetExists: boolean }>;
  images: Array<{ src: string; alt: string | null; naturalWidth: number; complete: boolean }>;
  ctas: Array<{
    tag: string;
    text: string | null;
    href: string | null;
    disabled: boolean;
    ariaDisabled: boolean;
    ariaControls: string | null;
    ariaExpanded: string | null;
    type: string | null;
    inForm: boolean;
    formAction: string | null;
    demoOnly: boolean;
  }>;
  forms: Array<{
    id: string | null;
    action: string | null;
    method: string | null;
    hasSubmitControl: boolean;
    disabled: boolean;
    ariaDisabled: boolean;
    demoOnly: boolean;
    text: string | null;
  }>;
};

type MobileMenuCheck =
  | { status: "not_applicable" }
  | { status: "passed" }
  | { status: "failed"; reason: string };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "vm-fly-jakem.fly.dev",
]);

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function allowedPreviewHosts(): Set<string> {
  const out = new Set(DEFAULT_ALLOWED_HOSTS);
  const configuredPreviewHost = normalizeHost(getPreviewHostBaseUrl());
  if (configuredPreviewHost) out.add(configuredPreviewHost);
  const appHost = normalizeHost(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL);
  if (appHost && (appHost === "localhost" || appHost.endsWith(".localhost"))) {
    out.add(appHost);
  }
  return out;
}

export function isAllowedProductPostcheckUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (allowedPreviewHosts().has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  // Local IPv6 hosts are normalized by URL as `[::1]` in some runtimes.
  if (host === "[::1]") return true;
  return false;
}

function textPreview(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return trimmed ? trimmed.slice(0, 120) : null;
}

function warning(
  code: ProductPostcheckWarningCode,
  message: string,
  extra: Omit<ProductPostcheckWarning, "code" | "message"> = {},
): ProductPostcheckWarning {
  return { code, message, ...extra };
}

export function evaluateProductDomSnapshot(
  snapshot: DomSnapshot,
  mobileMenu: MobileMenuCheck,
): ProductPostcheckWarning[] {
  const warnings: ProductPostcheckWarning[] = [];

  for (const anchor of snapshot.anchors) {
    if (!anchor.targetExists) {
      warnings.push(
        warning("broken_anchor", `Anchor target saknas för ${anchor.href}`, {
          href: anchor.href,
          text: textPreview(anchor.text),
        }),
      );
    }
  }

  for (const img of snapshot.images) {
    if (img.complete && img.naturalWidth <= 0) {
      warnings.push(
        warning("broken_image", `Bilden laddade inte: ${img.src}`, {
          src: img.src,
          alt: textPreview(img.alt),
        }),
      );
    }
  }

  for (const cta of snapshot.ctas) {
    if (cta.disabled || cta.ariaDisabled || cta.demoOnly) continue;
    if (cta.tag === "a") {
      const href = cta.href?.trim() || "";
      if (!href || href === "#") {
        warnings.push(
          warning("cta_no_handler", "CTA-länk saknar mål.", {
            text: textPreview(cta.text),
            href: cta.href,
          }),
        );
      }
      continue;
    }

    const hasAction =
      cta.inForm ||
      cta.type === "submit" ||
      Boolean(cta.ariaControls?.trim()) ||
      typeof cta.ariaExpanded === "string";
    if (!hasAction) {
      warnings.push(
        warning("cta_no_handler", "CTA-knapp saknar tydlig handling.", {
          text: textPreview(cta.text),
          selector: "button",
        }),
      );
    }
  }

  for (const form of snapshot.forms) {
    if (form.disabled || form.ariaDisabled || form.demoOnly) continue;
    if (form.action?.trim()) continue;
    if (form.hasSubmitControl) {
      warnings.push(
        warning("fake_form", "Formulär ser aktivt ut men saknar action/integration.", {
          formId: form.id,
          text: textPreview(form.text),
        }),
      );
    }
  }

  if (mobileMenu.status === "failed") {
    warnings.push(
      warning("mobile_menu_failed", `Mobilmeny kunde inte verifieras: ${mobileMenu.reason}`),
    );
  }

  return warnings;
}

export function productPostcheckSkipReasonFromError(err: unknown): ProductPostcheckSkipReason {
  if (!(err instanceof Error)) return "runtime_error";
  if (/timeout/i.test(err.message)) return "timeout";
  if (/playwright|browser/i.test(err.message)) return "playwright_unavailable";
  if (/navigation|net::|err_/i.test(err.message)) return "navigation_failed";
  return "runtime_error";
}

function skippedResult(
  reason: ProductPostcheckSkipReason,
  durationMs: number,
  checkedUrl: string | null = null,
): ProductPostcheckResult {
  return {
    ok: true,
    skipped: true,
    skippedReason: reason,
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    durationMs,
    checkedUrl,
  };
}

export async function runProductPostcheck(params: {
  previewUrl: string;
  chatId: string;
  versionId: string;
  timeoutMs?: number;
}): Promise<ProductPostcheckResult> {
  const startedAt = Date.now();
  const previewUrl = params.previewUrl.trim();
  if (!previewUrl) return skippedResult("missing_preview_url", 0, null);
  if (!isAllowedProductPostcheckUrl(previewUrl)) {
    return skippedResult("url_not_allowed", Date.now() - startedAt, previewUrl);
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;
  let page: Awaited<ReturnType<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>["newPage"]>> | null = null;
  let mobilePage: Awaited<ReturnType<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>["newPage"]>> | null = null;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    await page.goto(previewUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(8_000, timeoutMs) }).catch(() => {});

    const snapshot = await page.evaluate<DomSnapshot>(() => {
      const visible = (el: Element): boolean => {
        const html = el as HTMLElement;
        const rect = html.getBoundingClientRect();
        const style = window.getComputedStyle(html);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const text = (el: Element): string | null =>
        ((el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160) || null;
      const isDemoOnly = (el: Element): boolean =>
        el.hasAttribute("data-demo-only") ||
        el.closest("[data-demo-only]") !== null ||
        /demo only|demo-läge|ej aktivt|disabled/i.test(text(el) || "");
      const ctaText = /^(utforska|starta|kom igång|bygg|boka|kontakta|skicka|köp|läs mer|learn more|get started|contact|submit|send|book)/i;
      const ctaClass = /(cta|button|btn|primary|action)/i;

      return {
        anchors: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
          .map((a) => {
            const href = a.getAttribute("href") || "";
            const target = href.slice(1);
            return { href, text: text(a), targetExists: href === "#" || Boolean(target && document.getElementById(target)) };
          })
          .filter((a) => a.href !== "#"),
        images: Array.from(document.querySelectorAll<HTMLImageElement>("img"))
          .filter(visible)
          .map((img) => ({
            src: img.currentSrc || img.src,
            alt: img.alt || null,
            naturalWidth: img.naturalWidth || 0,
            complete: img.complete,
          })),
        ctas: Array.from(document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a,button"))
          .filter(visible)
          .filter((el) => {
            const t = text(el) || "";
            const cls = (el as HTMLElement).className?.toString?.() || "";
            return ctaText.test(t) || ctaClass.test(cls);
          })
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: text(el),
            href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
            disabled: el instanceof HTMLButtonElement ? el.disabled : false,
            ariaDisabled: el.getAttribute("aria-disabled") === "true",
            ariaControls: el.getAttribute("aria-controls"),
            ariaExpanded: el.getAttribute("aria-expanded"),
            type: el instanceof HTMLButtonElement ? el.type || null : null,
            inForm: Boolean(el.closest("form")),
            formAction: el instanceof HTMLButtonElement ? el.formAction || null : null,
            demoOnly: isDemoOnly(el),
          })),
        forms: Array.from(document.querySelectorAll<HTMLFormElement>("form"))
          .filter(visible)
          .map((form) => ({
            id: form.id || null,
            action: form.getAttribute("action"),
            method: form.getAttribute("method"),
            hasSubmitControl: Boolean(form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')),
            disabled: Boolean(form.querySelector("[disabled]")),
            ariaDisabled: form.getAttribute("aria-disabled") === "true",
            demoOnly: isDemoOnly(form),
            text: text(form),
          })),
      };
    });

    mobilePage = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobilePage.goto(previewUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const mobileMenu = await mobilePage.evaluate<MobileMenuCheck>(async () => {
      const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
        const label = [
          button.getAttribute("aria-label"),
          button.textContent,
          button.className?.toString?.(),
        ].join(" ");
        return /menu|meny|hamburger|navigation|nav/i.test(label);
      });
      const button = candidates[0];
      if (!button) return { status: "not_applicable" };
      const beforeExpanded = button.getAttribute("aria-expanded");
      const beforeText = document.body.innerText;
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const afterExpanded = button.getAttribute("aria-expanded");
      const afterText = document.body.innerText;
      if (beforeExpanded !== afterExpanded || beforeText !== afterText) {
        return { status: "passed" };
      }
      return { status: "failed", reason: "hamburger_button_did_not_change_dom_or_aria" };
    });

    const warnings = evaluateProductDomSnapshot(snapshot, mobileMenu);
    return {
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings,
      warningCount: warnings.length,
      productBlocked: false,
      durationMs: Date.now() - startedAt,
      checkedUrl: previewUrl,
    };
  } catch (err) {
    const reason = productPostcheckSkipReasonFromError(err);
    console.warn("[product-postcheck] skipped:", err);
    return skippedResult(reason, Date.now() - startedAt, previewUrl);
  } finally {
    await mobilePage?.close().catch(() => {});
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
