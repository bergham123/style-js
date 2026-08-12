// ================================================================
// script.js (ارفع هذا الملف إلى GitHub)
// تم تحديثه: حذف Telegram verification، تسجيل فوري
// ================================================================

(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0'),
    iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const startWeek = d => addDays(d, -((d.getDay() + 6) % 7));
  const sameDay = (a, b) => iso(a) === iso(b),
    esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const colors = {
    work: ['#8b5cf6', '#ede9fe', '#5b21b6'],
    personal: ['#06b6d4', '#cffafe', '#155e75'],
    health: ['#10b981', '#d1fae5', '#065f46'],
    birthdays: ['#f59e0b', '#fef3c7', '#92400e'],
    study: ['#3b82f6', '#dbeafe', '#1e40af']
  };

  let currentUser = localStorage.getItem('chrona_user') || null;
  let userProfile = JSON.parse(localStorage.getItem('chrona_profile') || '{}');
  let isAdmin = false;
  const API_BASE = window.location.origin;

  let state = {
    view: localStorage.getItem('chrona-view') || 'month',
    cursor: localStorage.getItem('chrona-cursor') || iso(new Date()),
    theme: localStorage.getItem('chrona-theme') || 'dark',
    visible: JSON.parse(localStorage.getItem('chrona-visible') || '{"work":true,"personal":true,"health":true,"birthdays":true,"study":true}'),
    events: []
  };

  const saveUIState = () => {
    localStorage.setItem('chrona-view', state.view);
    localStorage.setItem('chrona-cursor', state.cursor);
    localStorage.setItem('chrona-theme', state.theme);
    localStorage.setItem('chrona-visible', JSON.stringify(state.visible));
  };

  const fmt = (d, opt) => new Intl.DateTimeFormat('en-US', opt).format(d);
  const shownEvents = () => state.events.filter(e => state.visible[e.calendar] !== false);

  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser) headers['X-Username'] = currentUser;
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(API_BASE + endpoint, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function migrateLocalEvent(e) {
    if (e.start && !e.time) return e;
    return {
      id: e.id || uid(),
      title: e.title,
      date: e.date,
      start: e.time || e.start || "09:00",
      end: e.endTime || e.end || "10:00",
      calendar: e.calendar || e.type || "work",
      location: e.location || "",
      notes: e.notes || "",
      guests: e.guests || "",
      recurrence: e.recurrence || "none",
      description: e.description || "",
      alert: e.alert || "now",
      notifyVia: e.notifyVia || [],
      color: e.color || null,
      type: e.type || e.calendar || "work",
      status: e.status || "pending",
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    };
  }

  async function loadEvents() {
    try {
      const data = await apiCall('/events');
      state.events = (data.events || []).map(migrateLocalEvent);
    } catch (err) {
      toast('Failed to load events');
      if (err.message.includes('401') || err.message.includes('not found')) logout();
    }
  }

  function init() {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    bind();
    new MutationObserver(() => {
      const f = $('#eventForm');
      if (f && !f.dataset.shareEnhanced) {
        f.dataset.shareEnhanced = '1';
        enhanceEventModal(state.events.find(x => x.id === f.querySelector('[name=title]')?.dataset?.eventId) || {});
      }
    }).observe($('#modalRoot'), { childList: true, subtree: true });
    if (currentUser) showApp();
    else renderAuth();
    scheduleNotifications();
  }

  async function showApp() {
    $('#authRoot').classList.add('hidden');
    $('#appRoot').classList.remove('hidden');
    $('#avatarText').textContent = currentUser.slice(0, 2).toUpperCase();
    await loadEvents();
    try {
      await apiCall('/admin/users');
      isAdmin = true;
      $('#adminBtn').classList.remove('hidden');
    } catch {
      isAdmin = false;
      $('#adminBtn').classList.add('hidden');
    }
    render();
  }

  function bind() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const a = b.dataset.action;
      if (a === 'new-event') openEvent({
        date: b.dataset.date || state.cursor,
        start: b.dataset.time || '09:00',
        end: '10:00',
        calendar: 'work'
      });
      if (a === 'today') {
        state.cursor = iso(new Date());
        render();
      }
      if (a === 'prev' || a === 'next') navigate(a === 'next' ? 1 : -1);
      if (a === 'sidebar') $('#sidebar').classList.toggle('-translate-x-full');
      if (a === 'view') {
        state.view = b.dataset.view;
        render();
      }
      if (a === 'toggle-cal') {
        state.visible[b.dataset.cal] = !state.visible[b.dataset.cal];
        render();
      }
      if (a === 'day') {
        state.cursor = b.dataset.date;
        state.view = 'day';
        render();
      }
      if (a === 'event') {
        const ev = state.events.find(x => x.id === b.dataset.id);
        if (ev) openEvent(ev);
      }
      if (a === 'search') {
        const q = prompt('Search events');
        if (q) {
          const results = state.events.filter(e => e.title.toLowerCase().includes(q.toLowerCase()) || e.notes.toLowerCase().includes(q.toLowerCase()));
          renderSearchResults(q, results);
        }
      }
      if (a === 'theme') {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        render();
        saveUIState();
        document.documentElement.classList.toggle('dark');
      }
      if (a === 'more') openMoreMenu();
      if (a === 'admin') openAdminPanel();
    });
  }

  function navigate(dir) {
    let d = parseDate(state.cursor);
    if (state.view === 'month') d.setMonth(d.getMonth() + dir);
    else if (state.view === 'week') d = addDays(d, dir * 7);
    else d = addDays(d, dir);
    state.cursor = iso(d);
    render();
  }

  function render() {
    saveUIState();
    const d = parseDate(state.cursor);
    $('#themeIcon').textContent = state.theme === 'dark' ? '☀' : '☾';
    $('#periodTitle').textContent = state.view === 'month' ? fmt(d, {
      month: 'long',
      year: 'numeric'
    }) : state.view === 'week' ? `${fmt(startWeek(d), {
      month: 'short',
      day: 'numeric'
    })} – ${fmt(addDays(startWeek(d), 6), { month: 'short', day: 'numeric', year: 'numeric' })}` : fmt(d, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    renderSwitchers();
    renderMini();
    renderCalendars();
    renderView();
    updateInsight();
  }

  function renderSwitchers() {
    const html = ['month', 'week', 'day', 'agenda'].map(v => `<button class="view-btn ${state.view === v ? 'active' : ''}" data-action="view" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
    $('#viewSwitcher').innerHTML = html;
    $('#mobileViewSwitcher').innerHTML = html;
  }

  function renderMini() {
    const d = parseDate(state.cursor),
      first = new Date(d.getFullYear(), d.getMonth(), 1),
      start = addDays(first, -((first.getDay() + 6) % 7));
    let days = '';
    for (let i = 0; i < 42; i++) {
      const x = addDays(start, i);
      days += `<button data-action="day" data-date="${iso(x)}" class="mini-day ${sameDay(x, new Date()) ? 'is-today' : ''} ${iso(x) === state.cursor ? 'is-selected' : ''} ${x.getMonth() !== d.getMonth() ? 'opacity-30' : ''}">${x.getDate()}</button>`;
    }
    $('#miniCalendar').innerHTML = `<div class="mb-3 flex items-center justify-between"><span class="font-display text-sm font-bold">${fmt(d, { month: 'long', year: 'numeric' })}</span><div><button class="icon-btn !h-7 !min-w-7" data-action="prev">‹</button><button class="icon-btn !h-7 !min-w-7" data-action="next">›</button></div></div><div class="mini-grid mb-1 text-[9px] font-bold text-slate-400">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div>${x}</div>`).join('')}</div><div class="mini-grid">${days}</div>`;
  }

  function renderCalendars() {
    $('#calendarList').innerHTML = '<p class="mb-3 px-3 text-[11px] font-bold uppercase tracking-[.18em] text-slate-400">My calendars</p>' + Object.entries(colors).map(([k, c]) => `<button class="cal-toggle ${state.visible[k] ? '' : 'off'}" data-action="toggle-cal" data-cal="${k}"><span class="dot" style="background:${c[0]}"></span><span class="flex-1 text-left capitalize">${k}</span><span>${state.visible[k] ? '✓' : '○'}</span></button>`).join('');
  }

  function renderView() {
    if (state.view === 'month') renderMonth();
    else if (state.view === 'week' || state.view === 'day') renderTimeGrid();
    else renderAgenda();
  }

  function chip(e, i = 0) {
    const c = e.color ? [e.color, e.color + '22', e.color] : (colors[e.calendar] || colors.work);
    return `<button data-action="event" data-id="${e.id}" class="event-chip" style="background:${c[1]};color:${c[2]};animation-delay:${i * 25}ms"><span class="mr-1 opacity-60">${e.start}</span>${esc(e.title)}</button>`;
  }

  function renderMonth() {
    const d = parseDate(state.cursor),
      first = new Date(d.getFullYear(), d.getMonth(), 1),
      start = addDays(first, -((first.getDay() + 6) % 7)),
      events = shownEvents();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const x = addDays(start, i),
        dayEvents = events.filter(e => e.date === iso(x)).sort((a, b) => a.start.localeCompare(b.start));
      cells += `<div class="month-cell ${x.getMonth() !== d.getMonth() ? 'outside' : ''} ${sameDay(x, new Date()) ? 'today' : ''}" data-action="new-event" data-date="${iso(x)}"><button class="day-num" data-action="day" data-date="${iso(x)}">${x.getDate()}</button>${dayEvents.slice(0, 3).map(chip).join('')}${dayEvents.length > 3 ? `<button class="more-chip" data-action="day" data-date="${iso(x)}">+${dayEvents.length - 3} more</button>` : ''}</div>`;
    }
    $('#calendarView').innerHTML = `<div class="month-head">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(x => `<div>${x}</div>`).join('')}</div><div class="month-grid">${cells}</div>`;
  }

  function renderTimeGrid() {
    const base = parseDate(state.cursor),
      days = state.view === 'day' ? [base] : Array.from({ length: 7 }, (_, i) => addDays(startWeek(base), i)),
      hours = Array.from({ length: 24 }, (_, i) => i);
    let head = '<div></div>' + days.map(d => `<div class="week-day-head ${sameDay(d, new Date()) ? 'text-violet-500' : ''}"><div class="text-[10px] uppercase text-slate-400">${fmt(d, { weekday: 'short' })}</div><button data-action="day" data-date="${iso(d)}" class="font-display mt-1 text-lg font-bold">${d.getDate()}</button></div>`).join('');
    let rows = '';
    for (const h of hours) {
      const hpad = pad(h);
      let cells = `<div class="hour-label">${hpad}:00</div>`;
      for (const d of days) {
        const dayEvents = shownEvents().filter(e => e.date === iso(d) && e.start.startsWith(hpad)).sort((a, b) => a.start.localeCompare(b.start));
        let html = '<div class="hour-slot" data-action="new-event" data-date="' + iso(d) + '" data-time="' + hpad + ':00"></div>';
        for (const e of dayEvents) {
          const c = e.color ? [e.color, e.color + '22', e.color] : (colors[e.calendar] || colors.work);
          html += `<button class="week-event" style="background:${c[1]};color:${c[2]};top:${(parseInt(e.start.split(':')[1]) / 60) * 100}%" data-action="event" data-id="${e.id}">${esc(e.title)}</button>`;
        }
        cells += html;
      }
      rows += '<div class="week-grid">' + cells + '</div>';
    }
    $('#calendarView').innerHTML = `<div class="week-wrap"><div class="week-grid">${head}</div>${rows}</div>`;
  }

  function renderAgenda() {
    const events = shownEvents().sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    let html = '<div class="agenda">';
    let lastDate = null;
    for (const e of events) {
      if (e.date !== lastDate) {
        lastDate = e.date;
        const d = parseDate(e.date);
        html += `<div class="agenda-date">${fmt(d, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</div>`;
      }
      const c = e.color ? [e.color, e.color + '22', e.color] : (colors[e.calendar] || colors.work);
      html += `<div class="agenda-card" style="border-color:${c[0]}" data-action="event" data-id="${e.id}"><div style="width:6px;height:6px;border-radius:50%;background:${c[0]}"></div><div class="flex-1"><div class="font-bold text-sm">${esc(e.title)}</div><div class="text-xs text-slate-500 dark:text-slate-400">${e.start}${e.location ? ' · ' + esc(e.location) : ''}</div></div></div>`;
    }
    html += '</div>';
    $('#calendarView').innerHTML = html || '<div class="empty-state">No events this period</div>';
  }

  function openEvent(event = {}) {
    const isNew = !event.id;
    const eventId = event.id || uid();
    const html = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card"><h2 class="font-display text-lg font-bold mb-6">${isNew ? '➕ New Event' : '✎ Edit Event'}</h2><form id="eventForm"><div class="space-y-4"><div><label class="field-label">Title</label><input class="field" name="title" required placeholder="Event title" value="${esc(event.title || '')}" data-event-id="${eventId}"></div><div><label class="field-label">Date</label><input class="field" name="date" type="date" required value="${event.date || iso(new Date())}"></div><div class="grid grid-cols-2 gap-4"><div><label class="field-label">Start Time</label><input class="field" name="start" type="time" required value="${event.start || '09:00'}"></div><div><label class="field-label">End Time</label><input class="field" name="end" type="time" required value="${event.end || '10:00'}"></div></div><div><label class="field-label">Calendar</label><select class="field" name="calendar" required><option value="work" ${event.calendar === 'work' ? 'selected' : ''}>Work</option><option value="personal" ${event.calendar === 'personal' ? 'selected' : ''}>Personal</option><option value="health" ${event.calendar === 'health' ? 'selected' : ''}>Health</option><option value="birthdays" ${event.calendar === 'birthdays' ? 'selected' : ''}>Birthdays</option><option value="study" ${event.calendar === 'study' ? 'selected' : ''}>Study</option></select></div><div><label class="field-label">Description</label><textarea class="field" name="description" placeholder="Notes" rows="2">${esc(event.description || '')}</textarea></div><div><label class="field-label">Location</label><input class="field" name="location" placeholder="Where?" value="${esc(event.location || '')}"></div><div><label class="field-label">Alert</label><select class="field" name="alert"><option value="now" ${event.alert === 'now' ? 'selected' : ''}>Now</option><option value="10min" ${event.alert === '10min' ? 'selected' : ''}>10 min before</option><option value="1hour" ${event.alert === '1hour' ? 'selected' : ''}>1 hour before</option><option value="1day" ${event.alert === '1day' ? 'selected' : ''}>1 day before</option></select></div></div><div class="flex gap-3 mt-6"><button type="submit" class="primary flex-1">${isNew ? 'Create' : 'Update'}</button><button type="button" class="secondary flex-1" onclick="closeModal()">Cancel</button>${!isNew ? `<button type="button" class="secondary flex-1 danger" onclick="deleteEvent('${eventId}')">Delete</button>` : ''}</div></form></div></div>`;
    $('#modalRoot').innerHTML = html;
    $('#eventForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        if (isNew) {
          await apiCall('/events', 'POST', { ...fd, id: eventId });
        } else {
          await apiCall(`/events/${eventId}`, 'PUT', fd);
        }
        await loadEvents();
        closeModal();
        render();
        toast(isNew ? '✨ Event created' : '✓ Event updated');
      } catch (err) {
        toast('Error: ' + err.message);
      }
    };
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    try {
      await apiCall(`/events/${id}`, 'DELETE');
      await loadEvents();
      closeModal();
      render();
      toast('Event deleted');
    } catch (err) {
      toast('Error: ' + err.message);
    }
  }

  function openMoreMenu() {
    const html = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card"><h2 class="font-display text-lg font-bold mb-4">Tools & Settings</h2><div class="space-y-2"><button class="secondary w-full text-left" id="exportBtn">📥 Export Events</button><button class="secondary w-full text-left" id="importBtn">📤 Import Events</button><button class="secondary w-full text-left" id="notifyBtn">🔔 Enable Notifications</button><button class="secondary w-full text-left" id="profileBtn">👤 Account Settings</button><button class="secondary w-full text-left danger" onclick="closeModal();logout()">↗ Sign Out</button></div></div></div>`;
    $('#modalRoot').innerHTML = html;
    $('#exportBtn').onclick = () => {
      const data = JSON.stringify({ events: state.events }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chrona-export-${iso(new Date())}.json`;
      a.click();
      toast('Events exported');
    };
    $('#importBtn').onclick = () => $('#importFile').click();
    $('#notifyBtn').onclick = () => requestNotify();
    $('#profileBtn').onclick = () => openAccountModal();
  }

  function openAccountModal() {
    const html = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card"><h2 class="font-display text-lg font-bold mb-6">Account Settings</h2><form id="profileForm"><div class="space-y-4"><div><label class="field-label">Email</label><input class="field" name="email" type="email" value="${esc(userProfile.email || '')}"></div><div><label class="field-label">Phone</label><input class="field" name="phone" placeholder="+123456789" value="${esc(userProfile.phone || '')}"></div><div><label class="field-label">Telegram ID</label><div class="flex gap-2"><input class="field flex-1" name="telegramId" placeholder="123456789" value="${esc(userProfile.telegramId || '')}" pattern="[0-9]*"><button type="button" class="secondary px-3" id="testTelegramBtn">Test</button></div><small class="text-slate-500 dark:text-slate-400">Get your ID from @ChronautBot</small></div></div><div class="border-t border-slate-200 dark:border-white/10 pt-6 mt-6"><h3 class="font-bold text-sm mb-4">Change Password</h3><div class="space-y-4"><div><label class="field-label">Current Password</label><input class="field" id="currentPwd" type="password" placeholder="Current password" required></div><div><label class="field-label">New Password</label><input class="field" id="newPwd" type="password" placeholder="New password" minlength="8" required></div></div><button type="button" class="secondary w-full mt-4" id="changePwdBtn">Update Password</button></div><div class="flex gap-3 mt-6"><button type="submit" class="primary flex-1">Save Profile</button><button type="button" class="secondary flex-1" onclick="closeModal()">Cancel</button></div></form></div></div>`;
    $('#modalRoot').innerHTML = html;
    $('#profileForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await apiCall('/user/profile', 'PUT', {
          email: fd.email,
          phone: fd.phone,
          telegramId: fd.telegramId
        });
        userProfile = { email: fd.email, phone: fd.phone, telegramId: fd.telegramId };
        localStorage.setItem('chrona_profile', JSON.stringify(userProfile));
        toast('Profile updated');
        closeModal();
      } catch (err) {
        toast('Error: ' + err.message);
      }
    };
    $('#testTelegramBtn').onclick = async () => {
      const telegramId = $('input[name=telegramId]').value;
      if (!telegramId) { toast('Enter Telegram ID first'); return; }
      try {
        const res = await fetch(API_BASE + '/user/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Username': currentUser },
          body: JSON.stringify({ telegramId })
        });
        if (res.ok) toast('✅ Test message sent!');
        else toast('❌ Test failed');
      } catch { toast('Error: ' + err.message); }
    };
    $('#changePwdBtn').onclick = async () => {
      const current = $('#currentPwd').value;
      const newPwd = $('#newPwd').value;
      if (!current || !newPwd) { toast('Fill in both passwords'); return; }
      try {
        await apiCall('/user/password', 'PUT', { currentPassword: current, newPassword: newPwd });
        toast('Password updated successfully');
        $('#currentPwd').value = '';
        $('#newPwd').value = '';
      } catch (err) {
        toast('Error: ' + err.message);
      }
    };
  }

  function openAdminPanel() {
    const html = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card"><h2 class="font-display text-lg font-bold mb-4">👑 Admin Panel</h2><div id="adminContent" class="space-y-3"></div></div></div>`;
    $('#modalRoot').innerHTML = html;
    (async () => {
      try {
        const users = await apiCall('/admin/users');
        let content = '<h3 class="font-bold text-sm mb-2">Users</h3>';
        for (const u of users) {
          content += `<div class="border border-slate-200 dark:border-white/10 rounded-lg p-3 text-sm"><div class="font-bold">${esc(u.username)}</div><div class="text-xs text-slate-500 dark:text-slate-400">${esc(u.email)} • ${u.isAdmin ? '👑 Admin' : '👤 User'}</div><button class="secondary text-xs mt-2 w-full" onclick="adminToggleAdmin('${esc(u.username)}',${!u.isAdmin})">${u.isAdmin ? 'Remove Admin' : 'Make Admin'}</button></div>`;
        }
        $('#adminContent').innerHTML = content;
      } catch (err) {
        toast('Failed to load admin panel');
      }
    })();
  }

  window.adminToggleAdmin = async (username, isAdmin) => {
    try {
      await apiCall(`/admin/users/${username}/admin`, 'PUT', { isAdmin });
      toast(isAdmin ? 'User is now admin' : 'Admin status removed');
      openAdminPanel();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  };

  function renderSearchResults(q, results) {
    const html = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal-card"><h2 class="font-display text-lg font-bold mb-4">Search results for "${esc(q)}"</h2><div class="space-y-2">${results.length > 0 ? results.map(e => `<div class="search-item cursor-pointer" data-action="event" data-id="${e.id}"><div><div class="font-bold text-sm">${esc(e.title)}</div><div class="text-xs text-slate-500 dark:text-slate-400">${e.date} at ${e.start}</div></div></div>`).join('') : '<div class="text-slate-500">No events found</div>'}</div></div></div>`;
    $('#modalRoot').innerHTML = html;
    $$('[data-action="event"]').forEach(el => {
      el.onclick = () => {
        const ev = state.events.find(x => x.id === el.dataset.id);
        if (ev) { closeModal(); openEvent(ev); }
      };
    });
  }

  $('#importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (f.name.endsWith('.json')) {
        const d = JSON.parse(text);
        if (!Array.isArray(d.events)) throw Error();
        for (const ev of d.events) {
          await apiCall('/events', 'POST', { ...ev, id: uid() });
        }
      } else {
        const blocks = text.split('BEGIN:VEVENT').slice(1);
        for (const b of blocks) {
          const get = k => (b.match(new RegExp(`${k}:(.*)`)) || [])[1]?.trim() || '';
          const ds = get('DTSTART');
          await apiCall('/events', 'POST', {
            title: get('SUMMARY') || 'Imported',
            date: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`,
            start: `${ds.slice(9, 11) || '09'}:${ds.slice(11, 13) || '00'}`,
            end: '10:00',
            calendar: 'work',
            location: get('LOCATION'),
            notes: get('DESCRIPTION')
          });
        }
      }
      await loadEvents();
      closeModal();
      render();
      toast('Events imported');
    } catch {
      toast('Could not import file');
    }
    e.target.value = '';
  };

  async function requestNotify() {
    if (!('Notification' in window)) return toast('Notifications not supported');
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notifications enabled' : 'Permission denied');
  }

  function scheduleNotifications() {
    setInterval(() => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      state.events.forEach(e => {
        const dt = new Date(`${e.date}T${e.start}`);
        const diff = dt - now;
        if (diff > 0 && diff < 60000 && !sessionStorage.getItem('notified-' + e.id)) {
          new Notification(e.title, {
            body: `Starts now${e.location ? ' · ' + e.location : ''}`
          });
          sessionStorage.setItem('notified-' + e.id, '1');
        }
      });
    }, 30000);
  }

  function updateInsight() {
    const w = startWeek(new Date()),
      count = state.events.filter(e => {
        const d = parseDate(e.date);
        return d >= w && d <= addDays(w, 6);
      }).length;
    $('#focusInsight').textContent = count > 8 ? `${count} events this week. Protect a focus block.` : count > 3 ? `${count} events this week — comfortably balanced.` : 'A spacious week. Perfect for focused progress.';
  }

  /**
   * تم التحديث: حذف renderAuthVerify() تماماً
   * الآن التسجيل فوري - بدون خطوة تحقق
   */
  function renderAuth(mode = 'login') {
    $('#appRoot').classList.add('hidden');
    $('#authRoot').classList.remove('hidden');
    $('#authRoot').innerHTML = `<div class="auth-screen"><div class="orb orb-a"></div><div class="orb orb-b"></div><form id="authForm" class="auth-card"><div class="flex items-center gap-3"><span class="logo-mark">C</span><div><p class="font-display text-xl font-bold">Welcome to Chrona</p><p class="text-xs text-slate-400">Your private planning space</p></div></div><div class="auth-tabs" id="authTabs"><button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Log in</button><button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">Sign up</button><button type="button" class="auth-tab ${mode === 'reset' ? 'active' : ''}" data-mode="reset">Reset</button></div><div id="authFields" class="space-y-4 mt-4">${mode === 'signup' ? `<div><label class="field-label">Username</label><input class="field" name="username" required placeholder="3+ characters"></div><div><label class="field-label">Email</label><input class="field" name="email" type="email" required placeholder="you@example.com"></div>` : ''}${mode === 'reset' ? `<div><label class="field-label">Email</label><input class="field" name="email" type="email" required placeholder="your@email.com"></div>` : (mode === 'login' ? `<div><label class="field-label">Username or Email</label><input class="field" name="username" required placeholder="Enter username or email"></div>` : '')}<div><label class="field-label">Password</label><input class="field" name="password" type="password" required minlength="${mode === 'reset' ? '0' : '8'}" placeholder="${mode === 'reset' ? '6+ characters' : '8+ characters'}"></div>${mode === 'signup' ? `<div><label class="field-label">Phone Number (Optional)</label><input class="field" name="phone" placeholder="+212612345678"></div><div><label class="field-label">🤖 Telegram ID (Optional)</label><div class="space-y-2"><div class="text-xs bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2 text-blue-900 dark:text-blue-200"><strong>How to get your Telegram ID:</strong><ol class="ml-3 mt-1 space-y-0.5"><li>1. Message <strong>@ChronautBot</strong></li><li>2. Type /start</li><li>3. Copy the ID number</li><li>4. Paste it below</li></ol></div><input class="field" name="telegramId" placeholder="123456789" pattern="[0-9]*" title="Numbers only"></div></div>` : ''}</div><div id="authError" class="text-red-500 text-sm mt-2 hidden"></div><button class="primary mt-6 w-full" type="submit">${mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create Account' : 'Send Reset Code'}</button><p class="mt-4 text-center text-[10px] leading-4 text-slate-500">${mode === 'signup' ? '✅ Account created instantly. Optional Telegram for notifications.' : mode === 'reset' ? 'Reset code sent to Telegram if linked.' : 'Secure authentication.'}</p></form></div>`;
    $$('#authTabs .auth-tab').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#authError');
      errEl.classList.add('hidden');
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        if (mode === 'login') {
          const data = await apiCall('/auth/login', 'POST', { username: fd.username, password: fd.password });
          if (data.success) {
            currentUser = data.username;
            userProfile = data.profile;
            localStorage.setItem('chrona_user', currentUser);
            localStorage.setItem('chrona_profile', JSON.stringify(userProfile));
            showApp();
          }
        } else if (mode === 'signup') {
          const res = await apiCall('/auth/register', 'POST', {
            username: fd.username,
            email: fd.email,
            password: fd.password,
            phone: fd.phone,
            telegramId: fd.telegramId
          });
          if (res.success) {
            toast('✅ Account created! Logging in...');
            // السجل الفوري بدون تحقق
            setTimeout(() => renderAuth('login'), 1500);
          }
        } else if (mode === 'reset') {
          const res = await apiCall('/auth/reset-request', 'POST', { email: fd.email });
          if (res.success) {
            toast('Reset code sent');
            renderPasswordReset(res.username || '');
          }
        }
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    };
  }

  /**
   * تم التحديث: دالة جديدة لإدخال كود إعادة تعيين كلمة السر
   */
  function renderPasswordReset(username = '') {
    $('#authRoot').innerHTML = `<div class="auth-screen"><div class="orb orb-a"></div><div class="orb orb-b"></div><form id="authForm" class="auth-card"><div class="flex items-center gap-3"><span class="logo-mark">C</span><div><p class="font-display text-xl font-bold">Reset Password</p><p class="text-xs text-slate-400">Enter the code sent to your Telegram</p></div></div><div class="space-y-4 mt-6"><div><label class="field-label">Username</label><input class="field" name="username" required placeholder="Username" value="${username}"></div><div><label class="field-label">Reset Code</label><input class="field" name="code" required placeholder="6-digit code"></div><div><label class="field-label">New Password</label><input class="field" name="newPassword" type="password" required minlength="8" placeholder="New password"></div></div><div id="authError" class="text-red-500 text-sm mt-2 hidden"></div><button class="primary mt-6 w-full" type="submit">Reset Password</button><button type="button" class="secondary mt-3 w-full" onclick="renderAuth('login')">Back to Login</button></form></div>`;
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#authError');
      errEl.classList.add('hidden');
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await apiCall('/auth/reset', 'POST', { username: fd.username, code: fd.code, newPassword: fd.newPassword });
        toast('✅ Password changed successfully');
        renderAuth('login');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    };
  }

  function shareReminder(event, channel) {
    const text = `Reminder: ${event.title} · ${fmt(parseDate(event.date), { weekday: 'long', month: 'short', day: 'numeric' })} at ${event.start}${event.location ? ' · ' + event.location : ''}${event.notes ? '\n' + event.notes : ''}`;
    const url = channel === 'whatsapp' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast(`${channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} reminder ready`);
  }

  function enhanceEventModal(event) {
    const form = $('#eventForm');
    if (!form) return;
    const box = document.createElement('div');
    box.className = 'mt-5 border-t border-slate-200 pt-5 dark:border-white/10';
    box.innerHTML = `<p class="field-label">Share reminder</p><div class="social-reminders flex gap-2"><button type="button" class="secondary" id="whatsappReminder">◉ WhatsApp</button><button type="button" class="secondary" id="telegramReminder">➤ Telegram</button></div>`;
    form.querySelector('.mt-6').before(box);
    $('#whatsappReminder').onclick = () => shareReminder(event, 'whatsapp');
    $('#telegramReminder').onclick = () => shareReminder(event, 'telegram');
  }

  function closeModal() {
    $('#modalRoot').innerHTML = '';
  }

  function logout() {
    currentUser = null;
    userProfile = {};
    localStorage.removeItem('chrona_user');
    localStorage.removeItem('chrona_profile');
    renderAuth();
  }

  function toast(msg, undo) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${esc(msg)}${undo ? ' <button class="ml-3 font-bold text-violet-300">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => {
      undo();
      t.remove();
    };
    $('#toastRoot').append(t);
    setTimeout(() => t.remove(), undo ? 6000 : 2800);
  }

  init();
})();
