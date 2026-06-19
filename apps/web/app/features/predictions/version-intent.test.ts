import { describe, it, expect } from "vitest";
import {
  userRequestedNewVersion,
  userConfirmedOverwrite,
} from "./version-intent";

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

describe("[OHW-N66] userConfirmedOverwrite", () => {
  it("detects the 'Sovrascrivi' card choice", () => {
    expect(
      userConfirmedOverwrite(
        "Sovrascrivi la versione corrente con questa modifica.",
      ),
    ).toBe(true);
  });

  it("detects 'applica sulla versione corrente'", () => {
    expect(userConfirmedOverwrite("applica sulla versione corrente")).toBe(
      true,
    );
  });

  it("a normal edit instruction is NOT an overwrite confirmation", () => {
    expect(userConfirmedOverwrite("rendi il finale più cupo")).toBe(false);
  });

  it("null / empty is never a confirmation", () => {
    expect(userConfirmedOverwrite(null)).toBe(false);
    expect(userConfirmedOverwrite("")).toBe(false);
  });
});
