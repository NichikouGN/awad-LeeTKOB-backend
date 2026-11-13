import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn("DATABASE_URL env not set");
}

export const db = drizzle({
  connection: {
    connectionString: DATABASE_URL,
  },
});

export type Database = typeof db;
