import { mkdir, readFile, rename, unlink, open } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { initialState } from "./domain.js";

// One process owns the file. Mutations serialize; readers only see committed snapshots.
export async function createStore(file) {
  await mkdir(dirname(file), { recursive: true });
  const lockFile = file + ".lock";
  let lock;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      lock = await open(lockFile, "wx", 0o600);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let pid;
      try {
        pid = Number((await readFile(lockFile, "utf8")).trim());
      } catch {
        /* Treat unknown owner as locked. */
      }
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error(
          `Не удалось определить владельца ${lockFile}. Убедитесь, что сервис остановлен, и удалите lock-файл.`,
        );
      try {
        process.kill(pid, 0);
      } catch (e) {
        if (e.code === "ESRCH" && attempt === 0) {
          await unlink(lockFile);
          continue;
        }
      }
      throw new Error(
        "Файл данных занят другим процессом. Остановите его или задайте другой DATA_FILE.",
      );
    }
  }
  if (!lock) throw new Error("Не удалось заблокировать файл данных.");
  await lock.writeFile(String(process.pid));
  let state;
  let queue = Promise.resolve();
  let closed = false;
  async function persist(next) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(tmp, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(next, null, 2) + "\n");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, file);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  try {
    try {
      state = JSON.parse(await readFile(file, "utf8"));
      if (
        state.schemaVersion !== 1 ||
        !["forms", "sessions", "responses"].every((k) =>
          Array.isArray(state[k]),
        )
      )
        throw new Error("Неизвестный формат данных.");
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new Error(
          `Не удалось прочитать данные: ${e.message}. Файл сохранён без изменений.`,
        );
      state = initialState();
      await persist(state);
    }
  } catch (e) {
    await lock.close();
    await unlink(lockFile).catch(() => {});
    throw e;
  }
  return {
    read: () => structuredClone(state),
    update(fn) {
      if (closed) return Promise.reject(new Error("Хранилище закрыто."));
      const result = queue.then(async () => {
        const next = structuredClone(state);
        const value = await fn(next);
        await persist(next);
        state = next;
        return structuredClone(value);
      });
      queue = result.catch(() => {});
      return result;
    },
    async close() {
      closed = true;
      await queue;
      await lock.close();
      await unlink(lockFile).catch(() => {});
    },
  };
}
