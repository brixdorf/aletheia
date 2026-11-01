import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const webRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));

serve({ fetch: createApp({ webRoot }).fetch, port }, ({ port: bound }) => {
  console.log(`Aletheia listening on port ${bound}`);
});
