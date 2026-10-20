import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const fail = (message, fields) => {
  throw new AppError(422, message, fields);
};
const text = (v, max, name, required = true) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(`Проверьте поле «${name}» (до ${max} символов).`);
  return v.trim();
};
export const TYPES = ["text", "email", "textarea", "select", "checkbox"];
export function validateSchema(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Некорректная форма.");
  const title = text(input.title, 120, "Название");
  const description = text(input.description ?? "", 1000, "Описание", false);
  if (
    !Array.isArray(input.fields) ||
    input.fields.length < 1 ||
    input.fields.length > 20
  )
    fail("Добавьте от 1 до 20 вопросов.");
  const ids = new Set();
  const fields = input.fields.map((f) => {
    if (!f || typeof f !== "object") fail("Некорректный вопрос.");
    if (
      typeof f.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(f.id) ||
      ids.has(f.id)
    )
      fail("Идентификаторы вопросов должны быть уникальны.");
    ids.add(f.id);
    if (!TYPES.includes(f.type) || typeof f.required !== "boolean")
      fail("Проверьте тип и обязательность вопроса.");
    const result = {
      id: f.id,
      type: f.type,
      label: text(f.label, 180, "Вопрос"),
      required: f.required,
    };
    if (f.type === "select") {
      if (
        !Array.isArray(f.options) ||
        f.options.length < 2 ||
        f.options.length > 20
      )
        fail("Для списка нужно от 2 до 20 вариантов.");
      result.options = f.options.map((o) => text(o, 120, "Вариант"));
      if (new Set(result.options).size !== result.options.length)
        fail("Варианты ответа не должны повторяться.");
    }
    return result;
  });
  return { title, description, fields };
}
export function validateAnswers(schema, answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    fail("Ответы должны быть объектом.");
  const allowed = new Set(schema.fields.map((f) => f.id));
  if (Object.keys(answers).some((k) => !allowed.has(k)))
    fail("В ответах есть неизвестный вопрос.");
  const errors = Object.create(null);
  const clean = Object.create(null);
  for (const f of schema.fields) {
    const v = answers[f.id];
    if (f.type === "checkbox") {
      if (v !== undefined && typeof v !== "boolean")
        errors[f.id] = "Ожидается отметка да/нет.";
      else if (f.required && v !== true)
        errors[f.id] = "Поставьте отметку, чтобы продолжить.";
      clean[f.id] = v === true;
      continue;
    }
    if (v !== undefined && typeof v !== "string") {
      errors[f.id] = "Введите текст.";
      continue;
    }
    const value = (v ?? "").trim();
    const max = f.type === "textarea" ? 4000 : 300;
    if (f.required && !value) errors[f.id] = "Ответьте на обязательный вопрос.";
    else if (value.length > max) errors[f.id] = `Не больше ${max} символов.`;
    else if (
      value &&
      f.type === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      errors[f.id] = "Введите email в формате name@example.com.";
    else if (value && f.type === "select" && !f.options.includes(value))
      errors[f.id] = "Выберите вариант из списка.";
    clean[f.id] = value;
  }
  if (Object.keys(errors).length) fail("Проверьте ответы на вопросы.", errors);
  return clean;
}
export function checkRevision(form, revision) {
  if (!Number.isInteger(revision) || revision !== form.revision)
    throw new AppError(
      409,
      "Форма уже изменена. Обновите страницу, чтобы загрузить последнюю версию.",
    );
}
export function makeForm(schema) {
  return {
    id: randomUUID(),
    slug: randomUUID(),
    draft: validateSchema(schema),
    revision: 1,
    status: "draft",
    published: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
export function initialState() {
  const form = makeForm({
    title: "Стажировка, с которой всё начинается",
    description:
      "Команда FutureToday ищет любопытных и увлечённых. Расскажи немного о себе — мы свяжемся и обсудим следующий шаг.",
    fields: [
      { id: "name", type: "text", label: "Как тебя зовут?", required: true },
      { id: "email", type: "email", label: "Твой email", required: true },
      {
        id: "university",
        type: "text",
        label: "В каком вузе ты учишься?",
        required: false,
      },
      {
        id: "track",
        type: "select",
        label: "Какое направление тебе интересно?",
        required: true,
        options: [
          "Разработка",
          "Маркетинг",
          "Работа с клиентами",
          "Пока выбираю",
        ],
      },
      {
        id: "motivation",
        type: "textarea",
        label: "Почему хочешь попробовать себя в этой роли?",
        required: false,
      },
    ],
  });
  form.status = "published";
  form.published = { ...structuredClone(form.draft), version: 1 };
  form.publishedAt = form.updatedAt;
  return { schemaVersion: 1, forms: [form], sessions: [], responses: [] };
}
export function summarize(form, state) {
  const sessions = state.sessions.filter((s) => s.formId === form.id);
  const responses = state.responses.filter((r) => r.formId === form.id);
  return {
    ...form,
    stats: {
      views: sessions.length,
      starts: sessions.filter((s) => s.startedAt).length,
      responses: responses.length,
      conversion: sessions.length
        ? Math.round((responses.length / sessions.length) * 100)
        : 0,
    },
  };
}
export function analytics(form, state) {
  const versions = new Map();
  for (const s of state.sessions.filter((s) => s.formId === form.id)) {
    if (!versions.has(s.schema.version))
      versions.set(s.schema.version, { schema: s.schema, sessions: [] });
    versions.get(s.schema.version).sessions.push(s);
  }
  if (form.published && !versions.has(form.published.version))
    versions.set(form.published.version, {
      schema: form.published,
      sessions: [],
    });
  return [...versions.values()]
    .sort((a, b) => b.schema.version - a.schema.version)
    .map(({ schema, sessions }) => ({
      version: schema.version,
      views: sessions.length,
      starts: sessions.filter((s) => s.startedAt).length,
      submissions: sessions.filter((s) => s.submittedAt).length,
      fields: schema.fields.map((f) => ({
        id: f.id,
        label: f.label,
        reached: sessions.filter((s) => s.reached.includes(f.id)).length,
        completed: sessions.filter((s) => s.completed.includes(f.id)).length,
        stopped: sessions.filter(
          (s) => !s.submittedAt && s.reached.at(-1) === f.id,
        ).length,
      })),
    }));
}
export function responsesCSV(responses) {
  const columns = new Map();
  for (const r of responses)
    for (const f of r.schema.fields)
      columns.set(JSON.stringify([f.id, f.label]), f);
  const escape = (value) => {
    let str = String(value ?? "");
    if (/^[\s\uFEFF]*[=+@\-]/u.test(str) || /^[\t\r\n]/.test(str))
      str = `'${str}`;
    return `"${str.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "ID отклика",
      "Дата (UTC)",
      "Версия",
      ...[...columns.values()].map((f) => f.label),
    ],
  ];
  for (const r of responses)
    rows.push([
      r.id,
      r.createdAt,
      r.schema.version,
      ...[...columns.entries()].map(([key, f]) => {
        if (
          !r.schema.fields.some(
            (sf) => JSON.stringify([sf.id, sf.label]) === key,
          )
        )
          return "";
        return f.type === "checkbox"
          ? r.answers[f.id]
            ? "Да"
            : "Нет"
          : r.answers[f.id];
      }),
    ]);
  return (
    "\uFEFF" +
    rows.map((row) => row.map(escape).join(";")).join("\r\n") +
    "\r\n"
  );
}
