/**
 * Tiny structured-ish logger. App code uses this instead of `console.*` (ESLint `no-console` is on for src/**).
 * Output goes to the platform log stream (Netlify function logs / terminal) with a stable prefix so it is easy to grep.
 */
const PREFIX = "[prodplan]";

function stamp(level: "info" | "warn" | "error"): string {
  return `${PREFIX} ${new Date().toISOString()} ${level.toUpperCase()}`;
}

export const logger = {
  info(message: string, ...meta: unknown[]): void {
    console.info(stamp("info"), message, ...meta);
  },
  warn(message: string, ...meta: unknown[]): void {
    console.warn(stamp("warn"), message, ...meta);
  },
  error(message: string, ...meta: unknown[]): void {
    console.error(stamp("error"), message, ...meta);
  },
};

export type Logger = typeof logger;
