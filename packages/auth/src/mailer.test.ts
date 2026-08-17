import { describe, it, expect, vi, beforeEach } from "vitest";

// nodemailer is mocked so no real socket is opened. The transport object's
// sendMail is the only surface the mailer touches, so a mock transport returned
// by the mocked createTransport is enough.
const sendMailMock = vi.fn(async () => ({ accepted: ["x@example.com"] }));
const createTransport = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

const freshModule = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const key of Object.keys(env)) process.env[key] = env[key];
  return await import("./mailer");
};

describe("mailer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any host leakage between cases.
    delete process.env["SMTP_HOST"];
    delete process.env["MAIL_FROM"];
  });

  it("no-ops (never throws) and does not touch the transport when SMTP is unconfigured", async () => {
    const m = await freshModule({});
    await expect(
      m.sendMail({ to: "a@x.com", subject: "t", text: "b" }),
    ).resolves.toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("creates a transport with MAIL_FROM and sends when SMTP is configured", async () => {
    const m = await freshModule({
      SMTP_HOST: "smtp.test",
      SMTP_PORT: "2525",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      MAIL_FROM: "no-reply@example.com",
    });
    await m.sendMail({
      to: "person@example.com",
      subject: "Ciao",
      text: "Corpo",
    });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.test",
        auth: { user: "u", pass: "p" },
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@example.com",
        to: "person@example.com",
        subject: "Ciao",
        text: "Corpo",
      }),
    );
  });

  it("swallows a failing transport without throwing (reset must not 500)", async () => {
    const m = await freshModule({
      SMTP_HOST: "smtp.test",
      MAIL_FROM: "no-reply@example.com",
    });
    sendMailMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(
      m.sendMail({ to: "a@x.com", subject: "x", text: "x" }),
    ).resolves.toBeUndefined();
  });

  it("sendResetPasswordEmail targets the user with the reset URL in the body", async () => {
    const m = await freshModule({
      SMTP_HOST: "smtp.test",
      MAIL_FROM: "no-reply@example.com",
    });
    await m.sendResetPasswordEmail({
      user: { email: "writer@example.com" },
      url: "http://localhost:3000/reset-password/abc",
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "writer@example.com",
        subject: expect.stringMatching(/password/i),
        text: expect.stringContaining("/reset-password/abc"),
      }),
    );
  });

  it("sendVerificationEmail targets the user with the verify URL in the body", async () => {
    const m = await freshModule({
      SMTP_HOST: "smtp.test",
      MAIL_FROM: "no-reply@example.com",
    });
    await m.sendVerificationEmail({
      user: { email: "new@example.com" },
      url: "http://localhost:3000/verify-email?token=xyz",
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@example.com",
        subject: expect.stringMatching(/verifica/i),
        text: expect.stringContaining("/verify-email?token=xyz"),
      }),
    );
  });
});
