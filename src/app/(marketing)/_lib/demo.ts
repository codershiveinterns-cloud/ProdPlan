/**
 * Single import point for the one-click demo Server Action used by the landing page (docs/M1_SPEC.md §6.9):
 * "View demo" (header) and "Explore the live demo" (hero) post `demoLoginAction("ADMIN")` through <DemoForm>.
 */
export { demoLoginAction } from "@/app/(auth)/actions";
