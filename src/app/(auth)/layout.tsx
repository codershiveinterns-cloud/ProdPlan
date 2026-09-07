import type { ReactNode } from "react";
import { Wordmark } from "@/app/(auth)/_components/wordmark";

/** Centered single-card layout for /login and /signup. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Wordmark />
        {children}
      </div>
    </main>
  );
}
