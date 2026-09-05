import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Local/dev/tests: DATABASE_URL from .env. Netlify runtime: NETLIFY_DB_URL is injected by Netlify Database.
    url: process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL,
  },
});
