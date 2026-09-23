import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A single pooled connection, reused across hot-reloads in dev and across
// invocations in serverless (module scope is cached per warm lambda).
declare global {
  // eslint-disable-next-line no-var
  var __sticksPool: Pool | undefined;
}

const pool =
  global.__sticksPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
  });

if (process.env.NODE_ENV !== "production") {
  global.__sticksPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
export * from "./schema";
