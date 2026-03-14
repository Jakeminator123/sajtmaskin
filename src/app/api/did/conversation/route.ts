/**
 * API Route: D-ID avatar conversation endpoint
 * POST /api/did/conversation
 *
 * Tolerant endpoint for D-ID "End of conversation" tool/webhook.
 * Accepts partial data, fills safe defaults, then forwards to
 * the existing contact/email pipeline.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { SECRETS } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import { debugLog, errorLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 15;

const RECIPIENTS = ["hej@sajtmaskin.se", "erik@sajtstudio.se"];
const FROM_ADDRESS = SECRETS.emailFrom;

const directSchema = z.object({
  name: z.string().max(200).optional().default(""),
  email: z.string().max(320).optional().default(""),
  subject: z.string().max(400).optional().default(""),
  message: z.string().max(8000).optional().default(""),
  type: z.enum(["feedback", "bug", "question", "other"]).optional().default("feedback"),
  transcript: z.string().max(12000).optional(),
});

const didWebhookMessageSchema = z.object({
  role: z.enum(["user", "assistant"]).catch("user"),
  content: z.string().max(8000).catch(""),
});

const didWebhookSchema = z.object({
  event_type: z.string().optional(),
  agent_id: z.string().optional(),
  chat_id: z.string().optional(),
  chat_history: z
    .object({
      messages: z.array(didWebhookMessageSchema).optional().default([]),
    })
    .optional(),
});

function fallback(value: string | undefined, def: string): string {
  return value && value.trim().length > 0 ? value.trim() : def;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildTranscript(messages: z.infer<typeof didWebhookMessageSchema>[]): string {
  if (!messages.length) return "";
  return messages
    .map((m) => `${m.role === "user" ? "Besökare" : "Avatar"}: ${m.content}`)
    .join("\n");
}

function normalizePayload(raw: Record<string, unknown>): {
  name: string;
  email: string;
  subject: string;
  message: string;
} {
  const webhook = didWebhookSchema.safeParse(raw);
  if (webhook.success && webhook.data.chat_history?.messages?.length) {
    const transcript = buildTranscript(webhook.data.chat_history.messages);
    return {
      name: "D-ID Besökare",
      email: "avatar-lead@sajtmaskin.se",
      subject: "Avatar-konversation avslutad",
      message: transcript || "Konversation utan meddelanden.",
    };
  }

  const direct = directSchema.safeParse(raw);
  if (direct.success) {
    const d = direct.data;
    const rawEmail = d.email?.trim() ?? "";
    let message = fallback(d.message, "");
    if (d.transcript) {
      message = message
        ? `${message}\n\n--- Transkript ---\n${d.transcript.trim()}`
        : d.transcript.trim();
    }
    if (!message || message.length < 3) {
      message = "En besökare avslutade en konversation med D-ID-avataren utan att lämna detaljer.";
    }
    return {
      name: fallback(d.name, "D-ID Besökare"),
      email: EMAIL_RE.test(rawEmail) ? rawEmail : "avatar-lead@sajtmaskin.se",
      subject: fallback(d.subject, "Avatar-konversation avslutad"),
      message,
    };
  }

  return {
    name: "D-ID Besökare",
    email: "avatar-lead@sajtmaskin.se",
    subject: "Avatar-konversation avslutad",
    message: "En besökare avslutade en konversation med D-ID-avataren utan att lämna detaljer.",
  };
}

export async function POST(req: Request) {
  return withRateLimit(req, "did:conversation", async () => {
    try {
      const raw = await req.json().catch(() => ({}));
      const { name, email, subject, message } = normalizePayload(raw as Record<string, unknown>);

      const fullSubject = `[Sajtmaskin D-ID Lead] ${subject}`;

      const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">
            D-ID Avatar Lead
          </h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">
            En bes&ouml;kare pratade med avataren p&aring; sajtmaskin.se
          </p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 80px;">Namn</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">E-post</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">
                <a href="mailto:${escapeHtml(email)}" style="color: #3b82f6;">${escapeHtml(email)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">&Auml;mne</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${escapeHtml(subject)}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <div style="color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
        </div>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">
          Skickat automatiskt av D-ID avatar-integration
        </p>
      </div>`;

      const resendKey = process.env.RESEND_API_KEY?.trim();
      let emailSent = false;

      if (resendKey) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(resendKey);

          const { error: sendError } = await resend.emails.send({
            from: FROM_ADDRESS,
            to: RECIPIENTS,
            replyTo: email !== "avatar-lead@sajtmaskin.se" ? email : undefined,
            subject: fullSubject,
            html: htmlBody,
          });

          if (sendError) {
            errorLog("DID", "Resend send error", sendError);
          } else {
            emailSent = true;
            debugLog("DID", "D-ID lead email sent", { to: RECIPIENTS, subject: fullSubject });
          }
        } catch (emailErr) {
          errorLog("DID", "Resend threw", emailErr);
        }
      } else {
        console.info("[DID] Lead would be sent (no RESEND_API_KEY):", {
          to: RECIPIENTS,
          name,
          email,
          subject: fullSubject,
          messageLength: message.length,
        });
      }

      debugLog("DID", "Webhook processed", { name, email, subject, emailSent });
      return NextResponse.json({ success: true, emailSent, lead: { name, email, subject } });
    } catch (err) {
      errorLog("DID", "D-ID conversation endpoint error", err);
      return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
    }
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
