(function () {
  "use strict";

  const config = window.WEDDING_CONFIG || {};
  const apiBase = normalizeBaseUrl(config.apiBase);
  const params = new URLSearchParams(window.location.search);
  const invitationSlug = normalizeSlug(params.get("invite"));

  let siteWasRevealed = false;
  let revealObserver = null;

  init().catch((error) => {
    console.error("Wedding site initialization failed", error);
    revealSite();
    showFormMessage(
      "Не удалось полностью загрузить приглашение. Обновите страницу или свяжитесь с организаторами.",
      true
    );
  });

  async function init() {
    setupIntro();
    setupCountdown();
    setupCalendar();

    const invitation = await loadInvitation(invitationSlug);
    personalize(invitation);
    setupForm(invitation, invitationSlug);
  }

  async function loadInvitation(slug) {
    if (!slug) {
      return {
        valid: false,
        greeting: "Дорогие гости!",
        guests: [],
        error: "Откройте персональную ссылку из сообщения с приглашением."
      };
    }

    if (!apiBase) {
      return {
        valid: false,
        greeting: "Дорогие гости!",
        guests: [],
        error: "Адрес сервера не настроен."
      };
    }

    try {
      const data = await requestJson("/api/invitation", {
        method: "POST",
        body: { slug },
        credentials: "omit",
        timeoutMs: 10000
      });

      const guests = Array.isArray(data.guests)
        ? data.guests.map((guest) => String(guest).trim()).filter(Boolean)
        : [];

      if (!guests.length) {
        throw new Error("Сервер вернул приглашение без списка гостей.");
      }

      return {
        valid: true,
        greeting: String(data.greeting || neutralGreeting(guests)),
        guests,
        maxGuests: Number(data.maxGuests || guests.length)
      };
    } catch (error) {
      console.warn("Invitation loading failed", error);
      return {
        valid: false,
        greeting: "Дорогие гости!",
        guests: [],
        error: error.message || "Не удалось загрузить персональное приглашение."
      };
    }
  }

  function personalize(invitation) {
    const greeting = document.getElementById("greeting");
    const guestNames = document.getElementById("guestNames");

    if (greeting) {
      greeting.textContent = invitation.greeting || "Дорогие гости!";
    }

    if (guestNames) {
      guestNames.value = invitation.valid
        ? invitation.guests.join(", ")
        : "Персональная ссылка не определена";
    }
  }

  function setupIntro() {
    const intro = document.getElementById("intro");
    const openButton = document.getElementById("openInvitation");

    if (!intro) {
      revealSite();
      return;
    }

    if (openButton) {
      openButton.addEventListener("click", revealSite, { once: true });
    }

    const configuredDuration = Number(config.introDurationMs);
    const duration = Number.isFinite(configuredDuration) && configuredDuration >= 0
      ? configuredDuration
      : 9000;

    window.setTimeout(revealSite, duration);
  }

  function revealSite() {
    if (siteWasRevealed) return;
    siteWasRevealed = true;

    const intro = document.getElementById("intro");
    const site = document.getElementById("site");

    document.body.classList.remove("intro-active");

    if (site) {
      site.classList.remove("hidden");
      window.requestAnimationFrame(() => {
        site.classList.add("revealed");
        setupReveal();
      });
    }

    if (intro) {
      intro.style.opacity = "0";
      intro.style.visibility = "hidden";
      window.setTimeout(() => intro.remove(), 850);
    }
  }

  function setupCountdown() {
    const isoDate = config.date && config.date.iso;
    const target = new Date(isoDate).getTime();
    const fields = {
      days: document.getElementById("days"),
      hours: document.getElementById("hours"),
      minutes: document.getElementById("minutes")
    };

    if (!Number.isFinite(target) || !fields.days || !fields.hours || !fields.minutes) {
      console.warn("Countdown configuration is incomplete");
      return;
    }

    const update = () => {
      const difference = Math.max(0, target - Date.now());
      fields.days.textContent = String(Math.floor(difference / 86400000));
      fields.hours.textContent = String(Math.floor(difference / 3600000) % 24).padStart(2, "0");
      fields.minutes.textContent = String(Math.floor(difference / 60000) % 60).padStart(2, "0");
    };

    update();
    window.setInterval(update, 60000);
  }

  function setupCalendar() {
    const button = document.getElementById("calendarBtn");
    if (!button) return;

    button.addEventListener("click", () => {
      const start = new Date(
        (config.calendar && config.calendar.startIso) ||
        (config.date && config.date.iso)
      );
      const configuredEnd = config.calendar && config.calendar.endIso;
      const end = configuredEnd
        ? new Date(configuredEnd)
        : new Date(start.getTime() + 11 * 60 * 60 * 1000);

      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        console.error("Calendar dates are invalid");
        return;
      }

      const title = (config.calendar && config.calendar.title) || "Свадьба Дмитрия и Софьи";
      const description = (config.calendar && config.calendar.description) ||
        "Роспись в 11:20. Венчание в 13:00. Сбор гостей и welcome в 15:00.";
      const location = (config.venue && config.venue.name) || "Москва";

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "PRODID:-//Dmitrii and Sofia Wedding//RU",
        "BEGIN:VEVENT",
        "UID:wedding-dmitrii-sofya-20260918@dmitrii-sofia-wedding.ru",
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `LOCATION:${escapeIcsText(location)}`,
        "END:VEVENT",
        "END:VCALENDAR"
      ].join("\r\n");

      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "svadba-dmitriya-i-sofi.ics";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    });
  }

  function setupForm(invitation, slug) {
    const form = document.getElementById("rsvpForm");
    const status = document.getElementById("formStatus");
    if (!form || !status) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const contactInput = form.elements.namedItem("contact");
    const commentInput = form.elements.namedItem("comment");
    const consentInput = form.elements.namedItem("consent");

    if (!invitation.valid || !slug || !apiBase) {
      setFormDisabled(form, true);
      status.textContent = invitation.error || "Для отправки ответа нужна персональная ссылка.";
      status.classList.add("form-status--error");
      return;
    }

    const storageKey = `wedding-rsvp:${slug}`;
    restoreLocalAnswer(form, storageKey, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const attendance = form.querySelector('input[name="attendance"]:checked');
      if (!attendance) {
        status.textContent = "Выберите вариант присутствия.";
        status.classList.add("form-status--error");
        return;
      }

      const payload = {
        slug,
        attendanceStatus: attendance.value,
        contact: String((contactInput && contactInput.value) || "").trim(),
        comment: String((commentInput && commentInput.value) || "").trim(),
        consent: Boolean(consentInput && consentInput.checked)
      };

      status.classList.remove("form-status--error", "form-status--success");
      status.textContent = "Сохраняем ответ…";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
      }

      try {
        await requestJson("/api/rsvp", {
          method: "POST",
          body: payload,
          credentials: "omit",
          timeoutMs: 12000
        });

        saveLocalAnswer(storageKey, {
          ...payload,
          guests: invitation.guests,
          submittedAt: new Date().toISOString()
        });

        status.textContent = "Спасибо! Ваш ответ сохранён. До встречи на нашем празднике!";
        status.classList.add("form-status--success");
      } catch (error) {
        console.error("RSVP submission failed", error);
        status.textContent = error.message || "Не удалось сохранить ответ. Попробуйте ещё раз.";
        status.classList.add("form-status--error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute("aria-busy");
        }
      }
    });
  }

  function restoreLocalAnswer(form, storageKey, status) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const data = JSON.parse(raw);
      const radio = Array.from(form.querySelectorAll('input[name="attendance"]'))
        .find((item) => item.value === data.attendanceStatus);
      if (radio) radio.checked = true;

      const contact = form.elements.namedItem("contact");
      const comment = form.elements.namedItem("comment");
      const consent = form.elements.namedItem("consent");

      if (contact) contact.value = data.contact || "";
      if (comment) comment.value = data.comment || "";
      if (consent) consent.checked = Boolean(data.consent);

      status.textContent = "Ранее сохранённый ответ можно изменить и отправить повторно.";
    } catch (error) {
      console.warn("Local RSVP restore failed", error);
    }
  }

  function saveLocalAnswer(storageKey, data) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn("Local RSVP backup failed", error);
    }
  }

  function setFormDisabled(form, disabled) {
    form.querySelectorAll("input, textarea, button").forEach((control) => {
      if (control.id !== "guestNames") control.disabled = disabled;
    });
  }

  function showFormMessage(message, isError) {
    const status = document.getElementById("formStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("form-status--error", Boolean(isError));
  }

  function setupReveal() {
    if (revealObserver) return;

    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -5% 0px"
    });

    elements.forEach((element) => revealObserver.observe(element));
  }

  async function requestJson(path, options) {
    const requestOptions = options || {};
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      Number(requestOptions.timeoutMs) || 10000
    );
    const headers = new Headers(requestOptions.headers || {});
    let body = requestOptions.body;

    if (body !== undefined && body !== null && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${apiBase}${path}`, {
        method: requestOptions.method || "GET",
        headers,
        body,
        credentials: requestOptions.credentials || "omit",
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
        throw new ApiError(
          data.error || data.message || `Ошибка сервера: ${response.status}`,
          response.status,
          data
        );
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Сервер не ответил вовремя. Попробуйте ещё раз.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function neutralGreeting(guests) {
    if (!guests.length) return "Дорогие гости!";
    if (guests.length === 1) return `${guests[0]}, мы будем счастливы видеть вас!`;
    return `${guests.slice(0, -1).join(", ")} и ${guests[guests.length - 1]}, мы будем счастливы видеть вас!`;
  }

  function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function normalizeSlug(value) {
    const slug = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{8,160}$/.test(slug) ? slug : "";
  }

  function formatIcsDate(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function escapeIcsText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }
})();
