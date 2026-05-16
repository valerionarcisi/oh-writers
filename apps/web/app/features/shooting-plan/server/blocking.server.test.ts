import { describe, it, expect, vi } from "vitest";
import { BLOCKING_TEMPLATES } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { __test__ } from "./blocking.server";

const { inferTemplateKey, loadOrCreateLocation } = __test__;

// ─── inferTemplateKey ──────────────────────────────────────────────────────────

describe("inferTemplateKey", () => {
  it("returns 'restaurant' for headings containing 'pizzeria'", () => {
    expect(inferTemplateKey("INT. PIZZERIA NAPOLI - DAY")).toBe("restaurant");
  });

  it("returns 'restaurant' for headings containing 'ristorante'", () => {
    expect(inferTemplateKey("INT. RISTORANTE LUIGI - NIGHT")).toBe("restaurant");
  });

  it("returns 'kitchen' for headings containing 'cucina'", () => {
    expect(inferTemplateKey("INT. CUCINA CASA DI MARCO - DAY")).toBe("kitchen");
  });

  it("returns 'bedroom' for headings containing both 'camera' and 'letto'", () => {
    expect(inferTemplateKey("INT. CAMERA DA LETTO - NIGHT")).toBe("bedroom");
  });

  it("returns 'office' for headings containing 'ufficio'", () => {
    expect(inferTemplateKey("INT. UFFICIO DEL DIRETTORE - DAY")).toBe("office");
  });

  it("returns 'car_interior' for headings containing 'auto'", () => {
    expect(inferTemplateKey("INT. AUTO IN MOVIMENTO - DAY")).toBe("car_interior");
  });

  it("returns 'car_interior' for headings containing 'macchina'", () => {
    expect(inferTemplateKey("INT. MACCHINA - NIGHT")).toBe("car_interior");
  });

  it("returns 'exterior_street' when heading starts with 'ext'", () => {
    expect(inferTemplateKey("EXT. PIAZZA DEL COMUNE - DAY")).toBe("exterior_street");
  });

  it("returns 'exterior_street' for headings containing 'strada'", () => {
    expect(inferTemplateKey("INT. STRADA - DAY")).toBe("exterior_street");
  });

  it("returns 'living_room' as the default fallback", () => {
    expect(inferTemplateKey("INT. SOGGIORNO - DAY")).toBe("living_room");
    expect(inferTemplateKey("")).toBe("living_room");
    expect(inferTemplateKey("INT. UNKNOWN LOCATION - DAY")).toBe("living_room");
  });

  it("is case-insensitive", () => {
    expect(inferTemplateKey("INT. CUCINA - DAY")).toBe("kitchen");
    expect(inferTemplateKey("int. cucina - day")).toBe("kitchen");
  });
});

// ─── loadOrCreateLocation ──────────────────────────────────────────────────────

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

const buildLocationDb = (existingLocation: {
  id: string;
  widthCm: number;
  heightCm: number;
  primitives: unknown[];
} | null) => {
  const insertedRows: unknown[] = [];

  const findFirst = vi.fn(() => Promise.resolve(existingLocation ?? undefined));

  const returning = vi.fn(() =>
    Promise.resolve([
      {
        id: "new-loc-id",
        widthCm: BLOCKING_TEMPLATES.living_room.widthCm,
        heightCm: BLOCKING_TEMPLATES.living_room.heightCm,
        primitives: BLOCKING_TEMPLATES.living_room.primitives,
      },
    ]),
  );

  const values = vi.fn((row: unknown) => {
    insertedRows.push(row);
    return { returning };
  });

  const insert = vi.fn(() => ({ values }));

  const db = {
    query: { locations: { findFirst } },
    insert,
  } as unknown as Db;

  return { db, findFirst, insert, values, returning, insertedRows };
};

describe("loadOrCreateLocation", () => {
  it("returns the existing location when one matches", async () => {
    const existing = {
      id: "existing-id",
      widthCm: 800,
      heightCm: 600,
      primitives: [],
    };
    const { db, insert } = buildLocationDb(existing);

    const result = await loadOrCreateLocation(
      db,
      PROJECT_ID,
      "INT. SOGGIORNO - DAY",
    );

    expect(result.id).toBe("existing-id");
    expect(result.widthCm).toBe(800);
    expect(result.heightCm).toBe(600);
    // No insert should have been called
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a new location when none exists and returns it", async () => {
    const { db, insert } = buildLocationDb(null);

    const result = await loadOrCreateLocation(
      db,
      PROJECT_ID,
      "INT. SOGGIORNO - DAY",
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("new-loc-id");
  });

  it("picks the right template based on the scene heading", async () => {
    const { db, values } = buildLocationDb(null);

    await loadOrCreateLocation(db, PROJECT_ID, "INT. CUCINA - DAY");

    // The inserted row should use kitchen template dimensions
    const inserted = values.mock.calls[0]?.[0] as {
      templateKey: string;
      widthCm: number;
      heightCm: number;
    };
    expect(inserted.templateKey).toBe("kitchen");
    expect(inserted.widthCm).toBe(BLOCKING_TEMPLATES.kitchen.widthCm);
    expect(inserted.heightCm).toBe(BLOCKING_TEMPLATES.kitchen.heightCm);
  });

  it("uses the scene heading as the location name when inserting", async () => {
    const { db, values } = buildLocationDb(null);

    await loadOrCreateLocation(db, PROJECT_ID, "INT. UFFICIO - DAY");

    const inserted = values.mock.calls[0]?.[0] as { name: string };
    expect(inserted.name).toBe("INT. UFFICIO - DAY");
  });

  it("falls back to the template label when heading is empty", async () => {
    const { db, values } = buildLocationDb(null);

    await loadOrCreateLocation(db, PROJECT_ID, "");

    const inserted = values.mock.calls[0]?.[0] as { name: string };
    // Empty heading → falls back to template.label (living_room default)
    expect(inserted.name).toBe(BLOCKING_TEMPLATES.living_room.label);
  });
});
