// Validates required environment variables (PROJECT_SPEC.md A11). Values are never printed.
import { z } from "zod";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: fall back to the ambient environment (e.g. CI, Vercel).
}

const nonEmpty = z.string().min(1, "is missing or empty");

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: nonEmpty.pipe(z.url("must be a valid URL")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.startsWith("sb_publishable_", "must start with sb_publishable_"),
  SUPABASE_SECRET_KEY: nonEmpty.startsWith("sb_secret_", "must start with sb_secret_"),
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
  TOKEN_ENCRYPTION_KEY: nonEmpty.refine(
    (v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, "base64").length === 32,
    "must be base64 that decodes to exactly 32 bytes (openssl rand -base64 32)",
  ),
  NEXT_PUBLIC_SITE_URL: nonEmpty.pipe(z.url("must be a valid URL")),
});

const result = schema.safeParse(process.env);

if (result.success) {
  console.log("check:env OK: all required variables are valid.");
} else {
  console.error("check:env FAILED:");
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
