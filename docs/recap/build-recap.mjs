// Spec 59 — builds a single self-contained app-recap HTML with base64-inlined
// screenshots. Run: `node docs/recap/build-recap.mjs`. Output:
// docs/recap/2026-06-05-app-recap.html. Re-runnable after re-capturing assets.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) => {
  const b64 = readFileSync(join(here, "assets", name)).toString("base64");
  return `data:image/png;base64,${b64}`;
};

// ─── Palette (resolved from the product's light theme tokens) ────────────────
const C = {
  bg: "#f5f3ee",
  surface: "#ffffff",
  surfaceAlt: "#ebe9e3",
  line: "#d8d6cd",
  text: "#232220",
  textMute: "#6e6c66",
  textFaint: "#8c8a82",
  action: "#8b3a1a", // clay — functional accent
  actionSoft: "#f4dccb",
  agent: "#5a6b3c", // leaf — Cesare / AI
  agentSoft: "#e5e9d8",
};

// ─── Showcase tour sections (product voice) ──────────────────────────────────
const tour = [
  {
    n: "01",
    img: "01-login.png",
    kicker: "Entrata",
    title: "Accesso",
    body: "Un ingresso sobrio in due passi: prima l'email, poi la password. La sessione regge anche i client mobili (token bearer), non solo i cookie.",
  },
  {
    n: "02",
    img: "02-dashboard.png",
    kicker: "I tuoi progetti",
    title: "Dashboard",
    body: "Ogni progetto è una scheda con i suoi numeri vivi — scene, pagine, percentuale di completamento, giornate — filtrabile per formato, genere, ruolo. Da qui si entra dritti nell'editor.",
  },
  {
    n: "03",
    img: "03-overview.png",
    kicker: "Panoramica progetto",
    title: "Il cruscotto del film",
    body: "Una sola schermata tiene insieme i KPI, la pipeline di sviluppo (soggetto → sceneggiatura → produzione), i documenti, l'attività recente e un suggerimento contestuale di Cesare.",
  },
  {
    n: "04",
    img: "04-soggetto.png",
    kicker: "Scrittura narrativa",
    title: "Soggetto, sinossi, scaletta, trattamento",
    body: "L'editor narrativo (ProseMirror) con note a margine e salvataggio automatico. Lo stesso telaio serve tutti i documenti di sviluppo, in italiano, con la stessa cura tipografica.",
  },
  {
    n: "05",
    img: "05-screenplay.png",
    kicker: "Sceneggiatura",
    title: "La pagina, e basta",
    body: "La sceneggiatura è una colonna di testo centrata sulla tela — niente cornice bianca attorno. Le azioni (esporta, importa, versioni) vivono tutte in un solo menu in alto, vicino allo sguardo; i tipi di blocco (scena, azione, personaggio…) si muovono con le frecce.",
  },
  {
    n: "06",
    img: "06-breakdown.png",
    kicker: "Spoglio",
    title: "Breakdown automatico",
    body: "Cesare legge la scena ed evidenzia gli elementi — cast, location, oggetti — con un costo stimato per giornata. Da qui ogni voce va dritta al budget.",
  },
  {
    n: "07",
    img: "07-budget.png",
    kicker: "Budget",
    title: "Il preventivo, sempre coerente",
    body: "Totale stimato, distribuzione per reparto, costo per giornata e per scena. Le categorie si coprono da sole man mano che lo spoglio cresce; il budget è pronto per il lock quando i numeri tornano.",
  },
  {
    n: "08",
    img: "08-schedule.png",
    kicker: "Calendarizzazione",
    title: "Lo spannografo",
    body: "Le giornate di ripresa come strisce ordinabili: scene, pagine e ore per giorno, con esportazione e stampa del piano di ripresa.",
  },
  {
    n: "09",
    img: "09-locations.png",
    kicker: "Location",
    title: "Scouting e candidate",
    body: "Requisiti di location dalla sceneggiatura, candidate con foto e note di sopralluogo — il ponte fra ciò che è scritto e dove si gira.",
  },
  {
    n: "10",
    img: "10-cesare-sessions.png",
    kicker: "Cesare",
    title: "Le tue conversazioni",
    body: "Cesare è l'assistente di produzione che vive nel progetto. Le sessioni sono pagine vere e deep-linkabili, non chat usa-e-getta.",
  },
  {
    n: "11",
    img: "11-cesare-drawer.png",
    kicker: "Cesare",
    title: "Sempre a portata, mai invadente",
    body: "Un drawer fluttuante in basso a destra: il documento si aggiorna dal vivo dietro la chat mentre Cesare lavora, con una traccia di ciò che legge e scrive. Mai un take-over a tutto schermo.",
  },
  {
    n: "12",
    img: "12-settings-user.png",
    kicker: "Impostazioni",
    title: "Account",
    body: "Le preferenze dell'utente — profilo, lingua — separate e distinte dalle impostazioni del progetto.",
  },
  {
    n: "13",
    img: "13-settings-project.png",
    kicker: "Impostazioni",
    title: "Progetto",
    body: "Le impostazioni del singolo film: ciò che riguarda l'opera, non la persona. L'ingranaggio è il progetto, l'avatar è l'utente.",
  },
];

