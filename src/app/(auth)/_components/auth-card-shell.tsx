import type { ReactNode } from "react";
import { Wordmark } from "@/app/(auth)/_components/wordmark";

/** Centered single-card frame (wordmark above) — used by /signup. */
export function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Wordmark />
        {children}
      </div>
    </div>
  );
}
