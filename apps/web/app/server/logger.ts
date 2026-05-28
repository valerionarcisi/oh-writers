import pino from "pino";

// Structured logger with 4 severity levels. Level output follows log
// aggregators convention (severity field instead of level label).
//
// In development: DEBUG and above are emitted so tool-loop steps are visible.
// In production: only INFO and above, keeping noise low and costs predictable.
export const logger = pino({
  level: process.env["NODE_ENV"] === "development" ? "debug" : "info",
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
});
