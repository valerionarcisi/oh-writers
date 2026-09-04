# EU AI Act Article 50 Transparency Obligations — Applicability to Cesare

Research date: 2026-09-04
Scope: Regulation (EU) 2024/1689 ("EU AI Act"), Article 50 (transparency obligations) and Article 113 (application dates), sourced strictly from EUR-Lex and official EU Commission / AI Office pages.

---

## Sourced Findings

### 1. Article 50(1) — disclosure that a natural person is interacting with an AI system

Primary source: Regulation (EU) 2024/1689, Article 50(1), Official Journal text, EUR-Lex CELEX 32024R1689 — [https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) (Chapter IV, Article 50, paragraph 1), cross-checked against the official AI Office Service Desk article page — [https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50).

Verbatim operative text (Art. 50(1)):

> "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use. This obligation shall not apply to AI systems authorised by law to detect, prevent, investigate or prosecute criminal offences, subject to appropriate safeguards for the rights and freedoms of third parties, unless those systems are available for the public to report a criminal offence."

Two clauses to isolate:

- **Exemption (a) — "obvious from context"**: the duty does not require an explicit disclosure where it is obvious, from the standpoint of "a natural person who is reasonably well-informed, observant and circumspect," taking circumstances and context of use into account, that the system is an AI system. This is a single-clause built-in exemption inside paragraph 1 itself (not a separate lettered sub-point in the operative text — the regulation states it as one continuous sentence).
- **Exemption (b) — law-enforcement carve-out**: the obligation does not apply to AI systems authorised by law for detection/prevention/investigation/prosecution of criminal offences, subject to "appropriate safeguards for the rights and freedoms of third parties," unless the system is publicly available for reporting a criminal offence (in which case the carve-out itself does not apply, i.e. disclosure duty is restored).

Note on obligated party: Art. 50(1) binds the **provider** (the entity that develops/places the AI system on the market), requiring the system be _designed_ so the natural person is informed — not the deployer directly, though a deployer using a compliant system inherits the disclosure it carries.

### 2. Article 50(4) — deployer disclosure duty for AI-generated content, incl. text for public-interest publication

Same primary source, Article 50, paragraph 4 (two subparagraphs) — [https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) (Chapter IV, Article 50(4)).

Verbatim operative text, first subparagraph (deepfakes — image/audio/video):

> "Deployers of an AI system that generates or manipulates image, audio or video content constituting a deep fake, shall disclose that the content has been artificially generated or manipulated. This obligation shall not apply where the use is authorised by law to detect, prevent, investigate or prosecute criminal offence. Where the content forms part of an evidently artistic, creative, satirical, fictional or analogous work or programme, the transparency obligations set out in this paragraph are limited to disclosure of the existence of such generated or manipulated content in an appropriate manner that does not hamper the display or enjoyment of the work."

Verbatim operative text, second subparagraph (text published on matters of public interest — the clause directly relevant to Oh Writers/Cesare):

> "Deployers of an AI system that generates or manipulates text which is published with the purpose of informing the public on matters of public interest shall disclose that the text has been artificially generated or manipulated. This obligation shall not apply where the use is authorised by law to detect, prevent, investigate or prosecute criminal offences or where the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility for the publication of the content."

Two clauses to isolate for the text-specific duty:

- **Threshold condition** (all three must hold, cumulatively, per the plain wording): the AI system (i) generates or manipulates text, (ii) that text **is published** ("which is published"), (iii) **with the purpose of informing the public on matters of public interest**. All three conditions must be met before the disclosure duty even attaches — this is a jointly-limiting scope clause, not a general text-labelling duty.
- **Exemption**: the duty does not apply where the AI-generated content "has undergone a process of human review or editorial control **and** where a natural or legal person holds editorial responsibility for the publication of the content" — both prongs (human review/editorial control, and identified editorial responsibility) are required conjunctively ("and").

For completeness, paragraph 5 of Article 50 sets a common timing/manner rule across paragraphs 1–4:

