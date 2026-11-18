import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "../db";

const migration = await readFile(
  new URL("./outbox-notify.sql", import.meta.url),
  "utf8",
);
try {
  await pool.query(migration);
} finally {
  await pool.end();
}