// ─── Narrative Walk changelog strips (technical voice) ───────────────────────
const changelog = [
  {
    id: "A1 · Spec 55",
    what: "TopBar action standard + backbone della shell",
    detail:
      "Campanella, avatar e ingranaggio nella zona account della TopBar (la casa unica); registro centrale delle azioni di pagina; esportazioni e Versioni «vicino allo sguardo», non più sparse a metà pagina.",
  },
  {
    id: "A2 · Cesare UX",
    what: "Chat Cesare ridisegnata",
    detail:
      "Parte chiusa; header e composer fissi, corpo che scorre, pillola «vai alle nuove risposte»; bolle di risposta come card distinte. La composer resta nel viewport anche accanto a un documento lungo.",
  },
  {
    id: "A3 · N-27",
    what: "Grounding reale di Cesare",
    detail:
      "Regole di grounding centralizzate nel system prompt: niente elementi inventati dati per presenti, niente «Atto I/II/III» imposti. Verificato con uno smoke su AI reale (non mock).",
  },
  {
    id: "A4 · Sessioni",
    what: "Sessioni Cesare come pagine vere",
    detail:
      "Landing con elenco, conversazione deep-linkabile su rotta centrale (non un peek laterale), creazione pigra alla prima domanda.",
  },
  {
    id: "A6 · Settings",
    what: "Shell & settings polish",
    detail:
      "Avatar ≠ ingranaggio (utente vs progetto), larghezza delle pagine impostazioni, icona del progetto.",
  },
  {
    id: "N-20 · i18n",
    what: "Niente più EN/IT misto",
    detail:
      "Formattatori di date/numeri/valuta centralizzati e locale-aware; SaveStatus e PresenceIndicator tradotti. La lingua diventa coerente su narrativa, sessioni e shell.",
  },
  {
    id: "A5 · Spec 55a",
    what: "Sceneggiatura: pagina senza cornice + menu in TopBar",
    detail:
      "N-18 la pagina perde la cornice bianca (niente card, niente ombra). N-19 il vecchio toolbar interno è ritirato: esporta/importa PDF+Fountain, Versioni, ricalcolo numerazione, frontespizio vivono in un solo menu della TopBar; i tab dei tipi di blocco usano react-aria (focus con le frecce).",
  },
  {
    id: "N-30 · Spec 60",
    what: "Un errore non svuota più l'app",
    detail:
      "Boundary d'errore a livello di router: un crash di rendering mostra un fallback con il guscio intatto (riprova + torna alla dashboard + stack consultabile), non più la pagina grezza del framework.",
  },
];

// ─── HTML ────────────────────────────────────────────────────────────────────
const tourHtml = tour
  .map(
    (s) => `
    <section class="slide">
      <div class="slide-text">
        <span class="kicker">${s.kicker}</span>
        <h2>${s.title}</h2>
        <p>${s.body}</p>
      </div>
      <figure class="slide-shot">
        <img loading="lazy" src="${asset(s.img)}" alt="${s.title}" />
      </figure>
    </section>`,
  )
  .join("\n");

