import { cors } from "@elysia/cors";

export const createCorsPlugin = () =>
  cors({
    origin: (
      process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    credentials: false,
  });
