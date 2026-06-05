// Spec 59 (reframed) — builds a single self-contained HTML that is a TESTING
// GUIDE to the fixes just shipped: one card per FIXED item with what was broken,
// what changed, and concrete steps to verify it in the running app. Plus a short
// product tour for context. Run: `node docs/recap/build-recap.mjs`.
// Output: docs/recap/2026-06-05-app-recap.html.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) => {
  const b64 = readFileSync(join(here, "assets", name)).toString("base64");
  return `data:image/png;base64,${b64}`;
};

const C = {
  bg: "#f5f3ee",
  surface: "#ffffff",
  surfaceAlt: "#ebe9e3",
  line: "#d8d6cd",
  text: "#232220",
  textMute: "#6e6c66",
  textFaint: "#8c8a82",
  action: "#8b3a1a",
  actionSoft: "#f4dccb",
  agent: "#5a6b3c",
  agentSoft: "#e5e9d8",
};

// ─── The fixes, as testable cards ────────────────────────────────────────────
// Each: area, id, title, prima (broken), ora (fixed), prova (how to verify),
// where (path to drive to), img (optional screenshot).
const fixes = [
  {
    area: "Sceneggiatura",
    id: "N-18 · Spec 55a",
    title: "Pagina senza cornice bianca",
    prima:
      "La sceneggiatura era avvolta in una card bianca con bordo e ombra — «voglio solo la pagina di testo».",
    ora: "Solo la colonna di testo centrata sulla tela, niente cornice né ombra.",
    prova: [
      "Apri un progetto → Sceneggiatura.",
      "La pagina è una colonna piatta sul fondo lino: nessun riquadro/ombra attorno.",
    ],
    where: "/projects/:id/screenplay",
    img: "05-screenplay.png",
  },
  {
    area: "Sceneggiatura",
    id: "N-19 · Spec 55a",
    title: "Azioni unite in un solo menu in alto",
    prima:
      "Esporta/Importa e Versioni erano sparse a metà pagina (dropdown + menu ⋯); i tab dei blocchi sembravano «hardcoded».",
    ora: "Un solo menu «Altre azioni» in TopBar: Esporta PDF, Importa PDF/Fountain, Versioni, Ricalcola numerazione, Frontespizio. I tab (Scena/Azione/…) si muovono con le frecce (react-aria).",
    prova: [
      "Sceneggiatura → clic su «⋯ Altre azioni» in alto a destra: tutte le azioni sono lì.",
      "Niente più barra azioni o dropdown a metà pagina.",
      "Clicca un tab dei blocchi e premi ← / → : il focus si sposta da tastiera.",
    ],
    where: "/projects/:id/screenplay",
    img: "fix-menu.png",
  },
  {
    area: "Sceneggiatura",
    id: "N-32",
    title: "Focus mode anche senza tastiera + «Esci» in italiano",
    prima:
      "Si entrava in focus mode solo con ⌃⌥F (impossibile su iPad/touch) e il bottone d'uscita era «Exit Focus» (inglese).",
    ora: "Un bottone «Focus» (👁) nella barra della sceneggiatura entra in focus mode; l'uscita ora è «Esci da Focus».",
    prova: [
      "Sceneggiatura → clic su «Focus» (in alto a destra, accanto alla versione).",
      "Si apre la modalità distraction-free; il bottone d'uscita dice «Esci da Focus», non «Exit Focus».",
    ],
    where: "/projects/:id/screenplay",
    img: "fix-focus-button.png",
  },
  {
    area: "Resilienza",
    id: "N-30 · Spec 60",
    title: "Un errore non svuota più l'app",
    prima:
      "Un crash di rendering buttava giù tutta l'app su una pagina grigia grezza («Something went wrong»), senza guscio né via d'uscita.",
    ora: "Un boundary a livello di router mostra un fallback con il guscio intatto: «Riprova», «Torna alla dashboard» e lo stack consultabile.",
    prova: [
      "Vai su /crash-test (rotta di test, solo in dev).",
      "Vedi il fallback brandizzato con la sidebar ancora viva; clic «Mostra dettagli» per lo stack.",
      "«Riprova» / naviga altrove → l'app riparte, non resta bloccata.",
    ],
    where: "/crash-test",
    img: "fix-error-boundary.png",
  },
  {
    area: "Cesare",
    id: "N-05 · A2",
    title: "Cesare parte CHIUSO",
    prima: "Cesare si auto-apriva a ogni caricamento.",
    ora: "All'apertura di una pagina narrativa Cesare è chiuso finché non lo apri tu.",
    prova: [
      "Apri Soggetto/Sinossi: il drawer Cesare è chiuso (la pillola «Cesare» in basso a destra).",
      "Si apre solo al clic.",
    ],
    where: "/projects/:id/soggetto",
    img: "11-cesare-drawer.png",
  },
  {
    area: "Cesare",
    id: "N-06/07/08 · A2",
    title: "Chat in stile Claude (input sempre visibile, bolle)",
    prima:
      "In split view l'input per parlare a Cesare spariva sotto il fold; layout chat da rivedere.",
    ora: "Header e composer fissi, corpo che scorre, pillola «vai alle nuove risposte»; risposte in card distinte. La composer resta nel viewport anche con un documento lungo.",
    prova: [
      "Apri Cesare, scrivi qualcosa: l'input resta sempre visibile in basso.",
      "Le risposte sono card con marcatore ✦; scorrendo su appare «↓ Vai alle nuove risposte».",
    ],
    where: "/projects/:id/soggetto",
    img: "fix-cesare-chat.png",
  },
  {
    area: "Cesare",
    id: "N-27 · A3",
    title: "Cesare resta ancorato al documento (grounding)",
    prima:
      "Cesare poteva inventare elementi dati per presenti o imporre «Atto I/II/III».",
    ora: "Regole di grounding nel system prompt: niente elementi inventati come fatti, niente atti non dichiarati. Verificato su AI reale.",
    prova: [
      "Apri Cesare su un Soggetto e chiedi una rilettura: le note restano ancorate a ciò che c'è scritto, le novità sono proposte, non fatti.",
    ],
    where: "/projects/:id/soggetto",
  },
  {
    area: "Cesare",
    id: "N-12/13/14 · A4",
    title: "Sessioni come pagine vere",
    prima: "Sessioni come chat usa-e-getta, landing/elenco da rifare.",
    ora: "Landing con elenco, conversazione su rotta centrale deep-linkabile, creazione pigra alla prima domanda.",
    prova: [
      "Sidebar → «Sessioni Cesare»: elenco a card.",
      "Apri una sessione: è una pagina vera (URL dedicato), non un drawer.",
    ],
    where: "/projects/:id/sessions",
    img: "10-cesare-sessions.png",
  },
  {
    area: "Shell & nav",
    id: "N-01..N-04 · A1",
    title: "Tutto «vicino allo sguardo» nella TopBar",
    prima:
      "Notifiche in basso a sinistra; Versioni assenti; esportazioni sparse; drawer legacy.",
    ora: "Campanella + avatar + ingranaggio nella zona account della TopBar; Versioni ed esportazioni dal registro azioni; i drawer sono SplitDrawer.",
    prova: [
      "Guarda in alto a destra: campanella (notifiche), avatar (impostazioni utente), ingranaggio (impostazioni progetto).",
      "Su una pagina narrativa, «⋯» espone Esporta e Versioni.",
    ],
    where: "/projects/:id/soggetto",
    img: "03-overview.png",
  },
  {
    area: "Shell & nav",
    id: "N-16/17 · Spec 57",
    title: "Logline cliccabile + label «Soggetto» corretta",
    prima:
      "Cliccando la logline non si apriva nulla (popover fuori schermo su finestre strette); in EN «Soggetto» appariva come «Treatment outline».",
    ora: "Il popover si riposiziona dentro il viewport; la label EN è «Soggetto».",
    prova: [
      "Restringi la finestra e clicca la pillola logline in alto: il popover si apre dentro lo schermo.",
      "In EN, la prima voce di nav è «Soggetto».",
    ],
    where: "/projects/:id/soggetto",
  },
  {
    area: "Shell & nav",
    id: "N-23/24 · A6",
    title: "Avatar ≠ ingranaggio (utente vs progetto)",
    prima: "Avatar e ingranaggio portavano entrambi a /settings.",
    ora: "Avatar → impostazioni utente; ingranaggio → impostazioni progetto (distinti).",
    prova: [
      "Clic sull'avatar → impostazioni account.",
      "Clic sull'ingranaggio → impostazioni del progetto.",
    ],
    where: "/settings",
    img: "12-settings-user.png",
  },
  {
    area: "i18n",
    id: "N-20",
    title: "Niente più EN/IT misto",
    prima:
      "Mix EN/IT su date, numeri, stato di salvataggio, presenza («2 online»).",
    ora: "Formattatori locale-aware centralizzati; SaveStatus e PresenceIndicator tradotti.",
    prova: [
      "Apri un editor narrativo: lo stato dice «Salvato» (non «Saved»); date e numeri seguono il locale.",
    ],
    where: "/projects/:id/soggetto",
    img: "04-soggetto.png",
  },
];