> "The information referred to in paragraphs 1 to 4 shall be provided to the natural persons concerned in a clear and distinguishable manner at the latest at the time of the first interaction or exposure. The information shall conform to the applicable accessibility requirements."

Source: same EUR-Lex CELEX 32024R1689 page, Article 50(5).

### 3. Article 113 — applicability date for Article 50

Primary source: Regulation (EU) 2024/1689, Article 113 "Entry into force and application" — [https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689), cross-checked against the official AI Office Service Desk page — [https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113), both agreeing verbatim.

Full verbatim text:

> "This Regulation shall enter into force on the twentieth day following that of its publication in the Official Journal of the European Union.
> It shall apply from 2 August 2026.
> However:
> (a) Chapters I and II shall apply from 2 February 2025;
> (b) Chapter III Section 4, Chapter V, Chapter VII and Chapter XII and Article 78 shall apply from 2 August 2025, with the exception of Article 101;
> (c) Article 6(1) and the corresponding obligations in this Regulation shall apply from 2 August 2027."

Article 50 sits in **Chapter IV** ("Transparency obligations for providers and deployers of certain AI systems") of the Regulation, per the EUR-Lex text (Chapter IV heading immediately precedes Article 50, and Chapter V — General-Purpose AI Models — begins immediately after Article 50 with Article 51). Chapter IV is **not named** in any of exceptions (a), (b) or (c) of Article 113 — only Chapters I, II, III Section 4, V, VII, XII, plus Article 78 and Article 6(1) are named as early- or late-applying. Because Article 50 (Chapter IV) is absent from every exception list, it falls under the **general rule: application from 2 August 2026**.

This reading is corroborated by the official AI Office Service Desk's own Article 50 page, which frames the obligation as effective "from 2 August 2026" — [https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50).

For reference, the distinct dates named elsewhere in the Regulation are: Art. 5 prohibited practices — 2 February 2025 (Chapter I & II, Art. 113(a)); GPAI obligations (Chapter V) — 2 August 2025 (Art. 113(b)); Annex I high-risk systems tied to Art. 6(1) — 2 August 2027 (Art. 113(c)). Article 50 (Chapter IV) is distinct from all three and lands on the general 2 August 2026 date.

### 4. Marking standard reference (C2PA) and scope of the machine-readable marking duty

**What Article 50(2) itself says** (the machine-readable marking duty, owed by **providers**, distinct from the deployer disclosure duty in 50(4)) — same EUR-Lex CELEX 32024R1689 page, Article 50(2):

> "Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated. Providers shall ensure their technical solutions are effective, interoperable, robust and reliable as far as this is technically feasible, taking into account the specificities and limitations of various types of content, the costs of implementation and the generally acknowledged state of the art, as may be reflected in relevant technical standards. This obligation shall not apply to the extent the AI systems perform an assistive function for standard editing or do not substantially alter the input data provided by the deployer or the semantics thereof, or where authorised by law to detect, prevent, investigate or prosecute criminal offences."

Note this **does** name "text" explicitly among the content types covered by the provider-side machine-readable marking duty in paragraph 2 — text is not excluded from 50(2). What is scoped to image/audio/video only is the **deepfake-specific deployer disclosure** in the first subparagraph of 50(4); the **separate text-specific deployer disclosure** duty lives in the second subparagraph of 50(4) (quoted in section 2 above) and is conditioned on the public-interest-publication threshold, not on any machine-readable marking format.

**No specific technical standard (e.g. C2PA) is named in the regulation text itself.** Article 50(2) only refers generically to "relevant technical standards" as a factor providers must take into account for effectiveness/interoperability — it names no named standard.

The regulation's own mechanism for filling that gap is Article 50(7), same EUR-Lex source:

