(function () {
  "use strict";

  const config = window.WEDDING_CONFIG || {};
  const apiBase = String(config.apiBase || "").trim().replace(/\/+$/, "");
  const publicBaseUrl = String(config.publicBaseUrl || window.location.origin)
    .trim()
    .replace(/\/+$/, "");
  const maxInvitationGuests = Number(config.maxInvitationGuests || 20);

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("adminLoginForm");
  const invitationForm = document.getElementById("invitationForm");
  const loginStatus = document.getElementById("loginStatus");
  const dashboardStatus = document.getElementById("dashboardStatus");
  const invitationStatus = document.getElementById("invitationStatus");
  const invitationsBody = document.getElementById("invitationsBody");
  const responsesBody = document.getElementById("responsesBody");
  const reloadButton = document.getElementById("reloadResponses");
  const exportButton = document.getElementById("exportCsv");
  const logoutButton = document.getElementById("logoutButton");
  const generateSlugButton = document.getElementById("generateSlug");
  const resetInvitationFormButton = document.getElementById("resetInvitationForm");
  const copyInvitationLinkButton = document.getElementById("copyInvitationLink");
  const invitationLinkPreview = document.getElementById("invitationLinkPreview");
  const invitationFormTitle = document.getElementById("invitationFormTitle");

  let currentInvitations = [];
  let currentResponses = [];

  init();

  function init() {
    if (!apiBase) {
      showLogin();
      setStatus(loginStatus, "В config.js не указан apiBase.", true);
      return;
    }

    loginForm.addEventListener("submit", handleLogin);
    invitationForm.addEventListener("submit", handleInvitationSave);
    invitationForm.elements.slug.addEventListener("input", updateInvitationLinkPreview);
    invitationForm.elements.guests.addEventListener("input", syncMaxGuestsWithGuests);
    reloadButton.addEventListener("click", loadDashboardData);
    exportButton.addEventListener("click", exportCsv);
    logoutButton.addEventListener("click", handleLogout);
    generateSlugButton.addEventListener("click", handleGenerateSlug);
    resetInvitationFormButton.addEventListener("click", resetInvitationForm);
    copyInvitationLinkButton.addEventListener("click", copyCurrentInvitationLink);

    resetInvitationForm();
    checkSession();
  }

  async function checkSession() {
    setStatus(loginStatus, "Проверяем сессию...", false);
    try {
      await apiRequest("/api/admin/session");
      showDashboard();
      await loadDashboardData();
    } catch (error) {
      showLogin();
      if (error.status && error.status !== 401) {
        setStatus(loginStatus, error.message, true);
      } else {
        setStatus(loginStatus, "", false);
      }
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const email = String(loginForm.elements.email.value || "").trim();
    const password = String(loginForm.elements.password.value || "");
    const submitButton = loginForm.querySelector('button[type="submit"]');
    if (!email || !password) return;

    submitButton.disabled = true;
    setStatus(loginStatus, "Входим...", false);

    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: { email, password }
      });
      loginForm.elements.password.value = "";
      showDashboard();
      await loadDashboardData();
    } catch (error) {
      setStatus(loginStatus, error.message || "Не удалось войти.", true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function loadDashboardData() {
    reloadButton.disabled = true;
    setStatus(dashboardStatus, "Загружаем данные...", false);

    try {
      const [invitationsResult, responsesResult] = await Promise.all([
        apiRequest("/api/admin/invitations"),
        apiRequest("/api/admin/responses")
      ]);

      currentInvitations = Array.isArray(invitationsResult.invitations)
        ? invitationsResult.invitations
        : [];
      currentResponses = Array.isArray(responsesResult.responses)
        ? responsesResult.responses
        : [];

      renderInvitations(currentInvitations);
      renderResponses(currentResponses);
      renderSummary(currentResponses);

      const answered = currentResponses.filter((item) => Boolean(item.attendanceStatus)).length;
      setStatus(
        dashboardStatus,
        `Загружено приглашений: ${currentInvitations.length}. Ответов: ${answered}.`,
        false
      );
    } catch (error) {
      if (error.status === 401) {
        currentInvitations = [];
        currentResponses = [];
        showLogin();
        setStatus(loginStatus, "Сессия завершилась. Войдите снова.", true);
        return;
      }
      setStatus(dashboardStatus, error.message || "Не удалось загрузить данные.", true);
    } finally {
      reloadButton.disabled = false;
    }
  }

  async function handleInvitationSave(event) {
    event.preventDefault();

    const submitButton = invitationForm.querySelector('button[type="submit"]');
    const originalSlug = String(invitationForm.elements.originalSlug.value || "").trim();
    const payload = buildInvitationPayload();

    if (!payload) return;

    submitButton.disabled = true;
    setStatus(invitationStatus, "Сохраняем приглашение...", false);

    try {
      const path = originalSlug
        ? `/api/admin/invitations/${encodeURIComponent(originalSlug)}`
        : "/api/admin/invitations";

      await apiRequest(path, {
        method: originalSlug ? "PUT" : "POST",
        body: payload
      });

      setStatus(invitationStatus, "Приглашение сохранено.", false);
      resetInvitationForm();
      await loadDashboardData();
    } catch (error) {
      setStatus(invitationStatus, error.message || "Не удалось сохранить приглашение.", true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function handleToggleInvitation(item) {
    setStatus(dashboardStatus, "Обновляем активность приглашения...", false);
    try {
      await apiRequest(`/api/admin/invitations/${encodeURIComponent(item.slug)}/active`, {
        method: "PATCH",
        body: { isActive: !item.isActive }
      });
      await loadDashboardData();
    } catch (error) {
      setStatus(dashboardStatus, error.message || "Не удалось обновить приглашение.", true);
    }
  }

  async function handleDeleteInvitation(item) {
    const guests = Array.isArray(item.guests) ? item.guests.join(", ") : item.slug;
    const confirmed = window.confirm(
      `Удалить приглашение для "${guests}"? Связанный RSVP-ответ тоже будет удалён.`
    );
    if (!confirmed) return;

    setStatus(dashboardStatus, "Удаляем приглашение...", false);
    try {
      await apiRequest(`/api/admin/invitations/${encodeURIComponent(item.slug)}`, {
        method: "DELETE"
      });
      if (invitationForm.elements.originalSlug.value === item.slug) {
        resetInvitationForm();
      }
      await loadDashboardData();
    } catch (error) {
      setStatus(dashboardStatus, error.message || "Не удалось удалить приглашение.", true);
    }
  }

  async function handleLogout() {
    logoutButton.disabled = true;
    try {
      await apiRequest("/api/admin/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request failed", error);
    } finally {
      currentInvitations = [];
      currentResponses = [];
      invitationsBody.replaceChildren();
      responsesBody.replaceChildren();
      showLogin();
      setStatus(loginStatus, "Вы вышли из админки.", false);
      logoutButton.disabled = false;
    }
  }

  function buildInvitationPayload() {
    const guests = parseGuests(invitationForm.elements.guests.value);
    const slug = String(invitationForm.elements.slug.value || "").trim();
    const greeting = String(invitationForm.elements.greeting.value || "").trim();
    const maxGuests = Number(invitationForm.elements.maxGuests.value || guests.length);
    const isActive = Boolean(invitationForm.elements.isActive.checked);

    if (!guests.length) {
      setStatus(invitationStatus, "Укажите хотя бы одного гостя.", true);
      return null;
    }

    if (!/^[A-Za-z0-9_-]{8,160}$/.test(slug)) {
      setStatus(invitationStatus, "Slug должен быть 8-160 символов: латиница, цифры, _ или -.", true);
      return null;
    }

    if (greeting.length < 3) {
      setStatus(invitationStatus, "Укажите обращение.", true);
      return null;
    }

    if (
      !Number.isInteger(maxGuests) ||
      maxGuests < guests.length ||
      maxGuests > maxInvitationGuests
    ) {
      setStatus(
        invitationStatus,
        `Максимум гостей должен быть от количества гостей в списке до ${maxInvitationGuests}.`,
        true
      );
      return null;
    }

    return {
      slug,
      greeting,
      guests,
      maxGuests,
      isActive
    };
  }

  function renderInvitations(items) {
    invitationsBody.replaceChildren();

    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "admin-empty";
      cell.textContent = "Приглашения пока не созданы.";
      row.appendChild(cell);
      invitationsBody.appendChild(row);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("tr");
      const guests = Array.isArray(item.guests) ? item.guests.join(", ") : "";

      appendCell(row, guests || "-", "");
      appendCell(row, item.slug || "-", "admin-monospace");
      appendCell(
        row,
        item.isActive ? "Активно" : "Выключено",
        item.isActive ? "status-answered" : "status-empty"
      );
      appendCell(
        row,
        item.attendanceStatus || "Нет ответа",
        item.attendanceStatus ? "status-answered" : "status-empty"
      );
      appendCell(row, formatDate(item.responseUpdatedAt || item.updatedAt));
      appendActionsCell(row, item);

      invitationsBody.appendChild(row);
    });
  }

  function renderResponses(items) {
    responsesBody.replaceChildren();

    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "admin-empty";
      cell.textContent = "Ответы пока не найдены.";
      row.appendChild(cell);
      responsesBody.appendChild(row);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("tr");
      const guests = Array.isArray(item.guests) ? item.guests.join(", ") : "";
      appendCell(row, guests || "-");
      appendCell(
        row,
        item.attendanceStatus || "Нет ответа",
        item.attendanceStatus ? "status-answered" : "status-empty"
      );
      appendCell(row, item.contact || "-");
      appendCell(row, item.comment || "-");
      appendCell(row, formatDate(item.updatedAt));
      appendCell(row, item.slug || "-", "admin-monospace");
      appendCell(row, String(item.maxGuests || "-"));
      responsesBody.appendChild(row);
    });
  }

  function appendActionsCell(row, item) {
    const cell = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "admin-row-actions";

    wrap.appendChild(makeActionButton("Копировать", () => copyInvitationLink(item.slug)));
    wrap.appendChild(makeActionButton("Изменить", () => editInvitation(item)));
    wrap.appendChild(makeActionButton(
      item.isActive ? "Выключить" : "Включить",
      () => handleToggleInvitation(item)
    ));
    wrap.appendChild(makeActionButton("Удалить", () => handleDeleteInvitation(item), true));

    cell.appendChild(wrap);
    row.appendChild(cell);
  }

  function makeActionButton(label, onClick, isDanger) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = isDanger
      ? "admin-button admin-button--danger admin-button--small"
      : "admin-button admin-button--small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function editInvitation(item) {
    invitationForm.elements.originalSlug.value = item.slug || "";
    invitationForm.elements.guests.value = Array.isArray(item.guests)
      ? item.guests.join(", ")
      : "";
    invitationForm.elements.greeting.value = item.greeting || "";
    invitationForm.elements.slug.value = item.slug || "";
    invitationForm.elements.maxGuests.value = String(item.maxGuests || 1);
    invitationForm.elements.isActive.checked = Boolean(item.isActive);
    invitationFormTitle.textContent = "Редактирование приглашения";
    setStatus(invitationStatus, "Редактируете существующее приглашение.", false);
    updateInvitationLinkPreview();
    invitationForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetInvitationForm() {
    invitationForm.reset();
    invitationForm.elements.originalSlug.value = "";
    invitationForm.elements.maxGuests.value = "1";
    invitationForm.elements.isActive.checked = true;
    invitationFormTitle.textContent = "Новое приглашение";
    setStatus(invitationStatus, "", false);
    updateInvitationLinkPreview();
  }

  function handleGenerateSlug() {
    const guests = parseGuests(invitationForm.elements.guests.value);
    const base = guests.length ? guests.join("-") : "guest";
    const suffix = secureToken(6);
    const prefix = slugify(base).slice(0, 160 - suffix.length - 1);
    invitationForm.elements.slug.value = `${prefix}-${suffix}`;
    syncMaxGuestsWithGuests();
    updateInvitationLinkPreview();
  }

  function syncMaxGuestsWithGuests() {
    const guestsCount = parseGuests(invitationForm.elements.guests.value).length;
    const currentMax = Number(invitationForm.elements.maxGuests.value || 0);
    if (guestsCount && (!currentMax || currentMax < guestsCount)) {
      invitationForm.elements.maxGuests.value = String(Math.min(guestsCount, maxInvitationGuests));
    }
  }

  function renderSummary(items) {
    const answered = items.filter((item) => Boolean(item.attendanceStatus));
    const declined = answered.filter(
      (item) => item.attendanceStatus === "К сожалению, не смогу присутствовать"
    );
    const attending = answered.length - declined.length;

    setText("summaryTotal", currentInvitations.length || items.length);
    setText("summaryAnswered", answered.length);
    setText("summaryAttending", attending);
    setText("summaryDeclined", declined.length);
  }

  function exportCsv() {
    if (!currentResponses.length) {
      setStatus(dashboardStatus, "Нет данных для экспорта.", true);
      return;
    }

    const rows = [[
      "Гости",
      "Статус",
      "Контакт",
      "Комментарий",
      "Обновлено",
      "Slug",
      "Максимум гостей",
      "Активно"
    ]];

    currentResponses.forEach((item) => {
      rows.push([
        Array.isArray(item.guests) ? item.guests.join(", ") : "",
        item.attendanceStatus || "Нет ответа",
        item.contact || "",
        item.comment || "",
        formatDate(item.updatedAt),
        item.slug || "",
        item.maxGuests || "",
        item.isActive ? "Да" : "Нет"
      ]);
    });

    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `wedding-rsvp-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  async function apiRequest(path, options) {
    const requestOptions = options || {};
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    const headers = new Headers(requestOptions.headers || {});
    let body = requestOptions.body;

    if (body !== undefined && body !== null) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${apiBase}${path}`, {
        method: requestOptions.method || "GET",
        headers,
        body,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });

      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = { message: text };
        }
      }

      if (!response.ok) {
        const error = new Error(
          data.error || data.message || `Ошибка сервера: ${response.status}`
        );
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Сервер не ответил вовремя.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
    window.setTimeout(() => loginForm.elements.email.focus(), 0);
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  function appendCell(row, value, className) {
    const cell = document.createElement("td");
    cell.textContent = String(value);
    if (className) cell.className = className;
    row.appendChild(cell);
  }

  function setStatus(element, message, isError) {
    element.textContent = message;
    element.classList.toggle("admin-status--error", Boolean(isError));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function parseGuests(value) {
    return String(value || "")
      .split(/[\n,;]+/)
      .map((guest) => guest.trim())
      .filter(Boolean);
  }

  function updateInvitationLinkPreview() {
    const slug = String(invitationForm.elements.slug.value || "").trim();
    const link = slug ? buildInvitationLink(slug) : "Ссылка появится после slug";
    invitationLinkPreview.textContent = link;
  }

  async function copyCurrentInvitationLink() {
    const slug = String(invitationForm.elements.slug.value || "").trim();
    if (!slug) {
      setStatus(invitationStatus, "Сначала укажите или сгенерируйте slug.", true);
      return;
    }

    await copyInvitationLink(slug);
    setStatus(invitationStatus, "Ссылка скопирована.", false);
  }

  async function copyInvitationLink(slug) {
    const link = buildInvitationLink(slug);

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        fallbackCopy(link);
      }
      setStatus(dashboardStatus, "Персональная ссылка скопирована.", false);
    } catch (error) {
      console.warn("Clipboard failed", error);
      setStatus(dashboardStatus, "Не удалось скопировать ссылку.", true);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function buildInvitationLink(slug) {
    return `${publicBaseUrl}/?invite=${encodeURIComponent(slug)}`;
  }

  function slugify(value) {
    const transliterated = transliterate(value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "");

    return transliterated || "guest";
  }

  function transliterate(value) {
    const map = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
      з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
      п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
      ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
      я: "ya"
    };

    return String(value || "").replace(/[А-Яа-яЁё]/g, (letter) => {
      const lower = letter.toLowerCase();
      const result = map[lower] || "";
      return letter === lower ? result : result.toUpperCase();
    });
  }

  function secureToken(byteLength) {
    const bytes = new Uint8Array(byteLength);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function csvCell(value) {
    let text = String(value ?? "").replace(/\r?\n/g, " ");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
})();
