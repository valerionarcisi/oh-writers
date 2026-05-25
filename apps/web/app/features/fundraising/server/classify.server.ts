import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { isNull, eq } from "drizzle-orm";
import {
  fundraisingItems,
  fundraisingOpportunities,
  type FundraisingItem,
  FUNDRAISING_OPPORTUNITY_STATUSES,
} from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { callHaiku, extractToolUse } from "~/features/ai";
import {
  FundraisingOpportunityOutputSchema,
  type FundraisingOpportunityOutput,
} from "../fundraising.schema";
import { ClassificationError, DbError } from "../fundraising.errors";
import { findMockFixture } from "../_mocks/classify.fixtures";

const CLASSIFY_TOOL_NAME = "classify_opportunity";

const CLASSIFY_TOOL = {
  name: CLASSIFY_TOOL_NAME,
  description:
    "Classify an Italian fundraising post and extract structured opportunity data.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "bando_pubblico",
          "call_festival",
          "residenza",
          "grant_privato",
          "workshop",
          "pitch_forum",
          "other",
        ],
      },
      title: { type: "string" },
      summary: { type: "string" },
      organization: { type: "string" },
      deadline_text: { type: "string" },
      deadline_at: {
        type: "string",
        description: "ISO 8601 date string, or null if unparseable.",
      },
      amount_min: { type: "number" },
      amount_max: { type: "number" },
      amount_text: { type: "string" },
      eligibility: {
        type: "object",
        properties: {
          formats: { type: "array", items: { type: "string" } },
          genres: { type: "array", items: { type: "string" } },
          regions: { type: "array", items: { type: "string" } },
          career_stage: { type: "array", items: { type: "string" } },
        },
        required: ["formats", "genres", "regions", "career_stage"],
      },
      requirements: { type: "string" },
      link: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["kind", "title", "summary", "eligibility", "link", "confidence"],
  },
} as const;

const CLASSIFY_SYSTEM_PROMPT = `You are Cesare, an expert in Italian film industry funding.
Classify the following Italian fundraising post and extract structured opportunity data.
If the post is NOT about a fundraising opportunity (editorial, interview, news, opinion), return kind="other" and confidence=0.
For real opportunities, extract: deadline (ISO 8601), amount range (EUR), eligibility (formats/genres/regions/career_stage), requirements.
Be conservative with confidence: 0.9+ only for clear, complete opportunities.`;

const deriveStatus = (
  deadlineAt: Date | null,
  confidence: number,
): (typeof FUNDRAISING_OPPORTUNITY_STATUSES)[number] => {
  if (deadlineAt !== null && deadlineAt < new Date()) return "expired";
  if (confidence < 0.5) return "unknown";
  return "active";
};

const classifyWithMock = (
  item: FundraisingItem,
): ResultAsync<FundraisingOpportunityOutput, ClassificationError> => {
  const output = findMockFixture(item.title);
  return okAsync(output);
};

const classifyWithAI = (
  item: FundraisingItem,
): ResultAsync<FundraisingOpportunityOutput, ClassificationError> => {
  const userMessage = `Title: ${item.title}\n\nContent:\n${item.rawText.slice(0, 4000)}`;
  return callHaiku(
    {
      system: CLASSIFY_SYSTEM_PROMPT,
      fewShot: {},
      user: userMessage,
      maxTokens: 1024,
      tools: [CLASSIFY_TOOL],
      toolChoice: { type: "tool", name: CLASSIFY_TOOL_NAME },
    },
    "classifyFundraisingItem",
  )
    .mapErr((e) => new ClassificationError(item.id, e.message))
    .andThen((result) => {
      const raw = extractToolUse(result.content, CLASSIFY_TOOL_NAME);
      const parsed = FundraisingOpportunityOutputSchema.safeParse(raw);
      if (!parsed.success) {
        return errAsync(new ClassificationError(item.id, parsed.error.message));
      }
      return okAsync(parsed.data);
    });
};

const upsertOpportunity = (
  db: Db,
  itemId: string,
  itemUrl: string,
  output: FundraisingOpportunityOutput,
): ResultAsync<void, DbError> => {
  const deadlineAt = output.deadline_at ? new Date(output.deadline_at) : null;
  const status = deriveStatus(deadlineAt, output.confidence);

  return ResultAsync.fromPromise(
    db
      .insert(fundraisingOpportunities)
      .values({
        itemId,
        kind: output.kind,
        title: output.title,
        summary: output.summary,
        organization: output.organization,
        deadlineAt,
        deadlineText: output.deadline_text,
        amountMin:
          output.amount_min !== null ? String(output.amount_min) : null,
        amountMax:
          output.amount_max !== null ? String(output.amount_max) : null,
        amountText: output.amount_text,
        eligibility: {
          formats: output.eligibility.formats,
          genres: output.eligibility.genres,
          regions: output.eligibility.regions,
          careerStage: output.eligibility.career_stage,
        },
        requirements: output.requirements,
        link: output.link || itemUrl,
        status,
        confidence: String(output.confidence),
        classifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fundraisingOpportunities.itemId,
        set: {
          kind: output.kind,
          title: output.title,
          summary: output.summary,
          organization: output.organization,
          deadlineAt,
          deadlineText: output.deadline_text,
          amountMin:
            output.amount_min !== null ? String(output.amount_min) : null,
          amountMax:
            output.amount_max !== null ? String(output.amount_max) : null,
          amountText: output.amount_text,
          eligibility: {
            formats: output.eligibility.formats,
            genres: output.eligibility.genres,
            regions: output.eligibility.regions,
            careerStage: output.eligibility.career_stage,
          },
          requirements: output.requirements,
          link: output.link || itemUrl,
          status,
          confidence: String(output.confidence),
          classifiedAt: new Date(),
        },
      }),
    (e) => new DbError("upsertFundraisingOpportunity", e),
  ).map(() => undefined);
};

export const classifyItem = (
  db: Db,
  item: FundraisingItem,
): ResultAsync<void, ClassificationError | DbError> => {
  const classify =
    process.env["MOCK_AI"] === "true" ? classifyWithMock : classifyWithAI;

  return classify(item).andThen((output) =>
    upsertOpportunity(db, item.id, item.url, output),
  );
};

export const classifyPendingItems = (
  db: Db,
): ResultAsync<number, DbError | ClassificationError> => {
  const BATCH_LIMIT = 20;

  return ResultAsync.fromPromise(
    db
      .select({ item: fundraisingItems })
      .from(fundraisingItems)
      .leftJoin(
        fundraisingOpportunities,
        eq(fundraisingOpportunities.itemId, fundraisingItems.id),
      )
      .where(isNull(fundraisingOpportunities.id))
      .limit(BATCH_LIMIT),
    (e) =>
      new DbError("findUnclassifiedItems", e) as DbError | ClassificationError,
  ).andThen((rows) => {
    const items = rows.map((r) => r.item);
    if (items.length === 0) return okAsync(0);

    return ResultAsync.fromPromise(
      (async () => {
        let successCount = 0;
        for (const item of items) {
          const result = await classifyItem(db, item);
          if (result.isOk()) {
            successCount += 1;
          } else {
            // Per-item errors are logged but do not abort the batch.
            console.error(
              `[fundraising] classification skipped for item ${item.id}: ${result.error.message}`,
            );
          }
        }
        return successCount;
      })(),
      (e) =>
        new DbError("classifyPendingItems", e) as DbError | ClassificationError,
    );
  });
};