> "The AI Office shall encourage and facilitate the drawing up of codes of practice at Union level to facilitate the effective implementation of the obligations regarding the detection and labelling of artificially generated or manipulated content. The Commission may adopt implementing acts to approve those codes of practice in accordance with the procedure laid down in Article 56(6). If it deems the code is not adequate, the Commission may adopt an implementing act specifying common rules for the implementation of those obligations in accordance with the examination procedure laid down in Article 98(2)."

I was not able to locate a live, finalized Commission or AI Office page (on `ec.europa.eu` or `digital-strategy.ec.europa.eu`) that formally adopts C2PA as the mandated standard via an implementing act under Art. 50(7) as of this research date. Secondary reporting (law-firm alerts, compliance blogs) describes a draft "Code of Practice on the Transparency of AI-Generated Content" in progress at the Commission that reportedly lists C2PA as one example of a qualifying technical solution — but I could not independently verify this against an official `ec.europa.eu` Code-of-Practice text within this research pass, so **no claim about C2PA's official status is included as a sourced finding**; treat it as unconfirmed pending direct retrieval of the Commission's Code of Practice text.

**Bottom line on scope**: Art. 50(2)'s machine-readable marking duty explicitly includes text as a content type (contrary to the possibility flagged in the task prompt that text might be excluded — it is not, in paragraph 2). What is genuinely scoped to image/audio/video only is the deepfake disclosure clause in 50(4)'s first subparagraph; text gets its own, separately-conditioned disclosure duty in 50(4)'s second subparagraph, gated on the public-interest-publication threshold described in section 2.

---

## Applied Assessment to Oh Writers / Cesare — Not Legal Advice

**This section is an engineering-informed reading of the sourced text above, produced to guide an internal product decision. It is not legal advice and is not a substitute for legal counsel before making any public compliance claim about Oh Writers or Cesare.**

### Does Art. 50(1) apply to Cesare?

**High-confidence verdict: Art. 50(1) is very unlikely to impose an actionable disclosure gap here, for two independent, reinforcing reasons — but the regulation's own wording leaves one point genuinely open, flagged below.**

