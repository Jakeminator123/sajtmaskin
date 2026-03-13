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

const didSchema = z.object({
  name: z.string().max(200).optional().default(""),
  email: z.string().max(320).optional().default(""),
  subject: z.string().max(400).optional().default(""),
  message: z.string().max(8000).optional().default(""),
  type: z.enum(["feedback", "bug", "question", "other"]).optional().default("feedback"),
  transcript: z.string().max(12000).optional(),
});

function fallback(value: string | undefined, def: string): string {
  return value && value.trim().length > 0 ? value.trim() : def;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  return withRateLimit(req, "did:conversation", async () => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = didSchema.safeParse(raw);

      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid payload", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const data = parsed.data;

      const name = fallback(data.name, "D-ID Besökare");
      const rawEmail = data.email?.trim() ?? "";
      const email = EMAIL_RE.test(rawEmail) ? rawEmail : "avatar-lead@sajtmaskin.se";
      const subject = fallback(data.subject, "Avatar-konversation avslutad");

      let message = fallback(data.message, "");
      if (data.transcript) {
        message = message
          ? `${message}\n\n--- Transkript ---\n${data.transcript.trim()}`
          : data.transcript.trim();
      }
      if (!message || message.length < 3) {
        message =
          "En besökare avslutade en konversation med D-ID-avataren utan att lämna detaljer.";
      }

      const fullSubject = `[Sajtmaskin D-ID Lead] ${subject}`;

      const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">
            D-ID Avatar Lead
          </h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">
            En besökare pratade med avataren på sajtmaskin.se
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
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Ämne</td>
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

      if (resendKey) {
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
          return NextResponse.json(
            { success: false, error: "Email delivery failed" },
            { status: 500 },
          );
        }

        debugLog("DID", "D-ID lead email sent", { to: RECIPIENTS, subject: fullSubject });
      } else {
        console.info("[DID] Lead would be sent (no RESEND_API_KEY):", {
          to: RECIPIENTS,
          name,
          email,
          subject: fullSubject,
          messageLength: message.length,
        });
      }

      return NextResponse.json({ success: true, lead: { name, email, subject } });
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
