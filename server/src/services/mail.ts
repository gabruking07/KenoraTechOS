import nodemailer from 'nodemailer';

export function mailConfigured() { const authComplete=Boolean(process.env.SMTP_USER)===Boolean(process.env.SMTP_PASS); return Boolean(process.env.SMTP_HOST && Number(process.env.SMTP_PORT)>0 && process.env.SMTP_FROM && authComplete); }
export async function sendPasswordReset(email: string, token: string) {
  if (!mailConfigured()) return false;
  const port = Number(process.env.SMTP_PORT), secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure, ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } } : {}) });
  const origin = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: email, subject: 'KenoraTech OS password reset', text: `Use this one-time link within 20 minutes to reset your password:\n\n${origin}/#reset=${encodeURIComponent(token)}\n\nIf you did not request this, ignore this email.` });
  return true;
}
