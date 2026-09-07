import type { MetadataRoute } from "next";

import { appOrigin } from "@/lib/auth/jwt";

/** Crawlers may index the landing and auth pages; the tenant app, API and logout are private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/signup"],
      disallow: [
        "/api/",
        "/logout",
        "/dashboard",
        "/orders",
        "/customers",
        "/products",
        "/materials",
        "/machines",
        "/work-centers",
        "/calendars",
        "/settings",
      ],
    },
    sitemap: `${appOrigin()}/sitemap.xml`,
  };
}
