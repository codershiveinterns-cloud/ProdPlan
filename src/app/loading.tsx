import { PageSkeleton } from "@/components/layout/PageSkeleton";

/** Root-level instant loading state: a header + table skeleton that matches the list-page layout. */
export default function Loading() {
  return <PageSkeleton />;
}
