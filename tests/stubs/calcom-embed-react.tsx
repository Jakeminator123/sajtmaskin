import type { HTMLAttributes } from "react";

interface CalStubProps extends HTMLAttributes<HTMLDivElement> {
  calLink: string;
  namespace?: string;
  config?: Record<string, unknown>;
}

export default function CalStub({ calLink, namespace, config, ...props }: CalStubProps) {
  return (
    <div
      data-testid="calcom-embed"
      data-cal-link={calLink}
      data-cal-namespace={namespace}
      data-cal-config={JSON.stringify(config ?? {})}
      {...props}
    />
  );
}
