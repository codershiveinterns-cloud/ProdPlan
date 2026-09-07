/**
 * Single import point for the one-click demo Server Action used by the landing page (docs/M1_SPEC.md §6.9).
 * Swap the re-export to `@/app/(auth)/actions` once `demoLoginAction` is exported there.
 */
export { demoLoginAction } from "./demo-fallback";
