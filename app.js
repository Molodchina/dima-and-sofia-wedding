(function () {
  const config = window.WEDDING_CONFIG || {};
  const url = new URL(window.location.href);
  const slug = url.searchParams.get("invite");
  const guestString = url.searchParams.get("guests");

  init().catch((error) => {
    console.error(error);
    revealSite();
  });

  async function init() {
    const invitation = await loadInvitation(slug, guestString);
    personalize(invitation);
    setupIntro();
    setupCountdown();
    setupCalendar();
    setupForm(invitation, slug || "custom");
    setupReveal();
  }

  async function loadInvitation(invitationSlug, guestsParam) {
    if (invitationSlug && config.apiBase) {
      try {
        const response = await fetch(`${config.apiBase}/api/invitation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: invitationSlug })
        });
        if (response.ok) return response.json();
      } catch (error) {
        console.warn("API invitation loading failed", error);
      }
    }
    if (invitationSlug && config.invites && config.invites[invitationSlug]) return config.invites[invitationSlug];
    if (guestsParam) {
      const guests = guestsParam.split(",").map((item) => item.trim()).filter(Boolean);
      return { greeting: neutralGreeting(guests), guests };
    }
    return { greeting: "Дорогие гости!", guests: ["Гость"] };
  }

  function neutralGreeting(guests) {
    if (!guests.length) return "Дорогие гости!";
    if (guests.length === 1) return `${guests[0]}, мы будем счастливы видеть вас!`;
    return `${guests.slice(0, -1).join(", ")} и ${guests.at(-1)}, мы будем счастливы видеть вас!`;
  }

  function personalize(invitation) {
    document.getElementById("greeting").textContent = invitation.greeting || "Дорогие гости!";
    document.getElementById("guestNames").value = (invitation.guests || []).join(", ");
  }

  function setupIntro() {
    const button = document.getElementById("openInvitation");
    button.addEventListener("click", revealSite);
    window.setTimeout(revealSite, 9000);
  }

  function revealSite() {
    const intro = document.getElementById("intro");
    const site = document.getElementById("site");
    if (!intro || intro.dataset.closed === "true") return;
    intro.dataset.closed = "true";
    site.classList.remove("hidden");
    requestAnimationFrame(() => site.classList.add("revealed"));
    document.body.classList.remove("intro-active");
    intro.style.opacity = "0";
    intro.style.visibility = "hidden";
    window.setTimeout(() => intro.remove(), 850);
  }

  function setupCountdown() {
    const target = new Date(config.date.iso).getTime();
    const fields = {
      days: document.getElementById("days"),
      hours: document.getElementById("hours"),
      minutes: document.getElementById("minutes")
    };
    const update = () => {
      const difference = Math.max(0, target - Date.now());
      fields.days.textContent = String(Math.floor(difference / 86400000));
      fields.hours.textContent = String(Math.floor(difference / 3600000) % 24);
      fields.minutes.textContent = String(Math.floor(difference / 60000) % 60);
    };
    update();
    window.setInterval(update, 60000);
  }

  function setupCalendar() {
    document.getElementById("calendarBtn").addEventListener("click", () => {
      const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding Invitation//RU", "BEGIN:VEVENT",
        "UID:wedding-dmitriy-sofya-20260918@dmitrii-sofia-wedding.ru", "DTSTAMP:20260730T000000Z",
        "DTSTART:20260918T082000Z", "DTEND:20260918T190000Z", "SUMMARY:Свадьба Дмитрия и Софьи",
        "DESCRIPTION:Роспись в 11:20. Венчание в 13:00. Сбор гостей и welcome в 15:00.",
        `LOCATION:${config.venue.name}`, "END:VEVENT", "END:VCALENDAR"
      ].join("\r\n");
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "svadba-dmitriya-i-sofi.ics";
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  function setupForm(invitation, invitationSlug) {
    const form = document.getElementById("rsvpForm");
    const status = document.getElementById("formStatus");
    const storageKey = `wedding-rsvp:${invitationSlug}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const radio = [...form.querySelectorAll('input[name="attendance"]')].find((item) => item.value === data.attendanceStatus);
        if (radio) radio.checked = true;
        form.contact.value = data.contact || "";
        form.comment.value = data.comment || "";
        form.consent.checked = Boolean(data.consent);
        status.textContent = "Ранее отправленный ответ можно изменить и сохранить повторно.";
      } catch (_) {}
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const attendance = form.querySelector('input[name="attendance"]:checked');
      if (!attendance) return;
      const payload = {
        slug: invitationSlug,
        guests: invitation.guests,
        attendanceStatus: attendance.value,
        contact: form.contact.value.trim(),
        comment: form.comment.value.trim(),
        consent: Boolean(form.consent.checked),
        submittedAt: new Date().toISOString()
      };
      status.textContent = "Сохраняем ответ…";
      try {
        if (config.apiBase && invitationSlug !== "custom") {
          const response = await fetch(`${config.apiBase}/api/rsvp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Не удалось сохранить ответ");
        }
        localStorage.setItem(storageKey, JSON.stringify(payload));
        updateLocalIndex(invitationSlug, payload);
        status.textContent = "Спасибо! Ваш ответ сохранён. До встречи на нашем празднике!";
      } catch (error) {
        status.textContent = error.message || "Не удалось сохранить ответ. Попробуйте ещё раз.";
      }
    });
  }

  function updateLocalIndex(invitationSlug, payload) {
    const key = "wedding-rsvp:index";
    const index = JSON.parse(localStorage.getItem(key) || "[]").filter((item) => item.inviteSlug !== invitationSlug);
    index.push({ inviteSlug: invitationSlug, submittedAt: payload.submittedAt });
    localStorage.setItem(key, JSON.stringify(index));
  }

  function setupReveal() {
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    elements.forEach((element) => observer.observe(element));
  }
})();
