"use strict";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 3 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 1) scale(.9)"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h5"/>',
  chart: '<path d="M4 4v16h17M8 16v-5m5 5V7m5 9v-8"/>',
  down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  chevron: '<path d="m6 10 6 6 6-6"/>',
};
const icon = (name) =>
  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
const brand = `<a class="brand" href="/admin" aria-label="FutureToday — все формы"><img src="/favicon.svg" width="34" height="34" alt=""><span>FutureToday<span class="brand-sub">формы</span></span></a>`;
const questions = (n) =>
  `${n} ${n % 100 >= 11 && n % 100 <= 14 ? "вопросов" : n % 10 === 1 ? "вопрос" : n % 10 >= 2 && n % 10 <= 4 ? "вопроса" : "вопросов"}`;
const publicBrand = `<span class="brand"><img src="/favicon.svg" width="34" height="34" alt=""><span>FutureToday<span class="brand-sub">формы</span></span></span>`;
const date = (v) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
const statusName = {
  draft: "Черновик",
  published: "Опубликована",
  closed: "Приём закрыт",
};
const badge = (status) =>
  `<span class="badge ${status}"><span></span>${statusName[status]}</span>`;
const typeNames = {
  text: "Короткий ответ",
  email: "Email",
  textarea: "Длинный ответ",
  select: "Выбор из списка",
  checkbox: "Отметка",
};
let toastTimer;
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 5500);
}
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Не удалось выполнить запрос.");
    err.fields = data.fields;
    err.status = res.status;
    throw err;
  }
  return data;
}
const post = (path, value, method = "POST") =>
  api(path, { method, body: JSON.stringify(value) });