const changelogHtml = changelog
  .map(
    (c) => `
    <article class="strip">
      <span class="strip-id">${c.id}</span>
      <div class="strip-body">
        <h4>${c.what}</h4>
        <p>${c.detail}</p>
      </div>
    </article>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Oh Writers — Recap</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg:${C.bg}; --surface:${C.surface}; --surface-alt:${C.surfaceAlt};
    --line:${C.line}; --text:${C.text}; --mute:${C.textMute}; --faint:${C.textFaint};
    --action:${C.action}; --action-soft:${C.actionSoft};
    --agent:${C.agent}; --agent-soft:${C.agentSoft};
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.55; -webkit-font-smoothing: antialiased;
  }
  .serif { font-family: "Fraunces", Georgia, serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px; }

  /* Cover */
  .cover { padding: 96px 28px 72px; text-align: center; }
  .logo {
    width: 52px; height: 52px; margin: 0 auto 24px; border-radius: 14px;
    background: var(--text); color: var(--bg); display: grid; place-items: center;
    font-family: "Fraunces", serif; font-size: 28px; font-weight: 600;
  }
  .cover h1 {
    font-family: "Fraunces", Georgia, serif; font-size: 54px; font-weight: 600;
    margin: 0 0 12px; letter-spacing: -0.01em;
  }
  .cover .tagline { font-size: 19px; color: var(--mute); margin: 0 auto 8px; max-width: 30em; }
  .cover .date { font-size: 13px; color: var(--faint); letter-spacing: 0.08em; text-transform: uppercase; }

  /* Section heading band */
  .band { border-top: 1px solid var(--line); margin-top: 8px; }
  .band-head { padding: 56px 0 8px; }
  .band-head .eyebrow {
    font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--action); font-weight: 600;
  }
  .band-head h2 {
    font-family: "Fraunces", Georgia, serif; font-size: 32px; font-weight: 600; margin: 6px 0 0;
  }
  .band-head p { color: var(--mute); margin: 8px 0 0; max-width: 44em; }

  /* Showcase slides */
  .slide {
    display: grid; grid-template-columns: 1fr 1.45fr; gap: 40px; align-items: center;
    padding: 48px 0; border-bottom: 1px solid var(--line);
  }
  .slide:nth-child(even) .slide-text { order: 2; }
  .slide-text .kicker {
    font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--action); font-weight: 600;
  }
  .slide-text h2 {
    font-family: "Fraunces", Georgia, serif; font-size: 27px; font-weight: 600;
    margin: 8px 0 10px; line-height: 1.2;
  }
  .slide-text p { color: var(--mute); margin: 0; font-size: 15.5px; }
  .slide-shot { margin: 0; }
  .slide-shot img {
    width: 100%; display: block; border-radius: 12px;
    border: 1px solid var(--line); box-shadow: 0 10px 34px rgba(35,34,32,0.10);
  }

  /* Changelog strips (technical) */
  .changelog { background: var(--surface-alt); }
  .changelog .band-head .eyebrow { color: var(--agent); }
  .strip {
    display: grid; grid-template-columns: 160px 1fr; gap: 24px;
    padding: 22px 0; border-bottom: 1px solid var(--line); align-items: start;
  }
  .strip-id {
    font-family: "Courier Prime", ui-monospace, monospace; font-size: 12.5px;
    color: var(--agent); font-weight: 700; padding-top: 2px;
    border-left: 3px solid var(--agent); padding-left: 12px;
  }
  .strip-body h4 { margin: 0 0 4px; font-size: 16px; }
  .strip-body p { margin: 0; color: var(--mute); font-size: 14.5px; }

  footer { padding: 48px 0 64px; color: var(--faint); font-size: 13px; text-align: center; }

  @media (max-width: 760px) {
    .slide { grid-template-columns: 1fr; gap: 18px; }
    .slide:nth-child(even) .slide-text { order: 0; }
    .strip { grid-template-columns: 1fr; gap: 8px; }
    .cover h1 { font-size: 40px; }
  }
</style>
</head>
<body>

  <header class="cover">
    <div class="logo serif">O</div>
    <h1>Oh Writers</h1>
    <p class="tagline">Dalla prima riga di soggetto al piano di ripresa — un solo posto per scrivere e produrre il film, con Cesare al fianco.</p>
    <p class="date">Recap · 5 giugno 2026</p>
  </header>

  <div class="band">
    <div class="wrap">
      <div class="band-head">
        <span class="eyebrow">Parte 1 — Il prodotto</span>
        <h2 class="serif">Un giro dell'app, schermata per schermata</h2>
        <p>Tutte le immagini sono catture dal vivo dell'applicazione reale, non mockup.</p>
      </div>
${tourHtml}
    </div>
  </div>

  <div class="band changelog">
    <div class="wrap">
      <div class="band-head">
        <span class="eyebrow">Parte 2 — Cosa è cambiato</span>
        <h2 class="serif">Narrative Walk — changelog</h2>
        <p>Le correzioni e i miglioramenti emersi dalla revisione manuale, in voce tecnica. Ogni striscia rimanda alla sua spec / bug id.</p>
      </div>
${changelogHtml}
    </div>
  </div>

  <footer>Oh Writers · recap generato il 5 giugno 2026 · catture live dall'app reale</footer>

</body>
</html>`;

const out = join(here, "2026-06-05-app-recap.html");
writeFileSync(out, html);
console.error(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
