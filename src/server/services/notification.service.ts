import nodemailer from 'nodemailer';
import { env } from '../env.js';

/**
 * Email notification service.
 *
 * Uses nodemailer SMTP configured from env. When SMTP_HOST is empty (typical in
 * dev), emails are logged to the console instead of sent — so the app never
 * blocks on email and works without a mail server configured.
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Send an email, or log it when SMTP isn't configured. Never throws. */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    const t = getTransporter();
    if (!t) {
      console.log(`[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
      return;
    }
    await t.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (err) {
    // Email failures must never break the user-facing request.
    console.error('Failed to send email:', err);
  }
}

/** Notify a user their signup was received. */
export function sendSignupConfirmation(args: {
  email: string;
  name: string;
  eventName: string;
  role: 'judge' | 'competitor';
}): Promise<void> {
  return sendMail({
    to: args.email,
    subject: `You're signed up for ${args.eventName}`,
    text: `Hi ${args.name},\n\nYou're signed up to ${args.role === 'judge' ? 'judge' : 'compete'} at "${args.eventName}". We'll email your assignment once signups close.\n\nThanks!`,
  });
}

/** Notify a user of their finalized assignment. */
export function sendAssignmentNotification(args: {
  email: string;
  name: string;
  eventName: string;
  details: string;
}): Promise<void> {
  return sendMail({
    to: args.email,
    subject: `Your assignment for ${args.eventName}`,
    text: `Hi ${args.name},\n\nYour assignment for "${args.eventName}" is ready:\n\n${args.details}\n\nSee full details at ${env.APP_BASE_URL}.\n\nThanks!`,
  });
}