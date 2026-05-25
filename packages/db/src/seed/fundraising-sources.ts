import { db } from "../client";
import {
  fundraisingSources,
  type FundraisingSourceKind,
} from "../schema/index";

type CuratedSource = {
  name: string;
  feedUrl: string;
  kind: FundraisingSourceKind;
};

const CURATED_SOURCES: CuratedSource[] = [
  {
    name: "Collettivo Incendio",
    feedUrl: "https://collettivoincendio.substack.com/feed",
    kind: "substack",
  },
  {
    name: "MiC – Direzione Generale Cinema",
    feedUrl: "https://cinema.cultura.gov.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Lazio Cinema International",
    feedUrl: "https://www.lazioinnova.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Film Commission Torino Piemonte",
    feedUrl: "https://www.fctp.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Lombardia Film Commission",
    feedUrl: "https://www.lombardiafilmcommission.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Apulia Film Commission",
    feedUrl: "https://www.apuliafilmcommission.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Biennale College Cinema",
    feedUrl: "https://www.labiennale.org/it/rss.xml",
    kind: "generic_rss",
  },
  {
    name: "Sentieri Selvaggi",
    feedUrl: "https://www.sentieriselvaggi.it/feed/",
    kind: "wordpress",
  },
  {
    name: "FilmTV",
    feedUrl: "https://www.filmtv.it/feed/",
    kind: "wordpress",
  },
  {
    name: "Premio Solinas",
    feedUrl: "https://www.premiosolinas.it/feed/",
    kind: "wordpress",
  },
];

export async function seedFundraisingSources(): Promise<void> {
  await db
    .insert(fundraisingSources)
    .values(
      CURATED_SOURCES.map((s) => ({
        name: s.name,
        feedUrl: s.feedUrl,
        kind: s.kind,
        isCurated: true,
        isActive: true,
        language: "it",
      })),
    )
    .onConflictDoNothing({
      target: [fundraisingSources.feedUrl, fundraisingSources.teamId],
    });

  process.stdout.write(
    `  -> Fundraising sources seeded (${CURATED_SOURCES.length} curated)\n`,
  );
}
