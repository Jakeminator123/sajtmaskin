import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StructuredToolParts } from "./BuilderMessageTooling";

describe("StructuredToolParts", () => {
  it("keeps clarification prompts as free-text questions when no approval intent exists", () => {
    render(
      <StructuredToolParts
        messageId="msg_1"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:question",
              state: "input-available",
              input: {
                question: "Vilket domännamn vill du använda för sajten?",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Vilket domännamn vill du använda för sajten?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Godkänn förslag" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avvisa förslag" })).toBeNull();
  });

  it("adds synthetic approval options only for actual approval flows", () => {
    render(
      <StructuredToolParts
        messageId="msg_2"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:approval",
              state: "approval-requested",
              input: {
                question: "Godkänner du planen innan jag fortsätter?",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avvisa förslag" })).toBeTruthy();
  });

  it("shows quality-gate pending separately from queued autofix work", () => {
    render(
      <StructuredToolParts
        messageId="msg_3"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:post-check",
              state: "output-available",
              output: {
                summary: {
                  files: 3,
                  added: 1,
                  modified: 2,
                  removed: 0,
                  warnings: 0,
                  provisional: true,
                  qualityGatePending: true,
                  autoFixQueued: false,
                },
                demoUrl: "https://preview.example",
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
      />,
    );

    expect(screen.getByText("Status: quality gate körs fortfarande")).toBeTruthy();
    expect(screen.queryByText(/autofix är köad/i)).toBeNull();
  });

  it("shows business workflow quick actions from post-check output", () => {
    render(
      <StructuredToolParts
        messageId="msg_4"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:post-check",
              state: "output-available",
              output: {
                summary: {
                  files: 4,
                  added: 1,
                  modified: 3,
                  removed: 0,
                  warnings: 0,
                  provisional: false,
                  qualityGatePending: false,
                  autoFixQueued: false,
                },
                demoUrl: "https://preview.example",
                businessWorkflowSummary: {
                  packCount: 2,
                  labels: ["Lead form + email routing", "Booking / calendar"],
                  suggestedPrompts: [
                    "Gör leadformuläret produktionsredo med e-postrouting eller CRM-koppling, tydlig success/error-feedback och utan att ändra designen i övrigt.",
                    "Koppla boknings-CTA:n till ett riktigt bokningsflöde med Cal.com eller Calendly och behåll resten av sidan som den är.",
                  ],
                  recommendedIntegrations: ["Resend", "Calendly"],
                  hasLeadCapture: true,
                  hasBookingFlow: true,
                  hasCrmSync: false,
                },
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Snabb konfigurering")).toBeTruthy();
    expect(screen.getByText("Vilket affärsflöde vill du konfigurera härnäst?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Konfigurera Lead form \+ email routing/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Konfigurera Booking \/ calendar/i })).toBeTruthy();
  });

  it("shows SEO quick actions from post-check output", () => {
    render(
      <StructuredToolParts
        messageId="msg_5"
        toolParts={[
          {
            type: "tool",
            tool: {
              type: "tool:post-check",
              state: "output-available",
              output: {
                summary: {
                  files: 4,
                  added: 1,
                  modified: 2,
                  removed: 0,
                  warnings: 2,
                  provisional: false,
                  qualityGatePending: false,
                  autoFixQueued: false,
                },
                demoUrl: "https://preview.example",
                seoSummary: {
                  passed: false,
                  issueCount: 3,
                  topIssues: [
                    "Metadata saknar canonical-strategi.",
                    "Projektet saknar app/robots.ts.",
                  ],
                  suggestedPrompts: [
                    "Fyll ut metadata för sajten med title och description utan att ändra sidlayouten.",
                    "Lägg till en canonical-strategi i metadata för sajten utan att ändra designen i övrigt.",
                    "Lägg till robots.ts och sitemap.ts med rimliga standarder för indexering utan att ändra designen.",
                  ],
                  suggestedLabels: ["metadata", "canonical", "robots"],
                  canonical: false,
                  ogImage: false,
                  homeH1Count: 1,
                },
              },
            },
          } as never,
        ]}
        pendingReply={null}
        hasUserAfterCurrentMessage={false}
        pendingQuickReplyKey={null}
        onQuickReply={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Snabb SEO-fix")).toBeTruthy();
    expect(screen.getByText("Vilken SEO-del vill du förbättra härnäst?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fixa metadata/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fixa canonical/i })).toBeTruthy();
  });
});
