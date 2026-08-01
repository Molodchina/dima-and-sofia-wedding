(function () {
  "use strict";

  const config = window.WEDDING_CONFIG || {};
  const apiBase = String(config.apiBase || "").trim().replace(/\/+$/, "");

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("adminLoginForm");
  const loginStatus = document.getElementById("loginStatus");
  const dashboardStatus = document.getElementById("dashboardStatus");
  const responsesBody = document.getElementById("responsesBody");
  const reloadButton = document.getElementById("reloadResponses");
  const exportButton = document.getElementById("exportCsv");
  const logoutButton = document.getElementById("logoutButton");

  let currentResponses = [];
  init();

  function init() {
    if (!apiBase) {
      showLogin();
      setStatus(loginStatus, "В config.js не указан apiBase.", true);
      return;
    }

    loginForm.addEventListener("submit", handleLogin);
    reloadButton.addEventListener("click", loadResponses);
    exportButton.addEventListener("click", exportCsv);
    logoutButton.addEventListener("click", handleLogout);
    checkSession();
  }

  async function checkSession() {
    setStatus(loginStatus, "Проверяем сессию…", false);
    try {
      await apiRequest("/api/admin/session");
      showDashboard();
      await loadResponses();
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
    setStatus(loginStatus, "Входим…", false);

    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: { email, password }
      });
      loginForm.elements.password.value = "";
      showDashboard();
      await loadResponses();
    } catch (error) {
      setStatus(loginStatus, error.message || "Не удалось войти.", true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function loadResponses() {
    reloadButton.disabled = true;
    setStatus(dashboardStatus, "Загружаем ответы…", false);

    try {
      const result = await apiRequest("/api/admin/responses");
      currentResponses = Array.isArray(result.responses) ? result.responses : [];
      renderResponses(currentResponses);
      renderSummary(currentResponses);
      setStatus(dashboardStatus, `Загружено приглашений: ${currentResponses.length}.`, false);
    } catch (error) {
      if (error.status === 401) {
        currentResponses = [];
        showLogin();
        setStatus(loginStatus, "Сессия завершилась. Войдите снова.", true);
        return;
      }
      setStatus(dashboardStatus, error.message || "Не удалось загрузить ответы.", true);
    } finally {
      reloadButton.disabled = false;
    }
  }

  async function handleLogout() {
    logoutButton.disabled = true;
    try {
      await apiRequest("/api/admin/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request failed", error);
    } finally {
      currentResponses = [];
      responsesBody.replaceChildren();
      showLogin();
      setStatus(loginStatus, "Вы вышли из админки.", false);
      logoutButton.disabled = false;
    }
  }

  function renderResponses(items) {
    responsesBody.replaceChildren();

    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "admin-empty";
      cell.textContent = "Приглашения пока не найдены.";
      row.appendChild(cell);
      responsesBody.appendChild(row);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("tr");
      const guests = Array.isArray(item.guests) ? item.guests.join(", ") : "";
      appendCell(row, guests || "—");
      appendCell(
        row,
        item.attendanceStatus || "Нет ответа",
        item.attendanceStatus ? "status-answered" : "status-empty"
      );
      appendCell(row, item.contact || "—");
      appendCell(row, item.comment || "—");
      appendCell(row, formatDate(item.updatedAt));
      appendCell(row, item.slug || "—", "admin-monospace");
      appendCell(row, String(item.maxGuests || "—"));
      responsesBody.appendChild(row);
    });
  }

  function renderSummary(items) {
    const answered = items.filter((item) => Boolean(item.attendanceStatus));
    const declined = answered.filter(
      (item) => item.attendanceStatus === "К сожалению, не смогу присутствовать"
    );
    const attending = answered.length - declined.length;

    setText("summaryTotal", items.length);
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
      "Максимум гостей"
    ]];

    currentResponses.forEach((item) => {
      rows.push([
        Array.isArray(item.guests) ? item.guests.join(", ") : "",
        item.attendanceStatus || "Нет ответа",
        item.contact || "",
        item.comment || "",
        formatDate(item.updatedAt),
        item.slug || "",
        item.maxGuests || ""
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

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
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
