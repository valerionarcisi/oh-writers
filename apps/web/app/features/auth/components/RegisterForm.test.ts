import { describe, expect, it } from "vitest";
import { translate } from "@oh-writers/domain";
import { buildRegisterSchema } from "./RegisterForm";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

const VALID = {
  name: "Jane Smith",
  email: "jane@example.com",
  password: "Password123",
};

describe("buildRegisterSchema — consent (Spec 88)", () => {
  it("rejects submission when consent is false", () => {
    const result = buildRegisterSchema(t).safeParse({
      ...VALID,
      consent: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const consentIssue = result.error.issues.find(
        (issue) => issue.path[0] === "consent",
      );
      expect(consentIssue?.message).toBe(
        t("auth.register.validation.consentRequired"),
      );
    }
  });

  it("accepts submission when consent is true and other fields are valid", () => {
    const result = buildRegisterSchema(t).safeParse({
      ...VALID,
      consent: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password missing complexity (all-lowercase, no digit)", () => {
    const result = buildRegisterSchema(t).safeParse({
      ...VALID,
      password: "onlylowercase",
      consent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordIssue = result.error.issues.find(
        (issue) => issue.path[0] === "password",
      );
      expect(passwordIssue?.message).toBe(
        t("auth.register.validation.passwordComplexity"),
      );
    }
  });
});
