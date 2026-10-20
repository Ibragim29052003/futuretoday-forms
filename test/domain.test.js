import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSchema,
  validateAnswers,
  responsesCSV,
  makeForm,
  analytics,
  AppError,
} from "../src/domain.js";
const field = (extra = {}) => ({
  id: "name",
  label: "Имя",
  type: "text",
  required: true,
  ...extra,
});
const schema = (fields) => ({ title: " Тест ", description: "", fields });

test("schema: trims text, validates limits, types, IDs and select options", () => {
  assert.equal(validateSchema(schema([field()])).title, "Тест");
  for (const value of [
    null,
    [],
    {},
    schema([]),
    schema(Array(21).fill(field())),
    schema([field(), field()]),
    schema([field({ type: "file" })]),
    schema([field({ id: "<script>" })]),
    schema([field({ required: "yes" })]),
    schema([field({ label: "" })]),
    schema([field({ type: "select", options: ["a", "a"] })]),
    schema([field({ type: "select", options: ["one"] })]),
  ])
    assert.throws(() => validateSchema(value), AppError);
});
test("answers: checks all field types and rejects missing, extra, wrong and long values", () => {
  const s = validateSchema(
    schema([
      field(),
      field({ id: "email", type: "email" }),
      field({ id: "choice", type: "select", options: ["A", "B"] }),
      field({ id: "yes", type: "checkbox" }),
      field({ id: "note", type: "textarea", required: false }),
    ]),
  );
  const good = {
    name: " Иван ",
    email: "a@example.com",
    choice: "A",
    yes: true,
  };
  assert.equal(validateAnswers(s, good).name, "Иван");
  assert.equal(validateAnswers(s, good).note, "");
  for (const value of [
    null,
    [],
    {},
    { ...good, email: "bad" },
    { ...good, choice: "C" },
    { ...good, yes: false },
    { ...good, yes: "true" },
    { ...good, unexpected: "x" },
    { ...good, name: 55 },
    { ...good, note: "x".repeat(4001) },
  ])
    assert.throws(() => validateAnswers(s, value), AppError);
});
test("answers: optional values and unusual valid IDs cannot bypass required validation", () => {
  const s = validateSchema(
    schema([field({ id: "__proto__" }), field({ id: "constructor" })]),
  );
  assert.throws(
    () => validateAnswers(s, {}),
    (e) => Boolean(e.fields.__proto__ && e.fields.constructor),
  );
  const optional = validateSchema(
    schema([
      field({ required: false }),
      field({ id: "check", type: "checkbox", required: false }),
    ]),
  );
  assert.equal(validateAnswers(optional, {}).check, false);
});
test("CSV: quotes delimiters, Unicode, multiline and neutralizes spreadsheet formulas", () => {
  const s = validateSchema(schema([field({ label: 'Имя; "текст"' })]));
  const csv = responsesCSV([
    {
      id: "123",
      createdAt: "2026-10-20T00:00:00Z",
      schema: { ...s, version: 1 },
      answers: { name: '  =HYPERLINK("bad")\nтекст' },
    },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Имя; ""текст"""'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")\nтекст"'));
});
test("analytics: versions separate; active visits are explicitly counted as stops", () => {
  const form = makeForm(schema([field()]));
  form.published = { ...form.draft, version: 2 };
  const result = analytics(form, {
    sessions: [
      {
        formId: form.id,
        schema: { ...form.draft, version: 1 },
        reached: ["name"],
        completed: [],
        startedAt: "now",
        submittedAt: null,
      },
    ],
  });
  assert.deepEqual(
    result.map((v) => v.version),
    [2, 1],
  );
  assert.equal(result[1].fields[0].stopped, 1);
  assert.equal(result[0].views, 0);
});
