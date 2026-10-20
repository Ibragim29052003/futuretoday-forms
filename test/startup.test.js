import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { once } from "node:events";

const cwd = new URL("..", import.meta.url);
async function freePort() {
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  return port;
}
async function start(port, file) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd,
    env: { ...process.env, PORT: String(port), DATA_FILE: file },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Startup timeout: " + output));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("FutureToday Forms:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Early exit " + code + ": " + output));
    });
  });
  return child;
}
async function stop(child) {
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await done;
}
test("startup: custom PORT works and data survives actual process restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ft-start-"));
  const port = await freePort();
  let child;
  try {
    child = await start(port, join(dir, "store.json"));
    assert.equal((await fetch(`http://localhost:${port}/admin`)).status, 200);
    const first = await (
      await fetch(`http://localhost:${port}/api/admin/forms`)
    ).json();
    await stop(child);
    child = null;
    child = await start(port, join(dir, "store.json"));
    const second = await (
      await fetch(`http://localhost:${port}/api/admin/forms`)
    ).json();
    assert.equal(second[0].id, first[0].id);
  } finally {
    if (child) await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
test("startup: invalid PORT exits with a clear error", () => {
  const result = spawnSync(process.execPath, ["src/server.js"], {
    cwd,
    env: { ...process.env, PORT: "invalid" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("PORT должен"));
});
