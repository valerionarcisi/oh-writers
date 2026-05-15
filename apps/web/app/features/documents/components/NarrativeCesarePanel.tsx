import type { FC } from "react";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import styles from "./NarrativeCesarePanel.module.css";

// TODO(narrative-cesare-wiring): replace these static memos with real polish
// suggestions produced by a server function similar to `screenplay-polish.server`.
// For now we surface 3–5 mock memos per doc-type so the panel layout, copy and
// interaction model can be validated end-to-end before wiring the AI call.

interface NarrativeMemo {
  readonly id: string;
  readonly group: string;
  readonly category: string;
  readonly message: string;
}

const MEMOS: Record<NarrativeDocType, readonly NarrativeMemo[]> = {
  [DocumentTypes.SOGGETTO]: [
    {
      id: "sog-clarity-1",
      group: "Chiarezza",
      category: "Premessa",
      message:
        "La premessa è solida ma il salto dal ritrovamento al pentimento è brusco. Aggiungi un beat sul gesto fisico del solvente.",
    },
    {
      id: "sog-tone-1",
      group: "Tono",
      category: "Coerenza",
      message:
        "Il registro nel secondo paragrafo vira al lirico; il resto è più asciutto. Decidi se vuoi tenerlo voluto.",
    },
    {
      id: "sog-clarity-2",
      group: "Chiarezza",
      category: "Antagonista",
      message:
        "L'antagonista è nominato ma non agisce mai sulla pagina. Considera una scena di confronto diretto.",
    },
  ],
  [DocumentTypes.SYNOPSIS]: [
    {
      id: "syn-target-1",
      group: "Target formato",
      category: "Lunghezza",
      message:
        "Sei a 1.4 cartelle, in target 1–2. Non aggiungere altro: gli organismi di finanziamento si fermano alle prime due.",
    },
    {
      id: "syn-structure-1",
      group: "Struttura",
      category: "Finale",
      message:
        "Il finale è descritto in due frasi: per una sinossi industry serve un beat in più che renda esplicita la decisione del protagonista.",
    },
    {
      id: "syn-clarity-1",
      group: "Chiarezza",
      category: "Antefatto",
      message:
        "Il primo paragrafo presenta tre informazioni in due frasi. Spezza per dare respiro.",
    },
  ],
  [DocumentTypes.OUTLINE]: [
    {
      id: "out-beat-1",
      group: "Struttura",
      category: "Beat · catalyst",
      message:
        "Il catalyst arriva al beat #4 (≈8%). Per un giallo, idealmente 10–15%. Considera un'anticipazione in scena 3.",
    },
    {
      id: "out-seq-1",
      group: "Struttura",
      category: "Sequenza · 2",
      message:
        '"La scoperta" è densa di esposizione. Potresti spalmarla su due sequenze più brevi.',
    },
    {
      id: "out-pace-1",
      group: "Ritmo",
      category: "Pacing",
      message:
        "Tre scene di seguito in interni di sera. Considera un esterno diurno per dare respiro.",
    },
    {
      id: "out-coverage-1",
      group: "Copertura beat",
      category: "Atto II",
      message:
        "Manca un midpoint riconoscibile: l'atto secondo si chiude senza un punto di non ritorno chiaro.",
    },
  ],
  [DocumentTypes.TREATMENT]: [
    {
      id: "trt-density-1",
      group: "Lettura",
      category: "Densità",
      message:
        'Capitolo "Sotto la vernice" denso (avg frase 24 parole). Spezza per dare respiro al lettore.',
    },
    {
      id: "trt-tone-1",
      group: "Stile",
      category: "Tono · coerenza",
      message:
        "Il tono di Atto I è freddo e distaccato; Atto II vira al malinconico. Va bene se è voluto.",
    },
    {
      id: "trt-clarity-1",
      group: "Chiarezza",
      category: "Voce narrante",
      message:
        "Alterni passato remoto e presente storico nello stesso capitolo. Scegli la voce dominante.",
    },
  ],
} as const;

type NarrativeDocType =
  | typeof DocumentTypes.SOGGETTO
  | typeof DocumentTypes.SYNOPSIS
  | typeof DocumentTypes.OUTLINE
  | typeof DocumentTypes.TREATMENT;

const isNarrativeDocType = (type: DocumentType): type is NarrativeDocType =>
  type === DocumentTypes.SOGGETTO ||
  type === DocumentTypes.SYNOPSIS ||
  type === DocumentTypes.OUTLINE ||
  type === DocumentTypes.TREATMENT;

interface NarrativeCesarePanelProps {
  readonly docType: DocumentType;
}

export const NarrativeCesarePanel: FC<NarrativeCesarePanelProps> = ({
  docType,
}) => {
  if (!isNarrativeDocType(docType)) return null;
  const memos = MEMOS[docType];
  const grouped = groupByGroup(memos);

  return (
    <aside className={styles.panel} aria-label="Note di Cesare">
      <header className={styles.header}>
        <span className={styles.label}>Cesare</span>
        <span className={styles.status}>{memos.length} note</span>
      </header>
      <div className={styles.body}>
        {grouped.map(({ group, items }) => (
          <section key={group} className={styles.group}>
            <p className={styles.groupLabel}>{group}</p>
            <ul className={styles.list}>
              {items.map((memo) => (
                <li key={memo.id} className={styles.item}>
                  <p className={styles.itemCat}>{memo.category}</p>
                  <p className={styles.itemText}>{memo.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className={styles.footer}>
        <span>Bozza mock</span>
        <span>aggiornato ora</span>
      </footer>
    </aside>
  );
};

const groupByGroup = (
  memos: readonly NarrativeMemo[],
): ReadonlyArray<{ group: string; items: readonly NarrativeMemo[] }> => {
  const order: string[] = [];
  const buckets = new Map<string, NarrativeMemo[]>();
  for (const memo of memos) {
    const bucket = buckets.get(memo.group);
    if (bucket) {
      bucket.push(memo);
    } else {
      buckets.set(memo.group, [memo]);
      order.push(memo.group);
    }
  }
  return order.map((group) => ({ group, items: buckets.get(group) ?? [] }));
};
