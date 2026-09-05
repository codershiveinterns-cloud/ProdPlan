// Loads .env so unit and integration tests see DATABASE_URL / TEST_DATABASE_URL / AUTH_SECRET.
import "dotenv/config";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-test-secret";
}
