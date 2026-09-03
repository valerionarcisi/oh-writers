import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// SMTP delivery for password reset + email verification (Spec #127). The env
// contract is kept to the four vars below; MAIL_FROM is required to send, but
// the sender degrades to a logged no-op when unset so dev/test never crash on
// a missing mail setup — the app stays fully usable without a mailer.
const SMTP_HOST = process.env["SMTP_HOST"] ?? "";
const SMTP_PORT = Number(process.env["SMTP_PORT"] ?? "587");
const SMTP_USER = process.env["SMTP_USER"] ?? "";
const SMTP_PASS = process.env["SMTP_PASS"] ?? "";
const SMTP_SECURE = process.env["SMTP_SECURE"] === "true";
const MAIL_FROM = process.env["MAIL_FROM"] ?? "";

let transportCache: Transporter | null | undefined;

const getTransport = (): Transporter | null => {
  if (!SMTP_HOST || !MAIL_FROM) return null;
  if (transportCache !== undefined) return transportCache;
  transportCache = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transportCache;
};

export const isMailerConfigured = (): boolean =>
  Boolean(SMTP_HOST && MAIL_FROM);

/**
 * Best-effort send. Never throws: an SMTP outage must not turn a signup or a
 * password reset into a 500 — the caller (better-auth) already told the user
 * "check your email". The failure is logged here for troubleshooting instead.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[mailer] SMTP not configured (SMTP_HOST/MAIL_FROM missing); skipping mail to ${opts.to}`,
    );
    return;
  }
  try {
    await transport.sendMail({ from: MAIL_FROM, ...opts });
  } catch (err) {
    console.error(`[mailer] send failed to ${opts.to}:`, err);
  }
}

export const sendResetPasswordEmail = async (opts: {
  user: { email: string };
  url: string;
}): Promise<void> =>
  sendMail({
    to: opts.user.email,
    subject: "Oh Writers — Reimposta la password",
    text: `Ciao,\n\nriceviamo una richiesta per reimpostare la password del tuo account Oh Writers.\n\nApri questo link per sceglierne una nuova:\n${opts.url}\n\nSe non sei stato tu a richiederla, ignora questa email: la password attuale resta invariata.`,
  });

export const sendVerificationEmail = async (opts: {
  user: { email: string };
  url: string;
}): Promise<void> =>
  sendMail({
    to: opts.user.email,
    subject: "Oh Writers — Verifica il tuo indirizzo email",
    text: `Ciao,\n\nbenvenuto in Oh Writers. Per completare la registrazione verifica il tuo indirizzo email:\n\n${opts.url}\n\nSe non hai creato tu un account, ignora questa email.`,
  });

export const sendTeamInviteEmail = async (opts: {
  to: string;
  teamName: string;
  inviterName: string;
  url: string;
}): Promise<void> =>
  sendMail({
    to: opts.to,
    subject: `${opts.inviterName} ti ha invitato a "${opts.teamName}" su Oh Writers`,
    text: `Ciao,\n\n${opts.inviterName} ti ha invitato a collaborare sul team "${opts.teamName}" su Oh Writers.\n\nApri questo link per accettare l'invito:\n${opts.url}\n\nSe non ti aspettavi questo invito, puoi ignorare questa email.`,
  });
