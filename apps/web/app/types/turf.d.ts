// Turf v6's package.json `exports` map has no `types` condition, so under
// moduleResolution "bundler" TypeScript can't locate the bundled declarations.
// Re-point each module at its real .d.ts here. This affects ONLY the type
// checker — runtime resolution stays on the package `exports` (the ESM entry),
// so Vite is not hijacked into loading a .d.ts as a runtime module (the bug
// that the old tsconfig `paths` entries caused).

declare module "@turf/boolean-point-in-polygon" {
  export { default } from "@turf/boolean-point-in-polygon/dist/js/index";
}

declare module "@turf/circle" {
  export { default } from "@turf/circle/dist/js/index";
}

declare module "@turf/helpers" {
  export * from "@turf/helpers/dist/js/index";
}
