(function () {
  const config = window.WEDDING_CONFIG || {};
  const intro = document.getElementById('intro');
  const site = document.getElementById('site');
  const scenes = Array.from(document.querySelectorAll('.intro-scene'));
  const progressBar = document.getElementById('progressBar');
  const skipIntroBtn = document.getElementById('skipIntro');

  const url = new URL(window.location.href);
  const inviteSlug = url.searchParams.get('invite');
  const guestString = url.searchParams.get('guests');
  const inviteData = resolveInvite(inviteSlug, guestString);

  personalize(inviteData);
  startCountdown();
  setupCalendar();
  setupForm(inviteData, inviteSlug || 'custom');
  setupScrollReveal();
  setupIntro();

  function resolveInvite(slug, guestsParam) {
    if (slug && config.invites && config.invites[slug]) {
      return config.invites[slug];
    }
    if (guestsParam) {
      const guests = guestsParam.split(',').map(v => v.trim()).filter(Boolean);
      return { greeting: formatNeutralGreeting(guests), guests };
    }
    return { greeting: 'Дорогие гости!', guests: ['Гость'] };
  }

  function personalize(data) {
    const greetingEl = document.getElementById('greeting');
    const namesField = document.getElementById('guestNames');
    if (greetingEl) greetingEl.textContent = data.greeting || 'Дорогие гости!';
    if (namesField) namesField.value = (data.guests || []).join(', ');
  }

  function formatNeutralGreeting(guests) {
    if (!guests || !guests.length) return 'Дорогие гости!';
    if (guests.length === 1) return `${guests[0]}, мы будем счастливы видеть вас!`;
    const last = guests[guests.length - 1];
    return `${guests.slice(0, -1).join(', ')} и ${last}, мы будем счастливы видеть вас!`;
  }

  function startCountdown() {
    const target = new Date(config.date.iso).getTime();
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');

    function update() {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        daysEl.textContent = '0';
        hoursEl.textContent = '0';
        minutesEl.textContent = '0';
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      daysEl.textContent = String(days);
      hoursEl.textContent = String(hours);
      minutesEl.textContent = String(minutes);
    }
    update();
    setInterval(update, 60000);
  }

  function setupCalendar() {
    const btn = document.getElementById('calendarBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Wedding Invitation//RU',
        'BEGIN:VEVENT',
        'UID:wedding-dmitriy-sofya-20260918@example.com',
        'DTSTAMP:20250101T000000Z',
        'DTSTART:20260918T082000Z',
        'DTEND:20260918T190000Z',
        'SUMMARY:Свадьба Дмитрия и Софьи',
        'DESCRIPTION:Роспись в 11:20. Венчание в 13:00. Сбор гостей и welcome в 15:00.',
        `LOCATION:${config.venue.name}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'svadba-dmitriya-i-sofi.ics';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  function setupForm(inviteData, slug) {
    const form = document.getElementById('rsvpForm');
    const status = document.getElementById('formStatus');
    if (!form) return;

    const storageKey = `wedding-rsvp:${slug}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.attendance) {
          const radio = form.querySelector(`input[name="attendance"][value="${cssEscape(data.attendance)}"]`);
          if (radio) radio.checked = true;
        }
        if (data.contact) form.contact.value = data.contact;
        if (data.comment) form.comment.value = data.comment;
        if (data.consent) form.consent.checked = true;
        status.textContent = 'Ранее вы уже отправляли ответ. При необходимости его можно обновить.';
      } catch (e) {}
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const attendance = form.querySelector('input[name="attendance"]:checked');
      if (!attendance) {
        status.textContent = 'Пожалуйста, выберите вариант присутствия.';
        return;
      }
      const payload = {
        inviteSlug: slug,
        guests: inviteData.guests,
        greeting: inviteData.greeting,
        attendance: attendance.value,
        contact: form.contact.value.trim(),
        comment: form.comment.value.trim(),
        consent: !!form.consent.checked,
        submittedAt: new Date().toISOString()
      };

      localStorage.setItem(storageKey, JSON.stringify(payload));
      addAdminIndex(slug, payload);
      status.textContent = 'Спасибо! Ваш ответ сохранён. До встречи на нашем празднике!';

      if (config.webhookUrl) {
        try {
          await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (err) {
          console.warn('Webhook unavailable', err);
        }
      }
    });
  }

  function addAdminIndex(slug, payload) {
    const indexKey = 'wedding-rsvp:index';
    const existing = JSON.parse(localStorage.getItem(indexKey) || '[]');
    const filtered = existing.filter(item => item.inviteSlug !== slug);
    filtered.push({ inviteSlug: slug, submittedAt: payload.submittedAt });
    localStorage.setItem(indexKey, JSON.stringify(filtered));
  }

  function setupScrollReveal() {
    const elements = Array.from(document.querySelectorAll('.reveal'));
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    elements.forEach(el => observer.observe(el));
  }

  function setupIntro() {
    if (!intro || !site || !scenes.length) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previewMode = url.searchParams.get('preview') === '1';
    if (reduceMotion || previewMode) {
      endIntro();
      return;
    }

    let current = 0;
    let ended = false;
    let timer = null;
    let elapsedTotal = 0;
    const totalDuration = scenes.reduce((sum, scene) => sum + Number(scene.dataset.duration || 2500), 0);

    if (skipIntroBtn) skipIntroBtn.addEventListener('click', endIntro);

    function playScene(index) {
      if (ended) return;
      scenes.forEach((scene, i) => scene.classList.toggle('active', i === index));
      const duration = Number(scenes[index].dataset.duration || 2500);
      progressBar.style.width = `${Math.min(100, (elapsedTotal / totalDuration) * 100)}%`;

      timer = setTimeout(() => {
        elapsedTotal += duration;
        progressBar.style.width = `${Math.min(100, (elapsedTotal / totalDuration) * 100)}%`;
        current += 1;
        if (current < scenes.length) {
          playScene(current);
        } else {
          timer = setTimeout(endIntro, 280);
        }
      }, duration);
    }

    playScene(current);

    function endIntro() {
      if (ended) return;
      ended = true;
      if (timer) clearTimeout(timer);
      intro.style.opacity = '0';
      intro.style.pointerEvents = 'none';
      site.classList.remove('hidden');
      requestAnimationFrame(() => site.classList.add('revealed'));
      document.body.classList.remove('intro-active');
      setTimeout(() => intro.remove(), 560);
    }
  }

  function cssEscape(value) {
    return String(value).replace(/(["\\])/g, '\\$1');
  }
})();
