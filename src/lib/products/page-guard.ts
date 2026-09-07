/**
 * Page-side permission guard. The implementation lives in src/lib/auth/guards.ts (shared by every module);
 * this file only keeps the module-local import path stable.
 */
export { requirePagePermission } from "@/lib/auth/guards";
