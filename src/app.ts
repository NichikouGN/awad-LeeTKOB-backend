import { Elysia } from "elysia";
import { openapi } from "@elysia/openapi";

export const app = new Elysia().use(openapi());

export type App = typeof app;
