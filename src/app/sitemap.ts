import type { MetadataRoute } from "next";

import { appOrigin } from "@/lib/auth/jwt";

/** Only the public routes are listed; everything behind the session cookie is disallowed in robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  const lastModified = new Date();
  return [
    { url: `${origin}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${origin}/signup`, lastModified, changeFrequency: "yearly", priority: 0.6 },
    { url: `${origin}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