1. **Threshold reading.** Art. 50(1) requires that the natural person "concerned" be informed they are interacting with an AI system. The screenwriter using Cesare is the account owner, deliberately opening a UI element labeled "Cesare," in a chat drawer, to get AI assistance — they are not a third party being _exposed to_ an AI system while believing they're dealing with a human (the paradigm case the article is aimed at: chatbots posing as support agents, voice assistants impersonating a person, etc.). The regulation text does not explicitly restrict "natural persons" to unknowing third parties, so this is not airtight as a textual matter — flagged below — but the ordinary-meaning reading of "informed that they are interacting with an AI system" presupposes there is something to be informed of, i.e., a live possibility of being unaware. A user who opened a feature named "Cesare" to talk to an AI is not in that epistemic position.
2. **Even if Art. 50(1) is read to literally reach the account owner, the "obvious from context" exemption resolves it.** The exemption's standard is "obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use." Cesare's branding (a chat drawer visibly labeled "Cesare," a distinct chat interface, and a distinct visual treatment marking AI-authored vs. the writer's own prose) is squarely the kind of contextual signal this exemption is built for. A reasonably observant screenwriter opening a labeled AI chat panel inside a screenwriting SaaS is, by construction, aware they are interacting with an AI system.

**Genuine ambiguity to flag**: the regulation text does not define "natural persons concerned" narrowly to exclude the account owner, so a maximally literal reading could argue Art. 50(1) applies to any natural person interacting with any qualifying AI system, owner included. In practice this reading is defused by the "obvious from context" exemption given Cesare's visible branding — so the two-step analysis (threshold + exemption) converges on the same non-issue outcome by two routes. There is no need for an explicit onboarding disclaimer ("You are interacting with an AI system") for legal sufficiency under this reading, though adding one costs little and would close the theoretical gap entirely if a more conservative reading were ever taken.

### Does Art. 50(4) (text published on matters of public interest) apply to Cesare-assisted screenplay drafts?

**High-confidence verdict: No — for two independent reasons, either of which is sufficient on its own.**

1. **Threshold reading fails first.** Art. 50(4)'s second subparagraph requires text "which is published with the purpose of informing the public on matters of public interest." Per the stated facts, Cesare-assisted content (loglines, synopses, treatments, screenplays) stays private to the writer's project unless the writer separately exports/shares it — the app/tool itself never publishes anything. A screenplay draft is also, on its face, not content whose purpose is "informing the public on matters of public interest" in the sense the article targets (news, current-affairs, factual public-interest reporting) — it is creative/fictional work product. Both halves of the threshold ("published" and "informing the public on matters of public interest") fail for a private draft sitting in a writer's project, so the duty never attaches in the first place. This is the primary basis for the "no" verdict — it does not even require reaching the exemption.
2. **The exemption is a secondary, reinforcing basis, and it also holds.** Even assuming arguendo the threshold were met, the exemption applies where "the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility for the publication of the content." Oh Writers' auto-versioning flow (auto-version captured before every AI change; the writer sees, and can revert or discard, before an AI-authored change is kept as the working version) is a textbook fit for "human review or editorial control" — every AI contribution is gated behind a human keep/discard decision before it becomes the working document. The writer, as the sole author/rights-holder of their private project, is also the natural person who would hold "editorial responsibility" for whatever they eventually publish. So the conjunctive exemption ("and") is satisfied on both prongs.

Because the threshold question is dispositive on its own, Oh Writers/Cesare does not need to rely on the exemption to conclude Art. 50(4) doesn't reach in-app screenplay drafting — but it's worth knowing the exemption would also cover the flow if the threshold question were ever contested (e.g., a hypothetical future feature that published AI-assisted text directly from within the app).

### If a Cesare-assisted screenplay is later produced/published as a film — does anything shift?

**Reasoning, not a sourced claim (Art. 50(4) does not address film production specifically — this is an inference from the text's "deployer" and "publication" concepts):**

Article 50(4) binds "deployers" — the entity operationally using the AI system in relation to the act of publication ("published with the purpose of informing the public..."). Once a screenplay is produced and published as a film, the entity making the publication decision — and controlling whether disclosure is warranted — is the production/distribution company, not Oh Writers as a SaaS tool. Oh Writers is not present at, and has no control over, that later publication event; it has no visibility into whether the produced film even contains "text... published... on matters of public interest" (a film's screenplay, once dramatized into audiovisual work, plausibly moves entirely into the "evidently artistic, creative, satirical, fictional or analogous work" carve-out under 50(4)'s first subparagraph in any case — that clause covers image/audio/video, which is what a released film actually is). Practically: any Art. 50(4) analysis at that later stage is the production/distribution entity's own compliance question, assessed against their own facts (their editorial control, their publication purpose, their own deployer status) — it does not retroactively create or transfer an obligation back onto Oh Writers as the drafting tool used earlier in the pipeline. Oh Writers' own compliance posture is fixed by what Oh Writers itself does (private drafting, no publication), independent of what a screenwriter's produced work later becomes.

### Summary table

| Question                                                                             | Verdict                                                                                                           | Primary basis                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does Art. 50(1) require an explicit "you are talking to an AI" disclaimer in Cesare? | No actionable gap — high confidence                                                                               | Account-owner-only interaction is outside the article's evident target; "obvious from context" exemption independently covers Cesare's visible branding                                                           |
| Does Art. 50(4) require labeling Cesare-assisted screenplay text as AI-generated?    | No — high confidence                                                                                              | Threshold fails: private draft content is not "published... informing the public on matters of public interest"; auto-versioning also independently satisfies the human-review/editorial-responsibility exemption |
| Does a later film production/release change Oh Writers' own obligations?             | No — responsibility, if any, shifts to the production/distribution entity as the deployer/publisher at that point | Art. 50(4) binds the deployer doing the publishing; Oh Writers is not that entity and has no involvement in or control over that later act                                                                        |
