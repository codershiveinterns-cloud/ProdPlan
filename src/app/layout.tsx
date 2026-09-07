import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appUrl } from "@/lib/auth/jwt";

import "./globals.css";

/** Body / UI face (docs/DESIGN_BRIEF.md §4). */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Display face for page titles and landing headings; falls back to Inter through the `--font-heading` chain. */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for social images / canonicals resolve against APP_URL (http://localhost:3000 when unset).
  metadataBase: appUrl(),
  title: {
    default: "ProdPlan",
    template: "%s · ProdPlan",
  },
  description: "Production planning for manufacturing units: orders, machines, materials and shift calendars.",
  applicationName: "ProdPlan",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf9",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
