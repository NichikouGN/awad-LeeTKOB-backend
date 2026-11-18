import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db/db";

async function resetDatabase() {
  try {
    console.log("Dropping public schema...");

    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);

    console.log("Recreating public schema...");

    await db.execute(sql`CREATE SCHEMA public`);

    console.log("Running migrations...");

    await migrate(db, {
      migrationsFolder: "./drizzle",
    });

    console.log("Database reset completed!");
  } catch (error) {
    console.error("Database reset failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await resetDatabase();
