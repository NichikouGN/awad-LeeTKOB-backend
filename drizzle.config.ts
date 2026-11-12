import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw Error("Database URL env not set");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
