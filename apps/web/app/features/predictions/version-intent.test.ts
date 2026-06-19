import { describe, it, expect } from "vitest";
import { userRequestedNewVersion } from "./version-intent";

describe("[OHW-N66] userRequestedNewVersion", () => {
  it("detects an explicit 'nuova versione' request", () => {
    expect(
      userRequestedNewVersion("fanne una nuova versione, riscrivi tutto"),
    ).toBe(true);
  });

  it("detects 'salva questa versione'", () => {
    expect(
      userRequestedNewVersion("salva questa versione e parti da capo"),
    ).toBe(true);
  });

  it("detects 'tieni questa e' (keep-and-restart phrasing)", () => {
    expect(userRequestedNewVersion("tieni questa e ricomincia da zero")).toBe(
      true,
    );
  });

  it("is case-insensitive", () => {
    expect(userRequestedNewVersion("Crea Una Versione nuova")).toBe(true);
  });

  it("a plain edit instruction is NOT a request", () => {
    expect(
      userRequestedNewVersion("rendi il secondo paragrafo più asciutto"),
    ).toBe(false);
  });

  it("the bare word 'versione' without a verb is NOT a request", () => {
    expect(
      userRequestedNewVersion("nella versione attuale il tono è sbagliato"),
    ).toBe(false);
  });

  it("null / empty instruction is never a request", () => {
    expect(userRequestedNewVersion(null)).toBe(false);
    expect(userRequestedNewVersion(undefined)).toBe(false);
    expect(userRequestedNewVersion("")).toBe(false);
  });
});
