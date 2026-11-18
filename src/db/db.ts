import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn("DATABASE_URL env not set");
}
const pool = new Pool({
  connectionString: DATABASE_URL,
});

export const db = drizzle({ client: pool });

export type Database = typeof db;
export { pool };
