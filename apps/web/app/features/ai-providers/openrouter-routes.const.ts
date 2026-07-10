// Spec 84 §2.3 — target route for the wizard's post-connect redirect. No
// dedicated `/settings/ai` route exists yet (Wave 3 builds the wizard page);
// `/settings` is the only confirmed existing user-settings route today
// (apps/web/app/routes/_app.settings.tsx). Update this constant, not the
// call sites, when the wizard page ships.
export const SETTINGS_ROUTE_PATH = "/settings";
