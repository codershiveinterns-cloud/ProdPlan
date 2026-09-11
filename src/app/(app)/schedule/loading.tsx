import { PageSkeleton } from "@/components/layout/PageSkeleton";

/** Instant loading state for `/schedule` while the board window is fetched. */
export default function Loading() {
  return <PageSkeleton />;
}
