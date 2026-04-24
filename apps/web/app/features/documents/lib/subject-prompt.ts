import type { SubjectSection } from "@oh-writers/domain";

export interface SubjectPromptProject {
  readonly title: string;
  readonly genre: string | null;
  readonly format: string;
  readonly logline: string | null;
}

export interface BuildSubjectSectionPromptInput {
  readonly section: SubjectSection;
  readonly project: SubjectPromptProject;
  readonly currentSoggetto: string | null;
}

export interface SubjectPromptFewShot {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface SubjectPromptPayload {
  readonly system: string;
  readonly fewShot: ReadonlyArray<SubjectPromptFewShot>;
  readonly user: string;
}

const SECTION_LABELS: Readonly<Record<SubjectSection, string>> = {
  premise: "Premessa",
  protagonist: "Protagonista & antagonista",
  arc: "Arco narrativo",
  world: "Mondo",
  ending: "Finale",
};

export const sectionLabel = (section: SubjectSection): string =>
  SECTION_LABELS[section];

const SUBJECT_SECTION_SYSTEM_PROMPT = `
Sei Cesare, un editor narrativo esperto nella tradizione cinematografica italiana. Aiuti un autore a scrivere il soggetto di un'opera in italiano, una sezione alla volta.

Compito: scrivi UNA SOLA sezione del soggetto indicata dall'utente.

Regole:
1. Scrivi in italiano, tono narrativo e letterario, presente indicativo.
2. Estensione: tra 200 e 400 parole.
3. Prosa pulita: nessun elenco puntato, nessun meta-commento, nessun preambolo tipo "Ecco la sezione:".
4. Non duplicare il titolo della sezione — inizia direttamente con il testo narrativo.
5. Nessun markdown, nessuna intestazione, nessuna virgolettatura attorno all'intera sezione.
6. Rispetta quanto l'autore ha già scritto nelle altre sezioni: non contraddire nomi, ambientazioni, eventi.
7. Concentrati solo sulla sezione richiesta — non anticipare contenuti di sezioni successive.
`.trim();

const SUBJECT_SECTION_FEW_SHOT: ReadonlyArray<SubjectPromptFewShot> = [
  {
    role: "user",
    content: [
      "Genere: drama",
      "Formato: feature",
      "Titolo di lavoro: L'ultima estate a Marzano",
      "Logline: non ancora definita",
      "",
      "Sezioni già scritte del soggetto (contesto, non riscriverle):",
      "(ancora nessuna)",
      "",
      "Scrivi ora la sezione: Premessa",
    ].join("\n"),
  },
  {
    role: "assistant",
    content:
      "Marzano è un paese dell'entroterra calabrese che nessuna cartina pretende di ricordare. Le case si sgretolano sotto il sole, le piazze si svuotano ogni anno di un pezzo di voce, e i vecchi aspettano i figli come si aspetta una stagione che non torna. In questo paesaggio che ha smesso di credere in sé stesso arriva l'estate in cui Marta, trent'anni e un lutto recente, decide di tornare per vendere la casa di sua madre. Pensa che basteranno tre settimane, un notaio compiacente e il silenzio imparato in città. Non sa ancora che Marzano non lascia andare nessuno senza chiedere il conto di ciò che è stato abbandonato.",
  },
  {
    role: "user",
    content: [
      "Genere: thriller",
      "Formato: feature",
      "Titolo di lavoro: Sotto copertura",
      "Logline: Un poliziotto infiltrato perde il confine tra sé e il ruolo.",
      "",
      "Sezioni già scritte del soggetto (contesto, non riscriverle):",
      "Premessa: Milano, oggi. Una squadra antimafia decide di infiltrare un giovane agente nel clan dei Rapisarda per documentare la rete di riciclaggio che tiene in ostaggio mezzo quartiere.",
      "",
      "Scrivi ora la sezione: Arco narrativo",
    ].join("\n"),
  },
  {
    role: "assistant",
    content:
      "All'inizio Andrea recita la parte con l'entusiasmo del debuttante: impara il gergo, si fa accettare, manda in centrale rapporti precisi e puntuali. Poi il ruolo comincia a rispondergli. I Rapisarda gli offrono una fiducia che la Questura non gli ha mai dato, un fratello di strada, una ragazza che non fa domande. Andrea smette di firmare i rapporti con nomi di copertura e inizia a firmarli con quello vero, ma non sa più quale sia. Quando la squadra gli chiede di consegnare il boss, lui chiede una settimana, poi un mese, poi tace. Il punto di non ritorno arriva in una notte di pioggia, davanti al cadavere di un informatore che lui stesso ha scoperto, e che ha scelto di non proteggere. Da lì in avanti ogni scena è una sottrazione: il distintivo, gli amici veri, l'idea di tornare. L'arco si chiude quando Andrea deve decidere non chi tradire, ma chi essere — e scopre che la risposta gli è già stata tolta.",
  },
];

const formatSectionUser = (input: BuildSubjectSectionPromptInput): string => {
  const { section, project, currentSoggetto } = input;
  const lines = [
    `Genere: ${project.genre ?? "non specificato"}`,
    `Formato: ${project.format}`,
    `Titolo di lavoro: ${project.title}`,
    `Logline: ${project.logline ?? "non ancora definita"}`,
    "",
    "Sezioni già scritte del soggetto (contesto, non riscriverle):",
    currentSoggetto && currentSoggetto.trim().length > 0
      ? currentSoggetto.trim()
      : "(ancora nessuna)",
    "",
    `Scrivi ora la sezione: ${sectionLabel(section)}`,
  ];
  return lines.join("\n");
};

export const buildSubjectSectionPrompt = (
  input: BuildSubjectSectionPromptInput,
): SubjectPromptPayload => ({
  system: SUBJECT_SECTION_SYSTEM_PROMPT,
  fewShot: SUBJECT_SECTION_FEW_SHOT,
  user: formatSectionUser(input),
});

const LOGLINE_SYSTEM_PROMPT = `
Sei Cesare, un editor narrativo esperto nella tradizione cinematografica italiana. Aiuti un autore a estrarre una logline dal soggetto già scritto.

Compito: produci UNA SOLA logline in italiano.

Regole:
1. Massimo 500 caratteri, idealmente molto meno — una frase sola.
2. Presente indicativo.
3. La logline deve contenere: protagonista, conflitto, posta in gioco.
4. Nessuna intestazione, nessun preambolo, nessun "Logline:" iniziale.
5. Nessun elenco puntato, nessun markdown, nessuna virgoletta attorno alla frase.
6. Non inventare elementi non presenti nel soggetto fornito.
`.trim();

const LOGLINE_FEW_SHOT: ReadonlyArray<SubjectPromptFewShot> = [
  {
    role: "user",
    content: [
      "Genere: drama",
      "Formato: feature",
      "Titolo di lavoro: L'ultima estate a Marzano",
      "",
      "Soggetto:",
      "Marzano è un paese dell'entroterra calabrese che sta morendo. Marta, trent'anni, torna per vendere la casa della madre scomparsa, ma si ritrova a fare i conti con il fratello rimasto, con un amore lasciato in sospeso e con la domanda che ha rimandato da sempre: a chi appartiene davvero. Alla fine rinuncia alla vendita e decide di restare un altro inverno.",
    ].join("\n"),
  },
  {
    role: "assistant",
    content:
      "Tornata nel paese calabrese che ha abbandonato per vendere la casa di sua madre, Marta deve scegliere tra la vita costruita in città e le radici che l'hanno aspettata, mentre il fratello rimasto mette a rischio l'unica eredità che le resta.",
  },
];

export const buildLoglineFromSubjectPrompt = (input: {
  readonly project: SubjectPromptProject;
  readonly soggetto: string;
}): SubjectPromptPayload => {
  const { project, soggetto } = input;
  const user = [
    `Genere: ${project.genre ?? "non specificato"}`,
    `Formato: ${project.format}`,
    `Titolo di lavoro: ${project.title}`,
    "",
    "Soggetto:",
    soggetto.trim(),
  ].join("\n");
  return {
    system: LOGLINE_SYSTEM_PROMPT,
    fewShot: LOGLINE_FEW_SHOT,
    user,
  };
};