// ─── Short product tour (context) ────────────────────────────────────────────
const tour = [
  ["02-dashboard.png", "Dashboard", "I progetti con i loro numeri vivi."],
  ["07-budget.png", "Budget", "Preventivo coerente: donut, reparti, costo per scena."],
  ["06-breakdown.png", "Breakdown", "Spoglio automatico della scena con costi."],
  ["08-schedule.png", "Calendarizzazione", "Lo spannografo delle giornate di ripresa."],
];

// ─── HTML ────────────────────────────────────────────────────────────────────
const fixHtml = fixes
  .map((f) => {
    let img = "";
    if (f.img) {
      try {
        img = `<figure class="fix-shot"><img loading="lazy" src="${asset(f.img)}" alt="${f.title}" /></figure>`;
      } catch {
        img = "";
      }
    }
    const steps = f.prova.map((s) => `<li>${s}</li>`).join("");
    return `
    <article class="fix">
      <div class="fix-head">
        <span class="fix-area">${f.area}</span>
        <span class="fix-id">${f.id}</span>
      </div>
      <h3>${f.title}</h3>
      <div class="fix-grid">
        <div class="fix-text">
          <p class="ba"><span class="lbl prima">Prima</span> ${f.prima}</p>
          <p class="ba"><span class="lbl ora">Ora</span> ${f.ora}</p>
          <div class="prova">
            <span class="lbl prova-lbl">Come provarlo</span>
            <ol>${steps}</ol>
            <code class="where">${f.where}</code>
          </div>
        </div>
        ${img}
      </div>
    </article>`;
  })
  .join("\n");

