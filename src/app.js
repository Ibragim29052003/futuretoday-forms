import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  AppError,
  validateSchema,
  validateAnswers,
  makeForm,
  checkRevision,
  summarize,
  analytics,
  responsesCSV,
} from "./domain.js";

const assets = new Map([
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const getForm = (state, id) => {
  const form = state.forms.find((f) => f.id === id);
  if (!form) throw new AppError(404, "Форма не найдена.");
  return form;
};
const getPublic = (state, slug) => {
  const form = state.forms.find((f) => f.slug === slug && f.published);
  if (!form) throw new AppError(404, "Форма не найдена. Проверьте ссылку.");
  if (form.status !== "published")
    throw new AppError(410, "Приём откликов завершён.");
  return form;
};
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new AppError(415, "Используйте application/json.");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024)
      throw new AppError(413, "Слишком большой запрос (максимум 128 КБ).");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new AppError(400, "Некорректный JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(422, "Ожидается JSON-объект.");
  return value;
}
function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new AppError(403, "Запрос с другого сайта запрещён.");
  if (req.headers.origin) {
    let origin;
    try {
      origin = new URL(req.headers.origin);
    } catch {
      throw new AppError(403, "Некорректный Origin.");
    }
    if (origin.host !== req.headers.host || origin.protocol !== "http:")
      throw new AppError(403, "Запрос с другого сайта запрещён.");
  }
}
export function createApp(store) {
  const rates = new Map();
  function limit(req) {
    const now = Date.now();
    for (const [key, value] of rates) if (value.until < now) rates.delete(key);
    const key = req.socket.remoteAddress;
    const bucket = rates.get(key) || { count: 0, until: now + 60000 };
    if (++bucket.count > 180)
      throw new AppError(
        429,
        "Слишком много запросов. Попробуйте через минуту.",
      );
    rates.set(key, bucket);
  }
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader("Cache-Control", "no-store");
    const send = (status, value, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(
        type.startsWith("application/json") ? JSON.stringify(value) : value,
      );
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      let host;
      try {
        host = new URL(`http://${req.headers.host}`).hostname;
      } catch {
        throw new AppError(403, "Некорректный Host.");
      }
      if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
        throw new AppError(403, "Используйте адрес localhost.");
      const method = req.method;
      if (!["GET", "POST", "PUT"].includes(method)) {
        res.setHeader("Allow", "GET, POST, PUT");
        throw new AppError(405, "Метод не поддерживается.");
      }
      if (method !== "GET") sameOrigin(req);
      if (method === "GET" && path === "/api/health")
        return send(200, { ok: true });
      if (method === "GET" && path === "/api/admin/forms") {
        const state = store.read();
        return send(
          200,
          state.forms
            .map((f) => summarize(f, state))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }
      if (method === "POST" && path === "/api/admin/forms") {
        const input = await body(req);
        const result = await store.update((state) => {
          if (state.forms.length >= 100)
            throw new AppError(422, "Лимит MVP — 100 форм.");
          const form = makeForm(input);
          state.forms.push(form);
          return form;
        });
        return send(201, result);
      }
      const admin = path.match(
        /^\/api\/admin\/forms\/([^/]+)(?:\/(publish|status|responses|analytics|export))?$/,
      );
      if (admin) {
        const [, id, action] = admin;
        if (method === "GET") {
          const state = store.read();
          const form = getForm(state, id);
          if (!action) return send(200, summarize(form, state));
          if (action === "analytics") return send(200, analytics(form, state));
          const responses = state.responses
            .filter((r) => r.formId === id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          if (action === "responses") return send(200, responses);
          if (action === "export") {
            res.setHeader(
              "Content-Disposition",
              'attachment; filename="responses.csv"',
            );
            return send(
              200,
              responsesCSV(responses),
              "text/csv; charset=utf-8",
            );
          }
        }
        if (
          (!action && method === "PUT") ||
          (["publish", "status"].includes(action) && method === "POST")
        ) {
          const input = await body(req);
          const form = await store.update((state) => {
            const f = getForm(state, id);
            checkRevision(f, input.revision);
            if (!action) f.draft = validateSchema(input);
            else if (action === "publish") {
              const schema = validateSchema(f.draft);
              const { version, ...previous } = f.published || {};
              if (JSON.stringify(previous) !== JSON.stringify(schema))
                f.published = { ...schema, version: (version || 0) + 1 };
              f.status = "published";
              f.publishedAt = new Date().toISOString();
            } else {
              if (
                !f.published ||
                !["closed", "published"].includes(input.status)
              )
                throw new AppError(422, "Сначала опубликуйте форму.");
              f.status = input.status;
            }
            f.revision++;
            f.updatedAt = new Date().toISOString();
            return f;
          });
          return send(200, form);
        }
        throw new AppError(404, "Маршрут не найден.");
      }
      const publicRoute = path.match(
        /^\/api\/public\/forms\/([^/]+)(?:\/(sessions|events|responses))?$/,
      );
      if (publicRoute) {
        const [, slug, action] = publicRoute;
        if (method === "GET" && !action) {
          const form = getPublic(store.read(), slug);
          return send(200, { slug, ...form.published });
        }
        if (method === "POST" && action) {
          limit(req);
          const input = await body(req);
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new AppError(422, "Некорректный запрос.");
          const result = await store.update((state) => {
            const form = getPublic(state, slug);
            if (action === "sessions") {
              if (!uuid(input.clientId))
                throw new AppError(
                  422,
                  "Некорректный идентификатор посещения.",
                );
              if (input.version !== form.published.version)
                throw new AppError(
                  409,
                  "Форма обновлена. Перезагрузите страницу.",
                );
              let session = state.sessions.find(
                (s) =>
                  s.formId === form.id &&
                  s.clientId === input.clientId &&
                  s.schema.version === input.version,
              );
              if (!session) {
                if (state.sessions.length >= 50000)
                  throw new AppError(
                    503,
                    "Хранилище демо заполнено. Свяжитесь с менеджером.",
                  );
                session = {
                  id: randomUUID(),
                  clientId: input.clientId,
                  formId: form.id,
                  schema: structuredClone(form.published),
                  createdAt: new Date().toISOString(),
                  reached: [],
                  completed: [],
                  startedAt: null,
                  submittedAt: null,
                };
                state.sessions.push(session);
              }
              return {
                sessionId: session.id,
                submitted: Boolean(session.submittedAt),
              };
            }
            const session = state.sessions.find(
              (s) => s.id === input.sessionId && s.formId === form.id,
            );
            if (!session)
              throw new AppError(
                404,
                "Посещение не найдено. Перезагрузите страницу.",
              );
            if (action === "events") {
              if (
                !["start", "field_view", "field_complete"].includes(input.type)
              )
                throw new AppError(422, "Неизвестное событие.");
              if (session.submittedAt) return { ok: true };
              session.startedAt ||= new Date().toISOString();
              if (input.type !== "start") {
                const index = session.schema.fields.findIndex(
                  (f) => f.id === input.fieldId,
                );
                if (index < 0) throw new AppError(422, "Неизвестный вопрос.");
                const field = session.schema.fields[index];
                // Furthest reached question, so navigating back does not count as a new drop-off.
                for (const f of session.schema.fields.slice(0, index + 1))
                  if (!session.reached.includes(f.id))
                    session.reached.push(f.id);
                if (
                  input.type === "field_complete" &&
                  !session.completed.includes(field.id)
                )
                  session.completed.push(field.id);
              }
              return { ok: true };
            }
            if (action === "responses") {
              const existing = state.responses.find(
                (r) => r.sessionId === session.id,
              );
              if (existing) return { id: existing.id, duplicate: true };
              const answers = validateAnswers(session.schema, input.answers);
              const timestamp = new Date().toISOString();
              const response = {
                id: randomUUID(),
                formId: form.id,
                sessionId: session.id,
                schema: structuredClone(session.schema),
                answers,
                createdAt: timestamp,
              };
              state.responses.push(response);
              session.startedAt ||= timestamp;
              session.submittedAt = timestamp;
              session.reached = session.schema.fields.map((f) => f.id);
              session.completed = session.schema.fields.map((f) => f.id);
              return { id: response.id, duplicate: false };
            }
            throw new AppError(404, "Маршрут не найден.");
          });
          return send(
            action === "responses" && !result.duplicate ? 201 : 200,
            result,
          );
        }
        throw new AppError(404, "Маршрут не найден.");
      }
      if (method === "GET" && assets.has(path)) {
        const [name, type] = assets.get(path);
        return send(
          200,
          await readFile(new URL(`../public/${name}`, import.meta.url)),
          type,
        );
      }
      if (
        method === "GET" &&
        (path === "/" ||
          path === "/admin" ||
          /^\/admin\/forms\/[^/]+$/.test(path) ||
          /^\/f\/[^/]+$/.test(path))
      )
        return send(
          200,
          await readFile(new URL("../public/index.html", import.meta.url)),
          "text/html; charset=utf-8",
        );
      throw new AppError(404, "Страница не найдена.");
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) console.error("Ошибка запроса:", error.message);
      if (status === 429) res.setHeader("Retry-After", "60");
      if (!res.headersSent)
        send(status, {
          error:
            status === 500
              ? "Не удалось сохранить изменения. Попробуйте ещё раз."
              : error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        });
      else res.end();
    }
  });
}
