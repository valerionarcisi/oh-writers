import type { LocaleDict } from "./types.js";

/**
 * locations feature keys (Spec 18b PR-5+).
 *
 * Interpolated strings keep a `{value}` / `{name}` / `{label}` / `{count}`
 * placeholder the call site fills via String.replace — the `t` translator
 * returns plain strings (no param support). Some labels are injected into
 * Leaflet popup HTML; they are dictionary-controlled (not user content) so they
 * are safe to interpolate.
 */
export const locationsKeys = {
  en: {
    // Candidate status labels
    "locations.candidateStatus.confirmed": "Confirmed",
    "locations.candidateStatus.visited": "Visited",
    "locations.candidateStatus.candidate": "Candidate",
    "locations.candidateStatus.rejected": "Rejected",
    // Requirement filter labels
    "locations.filter.all": "All",
    "locations.filter.pending": "To do",
    "locations.filter.scouting": "Scouting",
    "locations.filter.confirmed": "Confirmed",
    // Panel
    "locations.panel.title": "LOCATIONS",
    "locations.panel.confirmedCount": "{value} confirmed",
    "locations.panel.empty":
      "No location found. Sync from the breakdown or add one manually.",
    "locations.panel.noCandidate": "No candidate",
    "locations.panel.alsoGoodFor": "Also good for:",
    "locations.panel.sceneSingular": "scene",
    "locations.panel.scenePlural": "scenes",
    "locations.panel.askCesareTitle": "Ask Cesare for suggestions",
    // Area filter banner
    "locations.areaFilter.matching":
      "Filtering by: {label} — {count} {candidates} in this area",
    "locations.areaFilter.candidateSingular": "candidate",
    "locations.areaFilter.candidatePlural": "candidates",
    "locations.areaFilter.none": "No candidate in: {label}",
    "locations.discovery.failed":
      "Could not search this area. Try again, or draw a smaller one.",
    "locations.discovery.skipped":
      "No place of this type found in the selected area.",
    "locations.areaFilter.askCesare": "Ask Cesare",
    "locations.areaFilter.removeAria": "Remove area filter",
    // Candidate / form fields
    "locations.field.contact": "Contact",
    "locations.field.contactPlaceholder": "Name, email, phone…",
    "locations.field.feePerDay": "€ / day",
    "locations.field.scoutingNotes": "Scouting notes",
    "locations.field.scoutingNotesPlaceholder":
      "Impressions, light, noise, accessibility…",
    "locations.field.address": "Address",
    "locations.field.locationName": "Location name",
    "locations.field.locationNamePlaceholder": "E.g. Via Tortona 18, Milan",
    "locations.field.addressOptional": "Address (optional)",
    "locations.field.addressPlaceholder": "Full address…",
    // Candidate actions
    "locations.action.reject": "Reject",
    "locations.action.markVisited": "Mark visited",
    "locations.action.confirm": "✓ Confirm",
    "locations.action.cancel": "Cancel",
    "locations.action.add": "+ Add",
    "locations.action.addCandidate": "+ Add candidate",
    "locations.action.centerMap": "Center on map",
    "locations.action.centerMapAria": "Center {name} on map",
    // Detail modal
    "locations.detail.noPhotos": "No photo available",
    "locations.detail.openPhotoAria": "Open photo preview {value}",
    // Photo lightbox
    "locations.lightbox.fallbackCaption": "Location photo",
    "locations.lightbox.closeAria": "Close preview",
    "locations.lightbox.prevAria": "Previous photo",
    "locations.lightbox.nextAria": "Next photo",
    // Combobox — Nominatim
    "locations.combobox.searchingPlaces": "Searching places…",
    "locations.combobox.noResults": "No result",
    "locations.combobox.administrativeArea": "Administrative area",
    "locations.combobox.place": "Place",
    "locations.combobox.areaChip": "area",
    // Combobox — Places
    "locations.combobox.searchingRealPlaces": "Searching real places…",
    // Place type labels
    "locations.placeType.restaurant": "restaurant",
    "locations.placeType.bar": "bar",
    "locations.placeType.cafe": "café",
    "locations.placeType.park": "park",
    "locations.placeType.bakery": "bakery",
    "locations.placeType.lodging": "lodging",
    "locations.placeType.hotel": "hotel",
    "locations.placeType.museum": "museum",
    "locations.placeType.store": "store",
    "locations.placeType.church": "church",
    "locations.placeType.hospital": "hospital",
    "locations.placeType.school": "school",
    // Area search panel
    "locations.areaSearch.searchError": "Search error",
    "locations.areaSearch.title": "Search in this area",
    "locations.areaSearch.radius": "radius",
    "locations.areaSearch.closeAria": "Close area search",
    "locations.areaSearch.queryPlaceholder":
      "E.g. pizzeria, restaurant, bar… (empty = any)",
    "locations.areaSearch.searching": "Searching…",
    "locations.areaSearch.search": "Search",
    "locations.areaSearch.addTo": "Add to:",
    "locations.areaSearch.empty": "No result in this area.",
    // Map
    "locations.map.drawnArea": "Drawn area",
    "locations.map.openPhotoTitle": "Open photo",
    "locations.map.forRequirement": "For: {name}",
    "locations.map.viewDetails": "View details",
    "locations.map.suitableFor": "→ suitable for: {value}",
    "locations.map.addAsCandidate": "+ Add as candidate",
    "locations.map.removeArea": "✕ Remove area: {label}",
    "locations.map.ranking": "Sorting…",
    "locations.map.rankByScene": "✦ Sort by scene",
    "locations.map.searchPlaceholder": "Search a place on the map…",
    // Page dock
    "locations.dock.label": "LOCATIONS",
    "locations.dock.confirmed": "Confirmed",
    "locations.dock.syncing": "Syncing…",
    "locations.dock.syncStale": "⚠ Sync",
    "locations.dock.sync": "Sync",
    "locations.dock.syncStaleAria":
      "Locations out of sync with the active version",
    "locations.dock.syncAria": "Sync from breakdown",
    "locations.dock.export": "Export",
  },
  it: {
    // Candidate status labels
    "locations.candidateStatus.confirmed": "Confermata",
    "locations.candidateStatus.visited": "Visitata",
    "locations.candidateStatus.candidate": "Candidata",
    "locations.candidateStatus.rejected": "Scartata",
    // Requirement filter labels
    "locations.filter.all": "Tutte",
    "locations.filter.pending": "Da fare",
    "locations.filter.scouting": "In sopralluogo",
    "locations.filter.confirmed": "Confermate",
    // Panel
    "locations.panel.title": "LOCATION",
    "locations.panel.confirmedCount": "{value} confermate",
    "locations.panel.empty":
      "Nessuna location trovata. Sincronizza dal breakdown o aggiungi manualmente.",
    "locations.panel.noCandidate": "Nessun candidato",
    "locations.panel.alsoGoodFor": "Va bene anche per:",
    "locations.panel.sceneSingular": "scena",
    "locations.panel.scenePlural": "scene",
    "locations.panel.askCesareTitle": "Chiedi suggerimenti a Cesare",
    // Area filter banner
    "locations.areaFilter.matching":
      "Filtrando per: {label} — {count} {candidates} in quest'area",
    "locations.areaFilter.candidateSingular": "candidato",
    "locations.areaFilter.candidatePlural": "candidati",
    "locations.areaFilter.none": "Nessun candidato in: {label}",
    "locations.discovery.failed":
      "Non è stato possibile cercare in quest'area. Riprova, oppure disegnane una più piccola.",
    "locations.discovery.skipped":
      "Nessun luogo di questo tipo trovato nell'area selezionata.",
    "locations.areaFilter.askCesare": "Chiedi a Cesare",
    "locations.areaFilter.removeAria": "Rimuovi filtro area",
    // Candidate / form fields
    "locations.field.contact": "Contatto",
    "locations.field.contactPlaceholder": "Nome, email, telefono…",
    "locations.field.feePerDay": "€ / giorno",
    "locations.field.scoutingNotes": "Note sopralluogo",
    "locations.field.scoutingNotesPlaceholder":
      "Impressioni, luce, rumore, accessibilità…",
    "locations.field.address": "Indirizzo",
    "locations.field.locationName": "Nome location",
    "locations.field.locationNamePlaceholder": "Es. Via Tortona 18, Milano",
    "locations.field.addressOptional": "Indirizzo (opzionale)",
    "locations.field.addressPlaceholder": "Indirizzo completo…",
    // Candidate actions
    "locations.action.reject": "Scarta",
    "locations.action.markVisited": "Segna visitata",
    "locations.action.confirm": "✓ Conferma",
    "locations.action.cancel": "Annulla",
    "locations.action.add": "+ Aggiungi",
    "locations.action.addCandidate": "+ Aggiungi candidato",
    "locations.action.centerMap": "Centra sulla mappa",
    "locations.action.centerMapAria": "Centra {name} sulla mappa",
    // Detail modal
    "locations.detail.noPhotos": "Nessuna foto disponibile",
    "locations.detail.openPhotoAria": "Apri anteprima foto {value}",
    // Photo lightbox
    "locations.lightbox.fallbackCaption": "Foto location",
    "locations.lightbox.closeAria": "Chiudi anteprima",
    "locations.lightbox.prevAria": "Foto precedente",
    "locations.lightbox.nextAria": "Foto successiva",
    // Combobox — Nominatim
    "locations.combobox.searchingPlaces": "Cerco luoghi…",
    "locations.combobox.noResults": "Nessun risultato",
    "locations.combobox.administrativeArea": "Area amministrativa",
    "locations.combobox.place": "Luogo",
    "locations.combobox.areaChip": "area",
    // Combobox — Places
    "locations.combobox.searchingRealPlaces": "Cerco location reali…",
    // Place type labels
    "locations.placeType.restaurant": "ristorante",
    "locations.placeType.bar": "bar",
    "locations.placeType.cafe": "caffè",
    "locations.placeType.park": "parco",
    "locations.placeType.bakery": "forno",
    "locations.placeType.lodging": "alloggio",
    "locations.placeType.hotel": "hotel",
    "locations.placeType.museum": "museo",
    "locations.placeType.store": "negozio",
    "locations.placeType.church": "chiesa",
    "locations.placeType.hospital": "ospedale",
    "locations.placeType.school": "scuola",
    // Area search panel
    "locations.areaSearch.searchError": "Errore di ricerca",
    "locations.areaSearch.title": "Cerca in questa area",
    "locations.areaSearch.radius": "raggio",
    "locations.areaSearch.closeAria": "Chiudi ricerca area",
    "locations.areaSearch.queryPlaceholder":
      "Es. pizzeria, ristorante, bar… (vuoto = qualsiasi)",
    "locations.areaSearch.searching": "Cerco…",
    "locations.areaSearch.search": "Cerca",
    "locations.areaSearch.addTo": "Aggiungi a:",
    "locations.areaSearch.empty": "Nessun risultato in questa area.",
    // Map
    "locations.map.drawnArea": "Area disegnata",
    "locations.map.openPhotoTitle": "Apri foto",
    "locations.map.forRequirement": "Per: {name}",
    "locations.map.viewDetails": "Vedi dettagli",
    "locations.map.suitableFor": "→ adatto a: {value}",
    "locations.map.addAsCandidate": "+ Aggiungi come candidato",
    "locations.map.removeArea": "✕ Rimuovi area: {label}",
    "locations.map.ranking": "Ordino…",
    "locations.map.rankByScene": "✦ Ordina per scena",
    "locations.map.searchPlaceholder": "Cerca un luogo sulla mappa…",
    // Page dock
    "locations.dock.label": "LOCATION",
    "locations.dock.confirmed": "Confermate",
    "locations.dock.syncing": "Sincronizzazione…",
    "locations.dock.syncStale": "⚠ Sincronizza",
    "locations.dock.sync": "Sincronizza",
    "locations.dock.syncStaleAria":
      "Location non sincronizzate con la versione attiva",
    "locations.dock.syncAria": "Sincronizza da breakdown",
    "locations.dock.export": "Esporta",
  },
} as const satisfies LocaleDict;
