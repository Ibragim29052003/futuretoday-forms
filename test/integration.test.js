import test from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createStore } from "../src/store.js";
import { createApp } from "../src/app.js";

const schema = {
  title: "Стажировка",
  description: "Описание",
  fields: [
    { id: "name", label: "Имя", type: "text", required: true },
    { id: "email", label: "Email", type: "email", required: true },
    { id: "optional", label: "Вопрос", type: "textarea", required: false },
  ],
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "ft-forms-"));
  const file = join(dir, "store.json");
  const store = await createStore(file);
  const server = createApp(store);
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeIdleConnections();
    await new Promise((r) => server.close(r));
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (
    path,
    value,
    method = value === undefined ? "GET" : "POST",
    headers = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
    return {
      status: r.status,
      headers: r.headers,
      data: (r.headers.get("content-type") || "").includes("application/json")
        ? await r.json()
        : await r.text(),
    };
  };
  async function create() {
    return (await request("/api/admin/forms", schema)).data;
  }
  async function publish(f) {
    return (
      await request(`/api/admin/forms/${f.id}/publish`, {
        revision: f.revision,
      })
    ).data;
  }
  async function visit(f, clientId = randomUUID()) {
    return (
      await request(`/api/public/forms/${f.slug}/sessions`, {
        clientId,
        version: f.published.version,
      })
    ).data;
  }
  return { store, request, create, publish, visit, file, dir, base };
}
test("MVP: create → save → publish → visit → submit → inspect/export", async (t) => {
  const { request, create, publish, visit } = await fixture(t);
  assert.equal((await request("/admin")).status, 200);
  assert.equal((await request("/api/health")).data.ok, true);
  let f = await create();
  assert.equal((await request(`/api/public/forms/${f.slug}`)).status, 404);
  f = (
    await request(
      `/api/admin/forms/${f.id}`,
      { ...schema, title: "Обновлено", revision: f.revision },
      "PUT",
    )
  ).data;
  f = await publish(f);
  assert.equal(f.published.version, 1);
  assert.equal(
    (await request(`/api/public/forms/${f.slug}`)).data.title,
    "Обновлено",
  );
  const s = await visit(f);
  const path = `/api/public/forms/${f.slug}`;
  await request(path + "/events", { sessionId: s.sessionId, type: "start" });
  await request(path + "/events", {
    sessionId: s.sessionId,
    type: "field_view",
    fieldId: "email",
  });
  const invalid = await request(path + "/responses", {
    sessionId: s.sessionId,
    answers: { name: "Иван", email: "bad" },
  });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.data.fields.email);
  const payload = {
    sessionId: s.sessionId,
    answers: { name: "Иван", email: "ivan@example.com" },
  };
  assert.equal((await request(path + "/responses", payload)).status, 201);
  const repeated = await request(path + "/responses", payload);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.duplicate, true);
  const responses = (await request(`/api/admin/forms/${f.id}/responses`)).data;
  assert.equal(responses.length, 1);
  assert.equal(responses[0].answers.name, "Иван");
  const stats = (await request(`/api/admin/forms/${f.id}/analytics`)).data[0];
  assert.equal(stats.views, 1);
  assert.equal(stats.starts, 1);
  assert.equal(stats.submissions, 1);
  assert.equal(stats.fields[0].stopped, 0);
  const csv = await request(`/api/admin/forms/${f.id}/export`);
  assert.equal(csv.status, 200);
  assert.ok(csv.data.includes("ivan@example.com"));
});
test("versioning: active tabs submit old schema; past replies keep original question labels", async (t) => {
  const { request, create, publish, visit } = await fixture(t);
  let f = await publish(await create());
  const old = await visit(f);
  f = (
    await request(
      `/api/admin/forms/${f.id}`,
      {
        ...schema,
        fields: [
          { id: "new", label: "Новый вопрос", type: "text", required: true },
        ],
        revision: f.revision,
      },
      "PUT",
    )
  ).data;
  assert.equal(
    (await request(`/api/public/forms/${f.slug}`)).data.fields[0].id,
    "name",
  );
  f = await publish(f);
  assert.equal(f.published.version, 2);
  assert.equal(
    (
      await request(`/api/public/forms/${f.slug}/responses`, {
        sessionId: old.sessionId,
        answers: { name: "Old", email: "old@example.com" },
      })
    ).status,
    201,
  );
  const fresh = await visit(f);
  assert.equal(
    (
      await request(`/api/public/forms/${f.slug}/responses`, {
        sessionId: fresh.sessionId,
        answers: { new: "New" },
      })
    ).status,
    201,
  );
  const replies = (await request(`/api/admin/forms/${f.id}/responses`)).data;
  assert.equal(
    replies.find((r) => r.schema.version === 1).schema.fields[0].label,
    "Имя",
  );
  const versions = (await request(`/api/admin/forms/${f.id}/analytics`)).data;
  assert.deepEqual(
    versions.map((v) => v.version),
    [2, 1],
  );
  const again = await publish(f);
  assert.equal(again.published.version, 2);
});
test("draft conflict, closed form and reopen behavior", async (t) => {
  const { request, create, publish, visit } = await fixture(t);
  let f = await publish(await create());
  const session = await visit(f);
  assert.equal(
    (
      await request(
        `/api/admin/forms/${f.id}`,
        { ...schema, revision: 1 },
        "PUT",
      )
    ).status,
    409,
  );
  f = (
    await request(`/api/admin/forms/${f.id}/status`, {
      revision: f.revision,
      status: "closed",
    })
  ).data;
  assert.equal((await request(`/api/public/forms/${f.slug}`)).status, 410);
  assert.equal(
    (
      await request(`/api/public/forms/${f.slug}/responses`, {
        sessionId: session.sessionId,
        answers: { name: "x", email: "x@y.ru" },
      })
    ).status,
    410,
  );
  f = (
    await request(`/api/admin/forms/${f.id}/status`, {
      revision: f.revision,
      status: "published",
    })
  ).data;
  assert.equal((await request(`/api/public/forms/${f.slug}`)).status, 200);
});
test("session deduplication; concurrent submissions save exactly once", async (t) => {
  const { request, create, publish, visit } = await fixture(t);
  const f = await publish(await create());
  const clientId = randomUUID();
  const sessions = await Promise.all(
    Array.from({ length: 12 }, () => visit(f, clientId)),
  );
  assert.equal(new Set(sessions.map((s) => s.sessionId)).size, 1);
  const submissions = await Promise.all(
    Array.from({ length: 20 }, () =>
      request(`/api/public/forms/${f.slug}/responses`, {
        sessionId: sessions[0].sessionId,
        answers: { name: "x", email: "a@b.ru" },
      }),
    ),
  );
  assert.equal(submissions.filter((r) => r.status === 201).length, 1);
  assert.equal(
    (await request(`/api/admin/forms/${f.id}/responses`)).data.length,
    1,
  );
});
test("request safety: invalid JSON, payload type, origin, method, body size, missing session, static paths", async (t) => {
  const { request, create, publish, base } = await fixture(t);
  const f = await publish(await create());
  const malformed = await fetch(base + "/api/admin/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);
  await malformed.text();
  const blockedHost = await new Promise((resolve, reject) => {
    const req = httpRequest(base + "/api/admin/forms", {
      headers: { Host: "evil.example" },
    }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(blockedHost, 403);
  for (const value of [null, [], 42, "string"])
    assert.equal(
      (await request(`/api/admin/forms/${f.id}/publish`, value)).status,
      422,
    );
  assert.equal(
    (
      await request("/api/admin/forms", schema, "POST", {
        Origin: "http://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/admin/forms", schema, "POST", {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/admin/forms", schema, "POST", {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await request("/api/admin/forms", {
        ...schema,
        description: "x".repeat(140000),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await request(`/api/public/forms/${f.slug}/responses`, {
        sessionId: randomUUID(),
        answers: {},
      })
    ).status,
    404,
  );
  assert.equal((await request("/src/server.js")).status, 404);
  assert.equal((await request("/data/store.json")).status, 404);
  assert.equal(
    (await request("/api/admin/forms", undefined, "DELETE")).status,
    405,
  );
  const page = await request("/admin");
  assert.ok(
    page.headers.get("content-security-policy").includes("script-src 'self'"),
  );
  assert.equal(page.headers.get("x-frame-options"), "DENY");
});
test("analytics: no answers or raw IPs stored before submission", async (t) => {
  const { store, request, create, publish, visit } = await fixture(t);
  const f = await publish(await create());
  const s = await visit(f);
  await request(`/api/public/forms/${f.slug}/events`, {
    sessionId: s.sessionId,
    type: "field_complete",
    fieldId: "name",
    answer: "THIS_MUST_NOT_BE_STORED",
  });
  const data = JSON.stringify(store.read());
  assert.ok(!data.includes("THIS_MUST_NOT_BE_STORED"));
  assert.ok(!data.includes("127.0.0.1"));
});
test("public write rate limit returns retry hint", async (t) => {
  const { request, create, publish } = await fixture(t);
  const f = await publish(await create());
  let last;
  for (let i = 0; i < 181; i++)
    last = await request(`/api/public/forms/${f.slug}/sessions`, {
      clientId: "invalid",
      version: 1,
    });
  assert.equal(last.status, 429);
  assert.equal(last.headers.get("retry-after"), "60");
});
test("store: atomic serial writes, rollback, lock ownership and persistence after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ft-store-"));
  const file = join(dir, "db.json");
  let store;
  try {
    store = await createStore(file);
    await assert.rejects(createStore(file), /занят/);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.update((s) => {
          s.responses.push({ i });
          return i;
        }),
      ),
    );
    await assert.rejects(
      store.update((s) => {
        s.responses = [];
        throw new Error("rollback");
      }),
    );
    assert.equal(store.read().responses.length, 25);
    await store.close();
    store = await createStore(file);
    assert.equal(store.read().responses.length, 25);
    await store.close();
    store = null;
    await writeFile(file, "{broken");
    await assert.rejects(createStore(file), /без изменений/);
    assert.equal(await readFile(file, "utf8"), "{broken");
  } finally {
    if (store) await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
