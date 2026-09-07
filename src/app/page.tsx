import { redirect } from "next/navigation";

/**
 * `/` always lands on the dashboard. Unauthenticated visitors are bounced to `/login` by `src/proxy.ts`
 * before this page renders, so no session check is needed here.
 */
export default function Home() {
  redirect("/dashboard");
}
