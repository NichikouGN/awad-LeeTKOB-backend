import { app } from "./app";

const configuredPort = Bun.env.PORT;
const port = configuredPort ? Number(configuredPort) : 3000;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

app.listen(port);
console.log(`Server is listening on port ${app.server?.port}`);
