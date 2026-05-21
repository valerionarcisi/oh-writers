# Oh Writers — Landing

Static investor/pre-demo landing page. Pure HTML + CSS + vanilla JS, no build step.

## Run locally

```bash
pnpm --filter @oh-writers/landing dev
```

Then open http://localhost:4173.

## Deploy on Netlify

1. Connect this folder as the site root (`apps/landing/`).
2. `netlify.toml` already sets `publish = "."` and a no-op build.
3. Add password protection via Netlify dashboard → **Site → Settings → Visitor access** for investor-only access.

## Design system

Tokens live in `assets/css/tokens.css` — synced manually from `packages/ui/src/styles/tokens.css`. Re-sync when DS-v2 tokens change.

## Structure

```
apps/landing/
├── index.html
├── netlify.toml
├── package.json
├── README.md
└── assets/
    ├── css/
    │   ├── main.css      # Layout, components, sections
    │   └── tokens.css    # Synced from packages/ui
    ├── js/
    │   └── tour.js       # Interactive tour controller
    └── img/              # Screenshots, logos (none yet)
```
