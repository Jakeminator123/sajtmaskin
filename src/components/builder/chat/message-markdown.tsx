import type { AnchorHTMLAttributes } from "react";
import type { Components, ExtraProps } from "streamdown";

/**
 * Streamdown 2.x renders inline links inside a wrapper that, in
 * combination with the link-safety modal portal, occasionally injects
 * block-level elements inside `<p>` tags during hydration ("nested
 * `<a>`/`<div>` inside `<p>`" warning in console). We don't need the
 * link-safety popup or fancy preview affordance for assistant messages,
 * so render a plain anchor instead. This is the documented escape
 * hatch: the `components` prop forwards ReactMarkdown's component
 * override map straight through.
 *
 * Streamdown's `Components` intersects a per-tag prop map with a string
 * index signature — those two shapes are incompatible under strict
 * function checks, so we cast the override map once.
 *
 * If/when Streamdown ships an explicit `linkPreview={false}` toggle
 * this override can be replaced.
 */
export const STREAMDOWN_PLAIN_COMPONENTS = {
  a: ({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) => (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
} as Components;
