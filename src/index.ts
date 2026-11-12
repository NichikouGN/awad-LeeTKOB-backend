import { app } from "./app";

const port = Bun.env.PORT ? Number(Bun.env.PORT) : 3000;

app.listen(port);
console.log(`Server is listening on port ${app.server?.port}`);
