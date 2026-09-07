// Vitest setup (runs before every test file). Loads .env so tests see DATABASE_URL / TEST_DATABASE_URL / AUTH_SECRET.
import "dotenv/config";

// All tests (unit and integration) hit the test database, never the dev one. This runs BEFORE any test file
// imports src/lib/db.ts (which reads DATABASE_URL lazily, on first use).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-test-secret";
}

process.env.APP_URL ??= "http://localhost:3000";
