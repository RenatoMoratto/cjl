import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "./schema";

// The neon-http driver talks to Neon over HTTP, so there is no connection pool
// to exhaust across serverless invocations on Vercel.
// `casing` must match drizzle.config.ts, or runtime queries would reference
// camelCase columns while the migrations created snake_case ones.
export const db = drizzle(neon(env.databaseUrl), {
  schema,
  casing: "snake_case",
});
