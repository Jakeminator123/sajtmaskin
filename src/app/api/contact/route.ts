/**
 * API Route: Contact form / feedback email
 * POST /api/contact
 *
 * Sends feedback/bug reports/questions to the team.
 * Uses Resend if RESEND_API_KEY is set, otherwise falls back to
 * logging the message (so the form still works in dev).
 *
 * Recipients: hej@sajtmaskin.se + erik@sajtstudio.se
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { debugLog, errorLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 15;

const RECIPIENTS = [
  "hej@sajtmaskin.se",
  "erik@sajtstudio.se",
];

// Prefer unified EMAIL_FROM, keep RESEND_FROM_EMAIL for backward compatibility.
const FROM_ADDRESS =
  process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "Sajtmaskin <onboarding@resend.dev>";

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200).optional().default("Kontaktformulär"),
  message: z.string().min(5).max(5000),
  type: z.enum(["feedback", "bug", "question", "other"]).optional().default("other"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig data", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { name, email, subject, message, type } = parsed.data;

    const typeLabels: Record<string, string> = {
      feedback: "Feedback",
      bug: "Buggrapport",
      question: "Fråga",
      other: "Meddelande",
    };

    const fullSubject = `[Sajtmaskin ${typeLabels[type]}] ${subject}`;

    const htmlBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0a0a0a; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">
            ${typeLabels[type]} från Sajtmaskin
          </h2>
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
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Typ</td>
              <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${typeLabels[type]}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <div style="color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
        </div>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">
          Skickat via sajtmaskin.se kontaktformulär
        </p>
      </div>
    `;

    const resendKey = process.env.RESEND_API_KEY?.trim();

    if (resendKey) {
      // Send via Resend
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);

      const { error: sendError } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: RECIPIENTS,
        replyTo: email,
        subject: fullSubject,
        html: htmlBody,
      });

      if (sendError) {
        errorLog("CONTACT", "Resend send error", sendError);
        return NextResponse.json(
          { error: "Kunde inte skicka meddelandet. Försök igen." },
          { status: 500 },
        );
      }

      debugLog("CONTACT", "Email sent via Resend", {
        to: RECIPIENTS,
        subject: fullSubject,
      });
    } else {
      // Fallback: log the message (dev environment)
      console.log("═══════════════════════════════════════════");
      console.log("[CONTACT] Email would be sent (no RESEND_API_KEY):");
      console.log(`  To: ${RECIPIENTS.join(", ")}`);
      console.log(`  From: ${email} (${name})`);
      console.log(`  Subject: ${fullSubject}`);
      console.log(`  Message: ${message.slice(0, 200)}...`);
      console.log("═══════════════════════════════════════════");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    errorLog("CONTACT", "Contact form error", err);
    return NextResponse.json(
      { error: "Internt fel. Försök igen eller mejla hej@sajtmaskin.se direkt." },
      { status: 500 },
    );
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
