import type {
  CesareSuggestion,
  Genre,
  SubjectSection,
} from "@oh-writers/domain";

/**
 * Mock fixture for the full-script Sonnet stream (Spec 10g).
 * Returns one breakdown entry per (1-based) scene number we receive.
 * Used in tests and when MOCK_AI=true.
 *
 * Heuristic: CAPS words in the **body only** become "cast" items with
 * confidence 0.9, up to 3 per scene. The scene heading is intentionally
 * excluded — otherwise slugline tokens like INT/EXT/NOTTE/GIORNO and the
 * location name would all become fake cast members, which is exactly what
 * real Sonnet would never do. A short stoplist also catches Fountain
 * slugline tokens that leak into the body (e.g. "INT/EXT" continuations)
 * and common IT/EN time-of-day markers shouted in action lines.
 *
 * If the body mentions "bottle" / "bottiglia" we also add a high-confidence
 * Bottiglia prop. Deterministic by design.
 */
export interface MockSceneBreakdown {
  sceneNumber: number;
  items: {
    name: string;
    category: string;
    quantity: number;
    confidence: number;
  }[];
}

const CAST_STOPWORDS = new Set<string>([
  "INT",
  "EXT",
  "EST",
  "INT/EXT",
  "I/E",
  "DAY",
  "NIGHT",
  "MORNING",
  "EVENING",
  "GIORNO",
  "NOTTE",
  "MATTINA",
  "SERA",
  "POMERIGGIO",
  "ALBA",
  "TRAMONTO",
]);

export const mockFullScriptBreakdown = (
  scenes: { sceneNumber: number; heading: string; body: string }[],
): MockSceneBreakdown[] =>
  scenes.map((scene) => {
    const caps = [
      ...new Set(
        [...scene.body.matchAll(/\b[A-Z]{3,}\b/g)]
          .map((m) => m[0])
          .filter((token) => !CAST_STOPWORDS.has(token)),
      ),
    ].slice(0, 3);
    const items: MockSceneBreakdown["items"] = caps.map((name) => ({
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      category: "cast",
      quantity: 1,
      confidence: 0.9,
    }));
    if (/bottl|bottigli/i.test(scene.body)) {
      items.push({
        name: "Bottiglia",
        category: "props",
        quantity: 1,
        confidence: 0.85,
      });
    }
    return { sceneNumber: scene.sceneNumber, items };
  });

export const mockCesareBreakdownForScene = (
  sceneText: string,
): CesareSuggestion[] => {
  const text = sceneText.toLowerCase();
  if (text.includes("warehouse") && text.includes("rick")) {
    return [
      {
        category: "cast",
        name: "Rick",
        quantity: 1,
        description: null,
        rationale: "Personaggio con dialogo",
      },
      {
        category: "props",
        name: "Bloody knife",
        quantity: 1,
        description: null,
        rationale: "Oggetto portato",
      },
      {
        category: "vehicles",
        name: "Police car",
        quantity: 3,
        description: null,
        rationale: "Three police cars",
      },
      {
        category: "animals",
        name: "Dog",
        quantity: 1,
        description: null,
        rationale: "A dog barks",
      },
      {
        category: "extras",
        name: "Riot squad",
        quantity: 50,
        description: null,
        rationale: "50 EXTRAS in riot gear",
      },
    ];
  }
  const caps = [
    ...new Set([...sceneText.matchAll(/\b[A-Z]{3,}\b/g)].map((m) => m[0])),
  ];
  return caps.slice(0, 3).map((name) => ({
    category: "cast" as const,
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    quantity: 1,
    description: null,
    rationale: "CAPS heuristic",
  }));
};

type SubjectSectionTable = Record<
  SubjectSection,
  { default: string } & Partial<Record<Genre, string>>
>;

const SUBJECT_SECTION_TEXT: SubjectSectionTable = {
  premise: {
    default:
      "La storia prende avvio da un evento apparentemente ordinario che incrina l'equilibrio del protagonista. Ogni scelta successiva diventa irreversibile e apre un conflitto che attraversa l'intero racconto. Il mondo narrativo si rivela poco a poco, mostrando le sue regole e le sue contraddizioni.",
    thriller:
      "Una scoperta improvvisa costringe il protagonista a mettere in discussione tutto ciò che credeva vero. Il tempo stringe e ogni ritardo ha un prezzo alto. Intorno a lui si muovono forze che preferirebbero il suo silenzio alla sua verità.",
    drama:
      "Un segreto sepolto da anni torna a galla nel momento meno opportuno e cambia i rapporti tra i personaggi. La fragilità dei legami emerge in piccoli gesti quotidiani. La storia segue il tentativo, spesso imperfetto, di ricucire ciò che è stato spezzato.",
  },
  protagonist: {
    default:
      "Il protagonista è una figura complessa, segnata da un desiderio profondo che non ha ancora osato pronunciare. Le sue qualità convivono con ferite che condizionano ogni decisione. Lungo il racconto impara a riconoscere la distanza tra ciò che vuole e ciò di cui ha davvero bisogno.",
    thriller:
      "Il protagonista è un osservatore meticoloso, abituato a fidarsi più dei dettagli che delle persone. Il suo istinto lo ha salvato molte volte, ma lo ha anche isolato. Quando viene coinvolto contro la sua volontà, deve scegliere se restare invisibile o agire.",
  },
  arc: {
    default:
      "L'arco del protagonista si muove da una difesa rigida verso una forma di apertura scomoda ma necessaria. Ogni tappa lo mette di fronte a una versione di sé che non aveva ancora accettato. Il cambiamento non è trionfale: è un riconoscimento, sofferto e concreto.",
    drama:
      "Il protagonista attraversa una trasformazione silenziosa, fatta di piccoli cedimenti e di nuove attenzioni. Ciò che credeva forza si rivela armatura, e ciò che chiamava debolezza diventa verità. Alla fine non è diverso: è finalmente riconoscibile a se stesso.",
  },
  world: {
    default:
      "L'ambientazione non è uno sfondo, ma un personaggio in controluce. Luoghi, rituali e silenzi raccontano una cultura precisa, con le sue tensioni e i suoi codici. Ogni scena trae colore dal mondo che la contiene, e a ogni gesto risponde un'eco sociale.",
  },
  ending: {
    default:
      "Il finale non scioglie ogni nodo: chiude il conflitto centrale e lascia respirare ciò che resta. Il protagonista raggiunge un nuovo equilibrio, consapevole del prezzo pagato. L'ultima immagine suggerisce che la storia finisce, ma la vita dei personaggi continua oltre l'inquadratura.",
    thriller:
      "Lo scontro finale ribalta le aspettative e consegna al protagonista una vittoria ambigua. La verità emerge, ma non restituisce ciò che è andato perduto. L'ultima scena lascia una domanda aperta, perché certe minacce non si lasciano chiudere del tutto.",
  },
};

export const mockSubjectSection = (
  section: SubjectSection,
  genre: Genre | null,
): string => {
  const entry = SUBJECT_SECTION_TEXT[section];
  if (genre && entry[genre]) return entry[genre] as string;
  return entry.default;
};