const tourHtml = tour
  .map(
    ([img, title, cap]) => `
    <figure class="tour-card">
      <img loading="lazy" src="${asset(img)}" alt="${title}" />
      <figcaption><strong>${title}</strong> — ${cap}</figcaption>
    </figure>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Oh Writers — Fix da testare</title>
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
  .wrap { max-width: 1000px; margin: 0 auto; padding: 0 28px; }

  .cover { padding: 80px 28px 36px; text-align: center; }
  .logo {
    width: 50px; height: 50px; margin: 0 auto 22px; border-radius: 13px;
    background: var(--text); color: var(--bg); display: grid; place-items: center;
    font-family: "Fraunces", serif; font-size: 26px; font-weight: 600;
  }
  .cover h1 { font-family: "Fraunces", serif; font-size: 44px; font-weight: 600; margin: 0 0 10px; }
  .cover .tagline { font-size: 18px; color: var(--mute); margin: 0 auto; max-width: 34em; }
  .cover .date { font-size: 12px; color: var(--faint); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 12px; }

  .section-head { padding: 48px 0 4px; border-top: 1px solid var(--line); margin-top: 28px; }
  .section-head .eyebrow { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--action); font-weight: 600; }
  .section-head h2 { font-family: "Fraunces", serif; font-size: 30px; font-weight: 600; margin: 6px 0 0; }
  .section-head p { color: var(--mute); margin: 8px 0 0; max-width: 46em; }

  /* Fix cards */
  .fix {
    padding: 28px 0; border-bottom: 1px solid var(--line);
  }
  .fix-head { display: flex; align-items: center; gap: 12px; }
  .fix-area {
    font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;
    color: var(--action); background: var(--action-soft); padding: 3px 9px; border-radius: 999px;
  }
  .fix-id { font-family: "Courier Prime", monospace; font-size: 12px; color: var(--faint); }
  .fix h3 { font-family: "Fraunces", serif; font-size: 22px; font-weight: 600; margin: 10px 0 14px; }
  .fix-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
  .fix-grid:has(.fix-shot) .fix-text { grid-column: auto; }
  .fix:not(:has(.fix-shot)) .fix-grid { grid-template-columns: 1fr; }
  .ba { margin: 0 0 8px; font-size: 15px; color: var(--text); }
  .lbl {
    display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; padding: 2px 7px; border-radius: 5px; margin-right: 8px; vertical-align: 1px;
  }
  .lbl.prima { background: #f0e3df; color: var(--action); }
  .lbl.ora { background: var(--agent-soft); color: var(--agent); }
  .prova { margin-top: 14px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  .prova-lbl { background: var(--text); color: var(--bg); margin: 0 0 8px; }
  .prova ol { margin: 8px 0 10px; padding-left: 20px; }
  .prova li { font-size: 14.5px; color: var(--text); margin: 4px 0; }
  .where {
    display: inline-block; font-family: "Courier Prime", monospace; font-size: 12.5px;
    color: var(--agent); background: var(--agent-soft); padding: 3px 9px; border-radius: 6px;
  }
  .fix-shot { margin: 0; }
  .fix-shot img { width: 100%; display: block; border-radius: 10px; border: 1px solid var(--line); box-shadow: 0 8px 26px rgba(35,34,32,0.10); }

  /* Tour strip */
  .tour { background: var(--surface-alt); }
  .tour-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; padding: 8px 0 16px; }
  .tour-card { margin: 0; }
  .tour-card img { width: 100%; display: block; border-radius: 10px; border: 1px solid var(--line); }
  .tour-card figcaption { font-size: 13.5px; color: var(--mute); margin-top: 8px; }

  footer { padding: 40px 0 60px; color: var(--faint); font-size: 13px; text-align: center; }

  @media (max-width: 760px) {
    .fix-grid { grid-template-columns: 1fr !important; }
    .tour-grid { grid-template-columns: 1fr; }
    .cover h1 { font-size: 34px; }
  }
</style>
</head>
<body>

  <header class="cover">
    <div class="logo serif">O</div>
    <h1 class="serif">Fix da testare</h1>
    <p class="tagline">Tutto ciò che abbiamo sistemato di recente, con come provarlo nell'app. Le immagini sono catture dal vivo dell'app reale.</p>
    <p class="date">Oh Writers · 5 giugno 2026</p>
  </header>

  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Da provare</span>
      <h2 class="serif">${fixes.length} fix, raggruppati per area</h2>
      <p>Per ognuno: cos'era rotto («Prima»), cos'è cambiato («Ora») e i passi per verificarlo. La rotta indica dove andare nell'app.</p>
    </div>
${fixHtml}
  </div>

  <div class="tour">
    <div class="wrap">
      <div class="section-head" style="border-top:0">
        <span class="eyebrow">Per contesto</span>
        <h2 class="serif">Un assaggio del resto</h2>
        <p>Le altre aree del prodotto, non toccate da questi fix ma utili a inquadrare dove vivono.</p>
      </div>
      <div class="tour-grid">
${tourHtml}
      </div>
    </div>
  </div>

  <footer>Oh Writers · recap fix generato il 5 giugno 2026 · catture live dall'app reale</footer>

</body>
</html>`;

const out = join(here, "2026-06-05-app-recap.html");
writeFileSync(out, html);
console.error(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