function shell(content) {
  $("#app").innerHTML =
    `<header class="topbar"><div class="topbar-inner">${brand}<span class="workspace">Рабочее пространство <span class="demo-tag">MVP</span></span><a class="nav-active" href="/admin">${icon("file")} Мои формы</a></div></header><main id="main" class="container">${content}</main><footer class="site-footer">FutureToday Forms <span>Больше возможностей. Меньше рутины.</span></footer>`;
}
function errorPage(error, publicPage = false) {
  $("#app").innerHTML =
    `<div class="public-shell"><header>${publicBrand}</header><main id="main" class="public-card empty"><span class="empty-icon">${icon("file")}</span><h1>${error.status === 410 ? "Приём откликов завершён" : "Не удалось открыть страницу"}</h1><p>${esc(error.message)}</p>${publicPage ? '<button class="button secondary" id="retry">Попробовать снова</button>' : '<a class="button" href="/admin">К моим формам</a>'}</main></div>`;
  $("#retry")?.addEventListener("click", () => location.reload());
}
let forms = [];
async function dashboard() {
  forms = await api("/api/admin/forms");
  const totals = forms.reduce(
    (a, f) => ({
      views: a.views + f.stats.views,
      responses: a.responses + f.stats.responses,
    }),
    { views: 0, responses: 0 },
  );
  shell(`<section class="page-heading"><div><div class="eyebrow">ОТ ИНТЕРЕСА — К ПЕРВОМУ ШАГУ</div><h1>Открой путь новым талантам<span class="green-dot">.</span></h1><p>Создавай формы, собирай отклики и замечай, где нужна помощь.</p></div><button class="button" id="new-form">${icon("plus")} Создать форму</button></section>
  <section class="stat-grid" aria-label="Общая статистика"><article class="stat-card"><span class="stat-icon sage">${icon("file")}</span><div><span class="stat-label">Всего форм</span><strong>${forms.length}</strong></div><span class="stat-note">${forms.filter((f) => f.status === "published").length} принимают отклики</span></article><article class="stat-card"><span class="stat-icon lilac">${icon("eye")}</span><div><span class="stat-label">Посещения</span><strong>${totals.views}</strong></div><span class="stat-note">открытия публичных форм</span></article><article class="stat-card"><span class="stat-icon butter">${icon("check")}</span><div><span class="stat-label">Получено откликов</span><strong>${totals.responses}</strong></div><span class="stat-note">все версии форм</span></article></section>
  <section class="forms-section"><div class="section-head"><h2>Мои формы <span class="count">${forms.length}</span></h2><span class="subtle">Всё для следующего карьерного шага</span></div><div class="toolbar"><label class="search"><span class="sr-only">Поиск форм по названию</span><input id="search" type="search" placeholder="Найти форму по названию…"></label><label><span class="sr-only">Статус формы</span><select id="filter"><option value="all">Все статусы</option><option value="published">Опубликованы</option><option value="draft">Черновики</option><option value="closed">Приём закрыт</option></select></label></div><div id="form-list"></div></section>
  <aside class="tip"><span class="tip-symbol">↗</span><div><strong>Одна форма — много возможностей</strong><p>Начни с главных вопросов. Короткую форму проще заполнить, а статистика подскажет, где студенты останавливаются.</p></div></aside>
  <dialog id="create-dialog"><form id="create-form"><div class="eyebrow">НОВАЯ ВОЗМОЖНОСТЬ</div><h2>Как назовём форму?</h2><p class="subtle">Например, «Стажировка в маркетинге».</p><label class="field-label" for="new-title">Название</label><input id="new-title" name="title" required maxlength="120" autocomplete="off" placeholder="Название стажировки или события"><p id="create-error" class="field-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" type="button" id="cancel-create">Отмена</button><button class="button" type="submit">Создать ${icon("arrow")}</button></div></form></dialog>`);
  renderFormList();
  $("#search").addEventListener("input", renderFormList);
  $("#filter").addEventListener("change", renderFormList);
  $("#new-form").addEventListener("click", () => {
    $("#create-dialog").showModal();
    $("#new-title").focus();
  });
  $("#cancel-create").addEventListener("click", () =>
    $("#create-dialog").close(),
  );
  $("#create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = $("button[type=submit]", e.currentTarget);
    button.disabled = true;
    try {
      const form = await post("/api/admin/forms", {
        title: $("#new-title").value,
        description: "",
        fields: [
          {
            id: crypto.randomUUID(),
            type: "text",
            label: "Как тебя зовут?",
            required: true,
          },
          {
            id: crypto.randomUUID(),
            type: "email",
            label: "Твой email",
            required: true,
          },
        ],
      });
      location.href = `/admin/forms/${form.id}`;
    } catch (err) {
      $("#create-error").textContent = err.message;
      button.disabled = false;
    }
  });
}
function renderFormList() {
  const query = $("#search").value.toLocaleLowerCase("ru").trim();
  const status = $("#filter").value;
  const filtered = forms.filter(
    (f) =>
      f.draft.title.toLocaleLowerCase("ru").includes(query) &&
      (status === "all" || status === f.status),
  );
  $("#form-list").innerHTML = filtered.length
    ? `<div class="forms-table"><div class="table-labels"><span>Название формы</span><span>Статус</span><span>Отклики</span><span>Конверсия</span><span></span></div>${filtered.map((f) => `<article class="form-row"><a class="form-title" href="/admin/forms/${f.id}"><span class="form-symbol">${icon("file")}</span><span><strong>${esc(f.draft.title)}</strong><small>Изменена ${date(f.updatedAt)} · ${questions(f.draft.fields.length)}</small></span></a><div>${badge(f.status)}</div><span class="row-stat" aria-label="${f.stats.responses} откликов">${f.stats.responses}<small class="mobile-only"> откликов</small></span><span class="row-stat">${f.stats.conversion}%<small>${f.stats.views} посещений</small></span><a class="icon-button" href="/admin/forms/${f.id}" aria-label="Открыть форму ${esc(f.draft.title)}">${icon("arrow")}</a></article>`).join("")}</div>`
    : `<div class="empty"><span class="empty-icon">${icon("file")}</span><h3>${forms.length ? "Ничего не нашлось" : "Здесь появятся твои формы"}</h3><p>${forms.length ? "Попробуй другое название или статус." : "Создай первую форму и поделись ссылкой со студентами."}</p></div>`;
}
let current,
  dirty = false,
  activeTab = "builder",
  busy = false;
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
const editorPath = () => `/api/admin/forms/${current.id}`;
async function editor(id) {
  current = await api(`/api/admin/forms/${id}`);
  renderEditor();
}
function renderEditor() {
  shell(`<a class="back-link" href="/admin">${icon("back")} Мои формы</a><section class="editor-heading"><div><div class="heading-badge">${badge(current.status)}<span class="subtle">${current.published ? "Публичная версия " + current.published.version : "Пока видна только тебе"}</span></div><h1 class="editor-title">${esc(current.draft.title)}</h1></div>${current.published ? `<div class="heading-actions"><a class="button secondary small" href="/f/${current.slug}" target="_blank" rel="noopener">${icon("eye")} Открыть форму</a><button class="button secondary small" id="copy-link">${icon("link")} Скопировать ссылку</button></div>` : ""}</section>
  <nav class="tabs" aria-label="Разделы формы">${[
    ["builder", "Конструктор", "file"],
    ["responses", "Отклики", "check"],
    ["analytics", "Статистика", "chart"],
  ]
    .map(
      ([key, label, ico]) =>
        `<button class="tab ${activeTab === key ? "active" : ""}" data-tab="${key}" ${activeTab === key ? 'aria-current="page"' : ""}>${icon(ico)} ${label}</button>`,
    )
    .join("")}</nav><div id="tab-content"></div>`);
  $$(".tab").forEach((button) =>
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderTabs();
      $$(".tab").forEach((b) => {
        b.classList.toggle("active", b === button);
        if (b === button) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
    }),
  );
  $("#copy-link")?.addEventListener("click", copyLink);
  renderTabs();
}
async function copyLink() {
  const link = `${location.origin}/f/${current.slug}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Ссылка скопирована");
  } catch {
    toast(`Ссылка: ${link}`);
  }
}
async function renderTabs() {
  if (activeTab === "builder") return renderBuilder();
  const tab = activeTab;
  $("#tab-content").innerHTML =
    '<p class="loading" aria-busy="true">Загружаем…</p>';
  try {
    const data = await api(editorPath() + "/" + tab);
    if (activeTab !== tab) return;
    if (tab === "responses") renderResponses(data);
    else renderAnalytics(data);
  } catch (e) {
    if (activeTab === tab)
      $("#tab-content").innerHTML =
        `<p class="notice error" role="alert">${esc(e.message)}</p>`;
  }
}
function previewFields() {
  return current.draft.fields
    .map(
      (f, index) =>
        `<div class="preview-field"><span>${index + 1}. ${esc(f.label)}${f.required ? ' <span class="required">*</span>' : ""}</span><div class="fake-input ${f.type === "textarea" ? "tall" : ""}">${f.type === "select" ? "Выбери вариант…" : f.type === "checkbox" ? "□ Да" : f.type === "email" ? "name@example.com" : "Твой ответ"}</div></div>`,
    )
    .join("");
}
function renderBuilder(focusId) {
  $("#tab-content").innerHTML =
    `<div class="builder-grid"><section class="builder"><div class="panel form-settings"><div class="panel-heading"><span class="step-number">01</span><h2>О форме</h2></div><label class="field-label" for="form-title">Название <span class="required">*</span></label><input id="form-title" data-meta="title" value="${esc(current.draft.title)}" maxlength="120" required><label class="field-label" for="form-description">Описание <span class="optional">необязательно</span></label><textarea id="form-description" data-meta="description" rows="3" maxlength="1000" placeholder="Что это за возможность и что будет после отклика?">${esc(current.draft.description)}</textarea></div>
  <div class="panel-heading questions-heading"><span class="step-number">02</span><h2>Вопросы</h2><span class="subtle">${current.draft.fields.length} / 20</span></div><div id="question-list">${current.draft.fields.map(fieldEditor).join("")}</div><button class="add-question" id="add-question" ${current.draft.fields.length >= 20 ? "disabled" : ""}>${icon("plus")} Добавить вопрос</button>
  <div class="save-bar"><div><strong id="save-state">${dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</strong><small>Публикация делает сохранённую форму доступной по ссылке.</small></div><div class="save-actions"><button class="button secondary" id="save">Сохранить</button><button class="button" id="publish">${current.published ? "Обновить публикацию" : "Опубликовать"} ${icon("arrow")}</button></div></div>
  ${current.published ? `<div class="publication-settings"><div><strong>Приём откликов ${current.status === "closed" ? "закрыт" : "открыт"}</strong><p class="subtle">Сохранённые отклики останутся доступны после закрытия.</p></div><button class="button secondary small" id="toggle-status">${current.status === "closed" ? "Открыть приём" : "Закрыть приём"}</button></div>` : ""}</section>
  <aside class="preview-column"><div class="preview-top"><span>${icon("eye")} Предпросмотр вопросов</span><span class="demo-tag">без сбора ответов</span></div><div class="preview-phone"><div class="mini-brand">FutureToday<span>↗</span></div><div class="eyebrow">ТВОЙ СЛЕДУЮЩИЙ ШАГ</div><h2 id="preview-title">${esc(current.draft.title)}</h2><p id="preview-description">${esc(current.draft.description)}</p><div id="preview-fields">${previewFields()}</div><span class="preview-end">Студент увидит вопросы по одному</span></div><p class="preview-note">Простой путь к отклику: один вопрос за шаг, понятные подсказки и видимый прогресс.</p></aside></div>`;
  $$("[data-meta]").forEach((input) =>
    input.addEventListener("input", () => {
      current.draft[input.dataset.meta] = input.value;
      markDirty();
      updatePreview();
    }),
  );
  $$(
    "#question-list input, #question-list textarea, #question-list select",
  ).forEach((input) =>
    input.addEventListener("input", () => {
      const f = current.draft.fields.find(
        (f) => f.id === input.closest("[data-field]").dataset.field,
      );
      const prop = input.dataset.prop;
      if (prop === "required") f.required = input.checked;
      else if (prop === "options") f.options = input.value.split("\n");
      else f[prop] = input.value;
      markDirty();
      if (prop === "type") {
        if (f.type === "select" && !f.options)
          f.options = ["Вариант 1", "Вариант 2"];
        renderBuilder(f.id);
      } else updatePreview();
    }),
  );
  $$("[data-move]").forEach((b) =>
    b.addEventListener("click", () => {
      const index = current.draft.fields.findIndex(
        (f) => f.id === b.closest("[data-field]").dataset.field,
      );
      const target = index + Number(b.dataset.move);
      [current.draft.fields[index], current.draft.fields[target]] = [
        current.draft.fields[target],
        current.draft.fields[index],
      ];
      markDirty();
      renderBuilder(current.draft.fields[target].id);
    }),
  );
  $$("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      if (
        !confirm(
          "Удалить вопрос из черновика? Ранее полученные ответы сохранятся.",
        )
      )
        return;
      const id = b.closest("[data-field]").dataset.field;
      current.draft.fields = current.draft.fields.filter((f) => f.id !== id);
      markDirty();
      renderBuilder();
      $("#add-question").focus();
    }),
  );
  $("#add-question").addEventListener("click", () => {
    const id = crypto.randomUUID();
    current.draft.fields.push({
      id,
      label: "Новый вопрос",
      type: "text",
      required: false,
    });
    markDirty();
    renderBuilder(id);
  });
  $("#save").addEventListener("click", () => save(false));
  $("#publish").addEventListener("click", () => save(true));
  $("#toggle-status")?.addEventListener("click", async (e) => {
    const status = current.status === "closed" ? "published" : "closed";
    if (
      status === "closed" &&
      !confirm(
        "Закрыть приём? Студенты больше не смогут отправлять ответы, включая уже открытые формы.",
      )
    )
      return;
    e.currentTarget.disabled = true;
    try {
      // Preserve unsaved local draft when changing the public status.
      const draft = current.draft;
      const updated = await post(editorPath() + "/status", {
        revision: current.revision,
        status,
      });
      current = { ...updated, draft };
      renderEditor();
      toast(status === "closed" ? "Приём закрыт" : "Приём открыт");
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
    }
  });
  if (focusId) $(`[data-field="${focusId}"] [data-prop="label"]`)?.focus();
}
function fieldEditor(f, index) {
  return `<article class="panel question-card" data-field="${f.id}"><div class="question-top"><span class="question-number">Вопрос ${String(index + 1).padStart(2, "0")}</span><div class="question-tools"><button class="icon-button" data-move="-1" aria-label="Переместить вопрос ${index + 1} выше" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-move="1" aria-label="Переместить вопрос ${index + 1} ниже" ${index === current.draft.fields.length - 1 ? "disabled" : ""}>${icon("chevron")}</button><button class="icon-button danger" data-remove aria-label="Удалить вопрос ${index + 1}" ${current.draft.fields.length === 1 ? "disabled" : ""}>${icon("trash")}</button></div></div><label class="field-label" for="label-${f.id}">Текст вопроса</label><input id="label-${f.id}" data-prop="label" value="${esc(f.label)}" maxlength="180" required><div class="question-options"><label class="type-label" for="type-${f.id}">Тип ответа<select id="type-${f.id}" data-prop="type">${Object.entries(
    typeNames,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${f.type === k ? "selected" : ""}>${v}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="checkbox-label"><input type="checkbox" data-prop="required" ${f.required ? "checked" : ""}>Обязательный</label></div>${f.type === "select" ? `<label class="field-label" for="options-${f.id}">Варианты ответа <span class="optional">каждый с новой строки, от 2 до 20</span></label><textarea id="options-${f.id}" data-prop="options" rows="3">${esc((f.options || []).join("\n"))}</textarea>` : ""}</article>`;
}
function markDirty() {
  dirty = true;
  const state = $("#save-state");
  if (state) state.textContent = "Есть несохранённые изменения";
}
function updatePreview() {
  $("#preview-title").textContent = current.draft.title;
  $("#preview-description").textContent = current.draft.description;
  $("#preview-fields").innerHTML = previewFields();
}
async function save(publish) {
  if (busy) return;
  busy = true;
  $$(
    "#tab-content input, #tab-content textarea, #tab-content select, #tab-content button, .tab",
  ).forEach((b) => (b.disabled = true));
  try {
    current = await post(
      editorPath(),
      { ...current.draft, revision: current.revision },
      "PUT",
    );
    dirty = false;
    if (publish)
      current = await post(editorPath() + "/publish", {
        revision: current.revision,
      });
    renderEditor();
    toast(
      publish
        ? "Форма опубликована. Можно делиться ссылкой!"
        : "Изменения сохранены",
    );
  } catch (e) {
    toast(e.message, true);
    renderBuilder();
  } finally {
    busy = false;
  }
}
function renderResponses(responses) {
  $("#tab-content").innerHTML =
    `<div class="section-head responses-head"><div><h2>Отклики <span class="count">${responses.length}</span></h2><p class="subtle">Ответы сохранены вместе с вопросами той версии формы.</p></div><div class="heading-actions"><button class="button secondary small" id="refresh">Обновить</button>${responses.length ? `<a class="button secondary small" href="${editorPath()}/export">${icon("down")} Скачать CSV</a>` : ""}</div></div>${responses.length ? `<div class="response-list">${responses.map((r, i) => `<details class="panel response"><summary><span class="response-avatar">${String(responses.length - i).padStart(2, "0")}</span><span><strong>Отклик № ${responses.length - i}</strong><small>${date(r.createdAt)} · версия ${r.schema.version}</small></span>${icon("chevron")}</summary><dl>${r.schema.fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.type === "checkbox" ? (r.answers[f.id] ? "Да" : "Нет") : esc(r.answers[f.id] || "—")}</dd></div>`).join("")}</dl><small class="response-id">ID: ${r.id}</small></details>`).join("")}</div>` : `<div class="panel empty"><span class="empty-icon">${icon("check")}</span><h3>Первый отклик ещё впереди</h3><p>${current.published ? "Поделись ссылкой на форму со студентами." : "Опубликуй форму в конструкторе, чтобы начать сбор."}</p>${current.published ? '<button id="empty-copy" class="button secondary">Скопировать ссылку</button>' : ""}</div>`}`;
  $("#refresh").addEventListener("click", renderTabs);
  $("#empty-copy")?.addEventListener("click", copyLink);
}
function renderAnalytics(versions) {
  $("#tab-content").innerHTML =
    `<div class="section-head responses-head"><div><h2>Путь к отклику</h2><p class="subtle">Посмотри, до какого вопроса доходят студенты.</p></div><button class="button secondary small" id="refresh">Обновить</button></div>${
      versions.length
        ? versions
            .map(
              (v) =>
                `<section class="panel analytics-version"><div class="section-head"><h3>Версия ${v.version}</h3><span class="subtle">Конверсия в отклик: ${v.views ? Math.round((v.submissions / v.views) * 100) : 0}%</span></div><div class="funnel">${[
                  ["Открыли форму", v.views],
                  ["Начали заполнение", v.starts],
                  ["Отправили отклик", v.submissions],
                ]
                  .map(
                    ([label, value], i) =>
                      `<div class="funnel-step"><span class="funnel-number">0${i + 1}</span><strong>${value}</strong><span>${label}</span><progress max="${Math.max(v.views, 1)}" value="${value}">${value}</progress></div>`,
                  )
                  .join(
                    "",
                  )}</div><div class="overflow-table"><table><thead><tr><th scope="col">Вопрос</th><th scope="col">Дошли</th><th scope="col">Прошли</th><th scope="col">Остановились*</th></tr></thead><tbody>${v.fields.map((f, i) => `<tr><th scope="row"><span class="subtle">${i + 1}.</span> ${esc(f.label)}</th><td>${f.reached}</td><td>${f.completed}</td><td>${f.stopped}</td></tr>`).join("")}</tbody></table></div></section>`,
            )
            .join("")
        : '<div class="panel empty"><h3>Статистика появится после публикации</h3><p>Перейди в конструктор и опубликуй форму.</p></div>'
    }<aside class="analytics-note"><strong>Как читать статистику</strong><p>Посещение — открытие формы в одной вкладке и одной версии. Обновление страницы в этой вкладке не увеличивает счётчик. «Прошли» включает пропуск необязательного вопроса.</p><p>* «Остановились» — незавершённые посещения, где этот вопрос был самым дальним открытым шагом. Среди них есть студенты, которые ещё заполняют форму. Эти цифры показывают место остановки, но не объясняют её причину. Новая версия считается отдельно.</p></aside>`;
  $("#refresh").addEventListener("click", renderTabs);
}

let publicForm,
  sessionId,
  answers = Object.create(null),
  step = -1,
  sending = false,
  eventQueue = Promise.resolve();
async function publicBoot(slug) {
  publicForm = await api(`/api/public/forms/${slug}`);
  let clientId;
  try {
    clientId = sessionStorage.getItem(`ft-visit:${slug}`);
    if (!clientId) {
      clientId = crypto.randomUUID();
      sessionStorage.setItem(`ft-visit:${slug}`, clientId);
    }
  } catch {
    clientId = crypto.randomUUID();
  }
  const session = await post(`/api/public/forms/${slug}/sessions`, {
    clientId,
    version: publicForm.version,
  });
  sessionId = session.sessionId;
  if (session.submitted) return success();
  renderPublic();
}
function event(type, fieldId) {
  eventQueue = eventQueue
    .catch(() => {})
    .then(() =>
      post(`/api/public/forms/${publicForm.slug}/events`, {
        sessionId,
        type,
        fieldId,
      }),
    )
    .catch(() => {});
}
function renderPublic() {
  const total = publicForm.fields.length;
  const f = publicForm.fields[step];
  $("#app").innerHTML =
    `<div class="public-shell"><header>${publicBrand}<span class="public-header-note">Твой следующий шаг начинается здесь</span></header><main id="main" class="public-card">${step < 0 ? `<div class="opportunity-badge"><span></span> ОТКРЫТО ДЛЯ ТЕБЯ</div><div class="public-flower" aria-hidden="true">✳</div><h1>${esc(publicForm.title)}</h1><p class="public-description">${esc(publicForm.description || "Расскажи немного о себе и сделай следующий шаг в карьере.")}</p><div class="public-meta"><span>${icon("file")} ${questions(total)}</span><span>По одному за шаг</span></div><button class="button public-cta" id="begin">Начать заполнение ${icon("arrow")}</button><p class="privacy-note">Ответы получит менеджер формы. Они сохранятся только после отправки. Не указывай пароли и другие секретные данные.</p>` : `<div class="progress-header"><span>ВОПРОС ${step + 1} ИЗ ${total}</span><span>${Math.round((step / total) * 100)}%</span></div><progress class="public-progress" value="${step}" max="${total}" aria-label="Прогресс заполнения">${step} из ${total}</progress><p class="public-form-title">${esc(publicForm.title)}</p><form id="answer-form" novalidate><label class="public-question" for="answer">${esc(f.label)}${f.required ? ' <span class="required">*</span>' : ""}</label><p class="question-hint">${f.required ? "Обязательный вопрос" : "Можно пропустить"}</p>${answerInput(f)}<p id="answer-error" class="field-error" role="alert"></p><div class="public-actions"><button class="button secondary" type="button" id="previous">${icon("back")} Назад</button><button class="button" type="submit" id="next">${step === total - 1 ? "Отправить отклик" : "Продолжить"} ${icon("arrow")}</button></div><p class="privacy-note">${step === total - 1 ? "Проверь ответы кнопкой «Назад». После отправки изменить отклик нельзя." : "Ответы сохраняются при переходах между вопросами в этой вкладке. При обновлении страницы ввод потребуется повторить."}</p></form>`}</main><footer class="public-footer">Сделано в FutureToday Forms <span>↗</span></footer></div>`;
  if (step < 0)
    $("#begin").addEventListener("click", () => {
      step = 0;
      event("start");
      event("field_view", publicForm.fields[0].id);
      renderPublic();
    });
  else {
    $("#answer").focus();
    $("#previous").addEventListener("click", () => {
      rememberAnswer();
      step--;
      renderPublic();
    });
    $("#answer-form").addEventListener("submit", submitStep);
    $("#answer").addEventListener("input", () => {
      $("#answer-error").textContent = "";
      $("#answer").removeAttribute("aria-invalid");
    });
  }
}
function answerInput(f) {
  const common = `id="answer" name="answer" aria-describedby="answer-error" ${f.required ? "required" : ""}`;
  if (f.type === "textarea")
    return `<textarea ${common} maxlength="4000" rows="5" placeholder="Твой ответ…">${esc(answers[f.id] || "")}</textarea>`;
  if (f.type === "select")
    return `<select ${common}><option value="">Выбери вариант…</option>${f.options.map((o) => `<option value="${esc(o)}" ${answers[f.id] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "checkbox")
    return `<div class="public-checkbox"><input ${common} type="checkbox" ${answers[f.id] ? "checked" : ""}><label for="answer">Да</label></div>`;
  return `<input ${common} type="${f.type === "email" ? "email" : "text"}" maxlength="300" value="${esc(answers[f.id] || "")}" autocomplete="${f.type === "email" ? "email" : "off"}" placeholder="${f.type === "email" ? "name@example.com" : "Твой ответ…"}">`;
}
function rememberAnswer() {
  const f = publicForm.fields[step];
  answers[f.id] =
    f.type === "checkbox" ? $("#answer").checked : $("#answer").value.trim();
}
async function submitStep(e) {
  e.preventDefault();
  if (sending) return;
  const f = publicForm.fields[step];
  rememberAnswer();
  const v = answers[f.id];
  let error = "";
  if (f.required && (f.type === "checkbox" ? v !== true : !v))
    error =
      f.type === "checkbox"
        ? "Поставь отметку, чтобы продолжить."
        : "Ответь на обязательный вопрос.";
  else if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    error = "Введи email в формате name@example.com.";
  if (error) {
    $("#answer-error").textContent = error;
    $("#answer").setAttribute("aria-invalid", "true");
    $("#answer").focus();
    return;
  }
  event("field_complete", f.id);
  if (step < publicForm.fields.length - 1) {
    step++;
    event("field_view", publicForm.fields[step].id);
    renderPublic();
    return;
  }
  sending = true;
  $("#next").disabled = true;
  $("#previous").disabled = true;
  $("#next").textContent = "Отправляем…";
  try {
    await post(`/api/public/forms/${publicForm.slug}/responses`, {
      sessionId,
      answers,
    });
    success();
  } catch (err) {
    const invalidId = Object.keys(err.fields || {})[0];
    if (invalidId) {
      step = publicForm.fields.findIndex((field) => field.id === invalidId);
      renderPublic();
    }
    $("#answer-error").textContent = invalidId
      ? err.fields[invalidId]
      : err.message;
    $("#answer").setAttribute("aria-invalid", "true");
    $("#answer").focus();
    $("#next").disabled = false;
    $("#previous").disabled = false;
    $("#next").innerHTML =
      `${step === publicForm.fields.length - 1 ? "Отправить отклик" : "Продолжить"} ${icon("arrow")}`;
  } finally {
    sending = false;
  }
}
function success() {
  answers = Object.create(null);
  $("#app").innerHTML =
    `<div class="public-shell"><header>${publicBrand}</header><main id="main" class="public-card success-card"><div class="success-symbol">${icon("check")}</div><div class="eyebrow">ПЕРВЫЙ ШАГ СДЕЛАН</div><h1>Твой отклик уже у команды!</h1><p>Спасибо! Ответы сохранены и доступны менеджеру формы. Если для этой возможности предусмотрена обратная связь, команда свяжется с тобой по указанным контактам.</p><div class="success-note">Эту вкладку можно закрыть.<br>Повторно отправлять форму не нужно.</div></main><footer class="public-footer">Сделано в FutureToday Forms <span>↗</span></footer></div>`;
  document.title = "Отклик отправлен · FutureToday";
}
(async () => {
  try {
    const path = location.pathname;
    if (path.startsWith("/f/")) {
      document.title = "Твой следующий шаг · FutureToday";
      await publicBoot(path.split("/")[2]);
    } else if (/^\/admin\/forms\//.test(path)) await editor(path.split("/")[3]);
    else await dashboard();
  } catch (error) {
    errorPage(error, location.pathname.startsWith("/f/"));
  }
})();
