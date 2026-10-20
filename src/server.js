import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createStore } from "./store.js";
import { createApp } from "./app.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT должен быть целым числом от 1 до 65535.");
const store = await createStore(
  resolve(root, process.env.DATA_FILE || "data/store.json"),
);
const server = createApp(store);
server.on("error", async (error) => {
  console.error(`Ошибка запуска: ${error.message}`);
  await store.close();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`FutureToday Forms: http://localhost:${port}/admin`),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close(async () => {
      await store.close();
    });
    server.closeIdleConnections();
  });
