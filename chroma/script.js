// ================================================================
// script.js (ارفع هذا الملف بالضبط إلى GitHub)
// ================================================================

(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const pad=n=>String(n).padStart(2,'0'), iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const startWeek=d=>addDays(d,-((d.getDay()+6)%7));
  const sameDay=(a,b)=>iso(a)===iso(b), esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  
  const colors={
    work:['#8b5cf6','#ede9fe','#5b21b6'],
    personal:['#06b6d4','#cffafe','#155e75'],
    health:['#10b981','#d1fae5','#065f46'],
    birthdays:['#f59e0b','#fef3c7','#92400e'],
    study:['#3b82f6','#dbeafe','#1e40af']
  };

  let currentUser = localStorage.getItem('chrona_user') || null;
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

  const fmt=(d,opt)=>new Intl.DateTimeFormat('en-US',opt).format(d);
  const shownEvents=()=>state.events.filter(e=>state.visible[e.calendar]!==false);
  
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
      id: e.id || uid(), title: e.title, date: e.date,
      start: e.time || e.start || "09:00", end: e.endTime || e.end || "10:00",
      calendar: e.calendar || e.type || "work", location: e.location || "",
      notes: e.notes || "", guests: e.guests || "", recurrence: e.recurrence || "none",
      description: e.description || "", alert: e.alert || "now", notifyVia: e.notifyVia || [],
      color: e.color || null, type: e.type || e.calendar || "work", status: e.status || "pending",
      createdAt: e.createdAt, updatedAt: e.updatedAt
    };
  }

  async function loadEvents() {
    try {
      const data = await apiCall('/events');
      state.events = (data.events || []).map(migrateLocalEvent);
    } catch (err) {
      toast('Failed to load events');
      if(err.message.includes('401') || err.message.includes('not found')) logout();
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
    
    if (currentUser) {
      showApp();
    } else {
      renderAuth();
    }
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
      if (a === 'new-event') openEvent({ date: b.dataset.date || state.cursor, start: b.dataset.time || '09:00', end: '10:00', calendar: 'work' });
      if (a === 'today') { state.cursor = iso(new Date()); render(); }
      if (a === 'prev' || a === 'next') navigate(a === 'next' ? 1 : -1);
      if (a === 'sidebar') $('#sidebar').classList.toggle('-translate-x-full');
      if (a === 'theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.classList.toggle('dark'); saveUIState(); render(); }
      if (a === 'view') { state.view = b.dataset.view; saveUIState(); render(); }
      if (a === 'event') openEvent(state.events.find(x => x.id === b.dataset.id));
      if (a === 'day') { state.cursor = b.dataset.date; state.view = 'day'; render(); }
      if (a === 'toggle-cal') { state.visible[b.dataset.cal] = !state.visible[b.dataset.cal]; saveUIState(); render(); }
      if (a === 'search') openSearch();
      if (a === 'more') openMore();
      if (a === 'admin') openAdmin();
    });
    $('#importFile').addEventListener('change', importFile);
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape') closeModal();
      if (!$('.modal-backdrop') && e.key.toLowerCase() === 'c') openEvent({ date: state.cursor, start: '09:00', end: '10:00', calendar: 'work' });
      if (!$('.modal-backdrop') && e.key.toLowerCase() === 't') { state.cursor = iso(new Date()); render(); }
      if (!$('.modal-backdrop') && e.key === 'ArrowLeft') navigate(-1);
      if (!$('.modal-backdrop') && e.key === 'ArrowRight') navigate(1);
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
    $('#periodTitle').textContent = state.view === 'month' ? fmt(d, { month: 'long', year: 'numeric' }) : state.view === 'week' ? `${fmt(startWeek(d), { month: 'short', day: 'numeric' })} – ${fmt(addDays(startWeek(d), 6), { month: 'short', day: 'numeric', year: 'numeric' })}` : fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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
    const d = parseDate(state.cursor), first = new Date(d.getFullYear(), d.getMonth(), 1), start = addDays(first, -((first.getDay() + 6) % 7));
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
    const d = parseDate(state.cursor), first = new Date(d.getFullYear(), d.getMonth(), 1), start = addDays(first, -((first.getDay() + 6) % 7)), events = shownEvents();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const x = addDays(start, i), dayEvents = events.filter(e => e.date === iso(x)).sort((a, b) => a.start.localeCompare(b.start));
      cells += `<div class="month-cell ${x.getMonth() !== d.getMonth() ? 'outside' : ''} ${sameDay(x, new Date()) ? 'today' : ''}" data-action="new-event" data-date="${iso(x)}"><button class="day-num" data-action="day" data-date="${iso(x)}">${x.getDate()}</button>${dayEvents.slice(0, 3).map(chip).join('')}${dayEvents.length > 3 ? `<button class="more-chip" data-action="day" data-date="${iso(x)}">+${dayEvents.length - 3} more</button>` : ''}</div>`;
    }
    $('#calendarView').innerHTML = `<div class="month-head">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(x => `<div>${x}</div>`).join('')}</div><div class="month-grid">${cells}</div>`;
  }

  function renderTimeGrid() {
    const base = parseDate(state.cursor), days = state.view === 'day' ? [base] : Array.from({ length: 7 }, (_, i) => addDays(startWeek(base), i)), hours = Array.from({ length: 24 }, (_, i) => i);
    let head = '<div></div>' + days.map(d => `<div class="week-day-head ${sameDay(d, new Date()) ? 'text-violet-500' : ''}"><div class="text-[10px] uppercase text-slate-400">${fmt(d, { weekday: 'short' })}</div><button data-action="day" data-date="${iso(d)}" class="font-display mt-1 text-lg font-bold">${d.getDate()}</button></div>`).join('');
    let rows = '';
    hours.forEach(h => {
      rows += `<div class="hour-label">${h === 0 ? '' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}</div>`;
      days.forEach(d => {
        const ev = shownEvents().filter(e => e.date === iso(d) && Number(e.start.slice(0, 2)) === h);
        rows += `<div class="hour-slot" data-action="new-event" data-date="${iso(d)}" data-time="${pad(h)}:00">${ev.map(e => {
          const c = e.color ? [e.color, e.color + '22', e.color] : colors[e.calendar];
          const mins = Number(e.start.slice(3));
          return `<button data-action="event" data-id="${e.id}" class="week-event" style="top:${mins / 60 * 64}px;background:${c[1]};color:${c[2]}">${esc(e.title)}<br><span class="font-normal opacity-70">${e.start}</span></button>`;
        }).join('')}</div>`;
      });
    });
    $('#calendarView').innerHTML = `<div class="week-wrap"><div class="week-grid" style="grid-template-columns:64px repeat(${days.length},minmax(${state.view === 'day' ? '500' : '110'}px,1fr))">${head}${rows}</div></div>`;
    setTimeout(() => { $('.week-wrap').scrollTop = 7 * 64; }, 0);
  }

  function renderAgenda() {
    const from = parseDate(state.cursor), events = shownEvents().filter(e => parseDate(e.date) >= addDays(from, -1)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 60);
    if (!events.length) {
      $('#calendarView').innerHTML = '<div class="empty-state"><div><div class="text-5xl">◌</div><h3 class="mt-3 font-display text-xl font-bold text-slate-600 dark:text-slate-300">Your horizon is clear</h3><p class="mt-1">Create an event to begin planning.</p></div></div>';
      return;
    }
    let last = '';
    $('#calendarView').innerHTML = '<div class="agenda">' + events.map(e => {
      const d = e.date !== last ? (last = e.date, `<div class="agenda-date">${fmt(parseDate(e.date), { weekday: 'long', month: 'long', day: 'numeric' })}</div>`) : '';
      const c = e.color ? [e.color, e.color + '22', e.color] : colors[e.calendar];
      return `${d}<button class="agenda-card w-full text-left" data-action="event" data-id="${e.id}"><span class="h-11 w-1 rounded-full" style="background:${c[0]}"></span><span class="w-20 text-xs font-bold text-slate-400">${e.start}</span><span class="min-w-0 flex-1"><strong class="block truncate">${esc(e.title)}</strong><small class="text-slate-400">${esc(e.location || e.calendar)}</small></span><span class="text-slate-400">›</span></button>`;
    }).join('') + '</div>';
  }

  function openEvent(event = {}) {
    const isEdit = !!event.id;
    $('#modalRoot').innerHTML = `<div class="modal-backdrop"><form id="eventForm" class="modal-card"><div class="mb-6 flex items-start justify-between"><div><p class="text-xs font-bold uppercase tracking-[.18em] text-violet-500">${isEdit ? 'Event details' : 'New moment'}</p><h2 class="font-display mt-1 text-2xl font-bold">${isEdit ? 'Edit event' : 'Create an event'}</h2></div><button type="button" class="icon-btn" data-close>✕</button></div><div class="space-y-4"><div><label class="field-label">Title</label><input class="field text-lg font-semibold" name="title" required autofocus value="${esc(event.title || '')}" placeholder="What’s happening?" /></div><div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label class="field-label">Date</label><input class="field" type="date" name="date" required value="${event.date || state.cursor}" /></div><div><label class="field-label">Starts</label><input class="field" type="time" name="start" required value="${event.start || '09:00'}" /></div><div><label class="field-label">Ends</label><input class="field" type="time" name="end" required value="${event.end || '10:00'}" /></div></div><div class="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label class="field-label">Calendar</label><select class="field capitalize" name="calendar">${Object.keys(colors).map(k => `<option ${event.calendar === k ? 'selected' : ''} value="${k}">${k}</option>`).join('')}</select></div><div><label class="field-label">Status</label><select class="field" name="status">${['pending', 'in-progress', 'completed'].map(k => `<option ${event.status === k ? 'selected' : ''} value="${k}">${k}</option>`).join('')}</select></div><div><label class="field-label">Repeat</label><select class="field" name="recurrence">${['none', 'daily', 'weekly', 'monthly', 'yearly'].map(k => `<option ${event.recurrence === k ? 'selected' : ''} value="${k}">${k === 'none' ? 'Does not repeat' : `Repeats ${k}`}</option>`).join('')}</select></div></div><div class="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label class="field-label">Alert</label><select class="field" name="alert">${[['now', 'Immediate'], ['10min', '10 min before'], ['1hour', '1 hour before'], ['1day', '1 day before']].map(([v, l]) => `<option ${event.alert === v ? 'selected' : ''} value="${v}">${l}</option>`).join('')}</select></div><div><label class="field-label">Custom Color</label><input class="field !p-1 !h-10" type="color" name="color" value="${event.color || '#8b5cf6'}" /></div></div><div><label class="field-label">Location / call link</label><input class="field" name="location" value="${esc(event.location || '')}" placeholder="Add a place or URL" /></div><div><label class="field-label">Guests</label><input class="field" name="guests" value="${esc(event.guests || '')}" placeholder="Emails, separated by commas" /></div><div><label class="field-label">Description</label><textarea class="field min-h-[60px] resize-y" name="description" placeholder="Brief description">${esc(event.description || '')}</textarea></div><div><label class="field-label">Notes</label><textarea class="field min-h-[60px] resize-y" name="notes" placeholder="Add context, links, or an agenda">${esc(event.notes || '')}</textarea></div><div><label class="field-label flex items-center gap-4 font-normal normal-case tracking-normal text-slate-500"><input type="checkbox" name="notifyTelegram" value="telegram" ${(event.notifyVia || []).includes('telegram') ? 'checked' : ''} class="w-4 h-4"> Notify via Telegram</label></div></div><div class="mt-6 flex flex-wrap items-center gap-2">${isEdit ? '<button type="button" id="deleteEvent" class="secondary danger">Delete</button>' : ''}<span class="flex-1"></span><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${isEdit ? 'Save changes' : 'Create event'}</button></div></form></div>`;
    
    const root = $('.modal-backdrop');
    $$('[data-close]', root).forEach(b => b.onclick = closeModal);
    root.onclick = e => { if (e.target === root) closeModal(); };

    $('#eventForm').onsubmit = async e => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      if (o.end <= o.start && o.end !== '00:00') return toast('End time must be after start time');
      
      const payload = {
        title: o.title, date: o.date, start: o.start, end: o.end, calendar: o.calendar,
        status: o.status, recurrence: o.recurrence, alert: o.alert, color: o.color,
        location: o.location, guests: o.guests, description: o.description, notes: o.notes,
        notifyVia: o.notifyTelegram ? ['telegram'] : []
      };

      try {
        let updatedEvent;
        if (isEdit) {
          updatedEvent = (await apiCall(`/events/${event.id}`, 'PUT', payload)).event;
          state.events = state.events.map(x => x.id === event.id ? updatedEvent : x);
        } else {
          updatedEvent = (await apiCall('/events', 'POST', payload)).event;
          state.events.push(updatedEvent);
        }
        closeModal();
        render();
        toast(isEdit ? 'Event updated' : 'Event created ✨');
      } catch (err) {
        toast(err.message);
      }
    };

    if (isEdit) {
      $('#deleteEvent').onclick = async () => {
        try {
          await apiCall(`/events/${event.id}`, 'DELETE');
          state.events = state.events.filter(x => x.id !== event.id);
          closeModal();
          render();
          toast('Event deleted');
        } catch (err) {
          toast(err.message);
        }
      };
    }
    setTimeout(() => $('#eventForm [autofocus]')?.focus(), 50);
  }

  function openSearch() {
    const events = shownEvents();
    $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal-card !max-w-[680px] !p-3"><div class="flex items-center gap-3 border-b border-slate-200 p-3 dark:border-white/10"><span class="text-xl text-violet-500">⌕</span><input id="searchInput" class="min-w-0 flex-1 bg-transparent text-lg outline-none" placeholder="Search title, guest, location or notes…" autofocus/><button class="icon-btn" data-close>✕</button></div><div id="searchResults" class="max-h-[55vh] overflow-auto p-2"></div><div class="flex items-center gap-3 border-t border-slate-200 p-3 text-[10px] text-slate-400 dark:border-white/10"><kbd>↑↓</kbd> Navigate <kbd>↵</kbd> Open <span class="ml-auto">${events.length} events</span></div></div></div>`;
    let active = 0, filtered = events;
    const draw = () => {
      $('#searchResults').innerHTML = filtered.length ? filtered.slice(0, 20).map((e, i) => {
        const c = e.color ? [e.color, e.color + '22', e.color] : colors[e.calendar];
        return `<button class="search-item ${i === active ? 'active' : ''}" data-result="${e.id}"><span class="dot" style="background:${c[0]}"></span><span class="min-w-0 flex-1"><strong class="block truncate">${esc(e.title)}</strong><small class="text-slate-400">${fmt(parseDate(e.date), { month: 'short', day: 'numeric' })} · ${e.start} · ${esc(e.location || e.calendar)}</small></span><span>›</span></button>`;
      }).join('') : '<div class="p-10 text-center text-slate-400">No matching events</div>';
      $$('[data-result]').forEach(b => b.onclick = () => { closeModal(); openEvent(state.events.find(e => e.id === b.dataset.result)); });
    };
    draw();
    $('#searchInput').oninput = e => { const q = e.target.value.toLowerCase(); filtered = events.filter(x => [x.title, x.location, x.notes, x.guests, x.calendar].join(' ').toLowerCase().includes(q)); active = 0; draw(); };
    $('#searchInput').onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); closeModal(); openEvent(filtered[active]); }
    };
    $$('[data-close]').forEach(x => x.onclick = closeModal);
    $('.modal-backdrop').onclick = e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); };
    setTimeout(() => $('#searchInput').focus(), 20);
  }

  function openMore() {
    $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal-card !max-w-sm"><h2 class="font-display mb-4 text-xl font-bold">Calendar tools</h2><div class="grid gap-2"><button id="exportJson" class="secondary text-left">↓ Export backup (.json)</button><button id="exportIcs" class="secondary text-left">↓ Export calendar (.ics)</button><button id="importBtn" class="secondary text-left">↑ Import JSON / ICS</button><button id="notifyBtn" class="secondary text-left">♢ Enable notifications</button><button id="shortcuts" class="secondary text-left">⌨ Keyboard shortcuts</button></div><button data-close class="secondary mt-5 w-full">Close</button></div></div>`;
    $('#exportJson').onclick = exportJson;
    $('#exportIcs').onclick = exportIcs;
    $('#importBtn').onclick = () => $('#importFile').click();
    $('#notifyBtn').onclick = requestNotify;
    $('#shortcuts').onclick = () => toast('C create · T today · ←/→ navigate · ⌘K search');
    $$('[data-close]').forEach(x => x.onclick = closeModal);
    $('.modal-backdrop').onclick = e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); };
  }

  async function openAdmin() {
    try {
      const users = await apiCall('/admin/users');
      $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal-card !max-w-lg"><div class="flex items-center justify-between mb-6"><h2 class="font-display text-xl font-bold">Admin Panel</h2><button class="icon-btn" data-close>✕</button></div><div id="adminUserList"></div><button data-close class="secondary mt-5 w-full">Close</button></div></div>`;
      
      $('#adminUserList').innerHTML = users.map(u => `
        <div class="admin-user-card" data-username="${u.username}">
          <div>
            <strong class="block">${esc(u.username)}</strong>
            <small class="text-slate-400">TG: ${u.telegramId} · ${u.isActive ? '✅' : '❌'}</small>
          </div>
          <div>${u.isAdmin ? '👑' : ''}</div>
        </div>
      `).join('');

      $$('.admin-user-card').forEach(card => {
        card.onclick = async () => {
          const username = card.dataset.username;
          try {
            const data = await apiCall(`/dashboard/${username}`);
            $('#adminUserList').innerHTML = `
              <button class="secondary mb-4" id="backToUsers">← Back to users</button>
              <h3 class="font-display text-lg font-bold mb-2">Data for ${esc(username)}</h3>
              <div class="json-viewer">${esc(JSON.stringify(data, null, 2))}</div>
            `;
            $('#backToUsers').onclick = () => openAdmin();
          } catch (err) {
            toast(err.message);
          }
        };
      });

      $$('[data-close]').forEach(x => x.onclick = closeModal);
      $('.modal-backdrop').onclick = e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); };
    } catch (err) {
      toast(err.message);
    }
  }

  function exportJson() { download('chrona-backup.json', JSON.stringify({ version: 1, events: state.events }, null, 2), 'application/json'); toast('Backup exported'); }
  function exportIcs() {
    const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chrona//Calendar//EN', ...state.events.flatMap(e => ['BEGIN:VEVENT', `UID:${e.id}@chrona`, `DTSTART:${e.date.replaceAll('-', '')}T${e.start.replace(':', '')}00`, `DTEND:${e.date.replaceAll('-', '')}T${e.end.replace(':', '')}00`, `SUMMARY:${e.title.replaceAll(',', '\\,')}`, `LOCATION:${(e.location || '').replaceAll(',', '\\,')}`, `DESCRIPTION:${(e.notes || '').replaceAll('\n', '\\n')}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    download('chrona-calendar.ics', out, 'text/calendar'); toast('Calendar exported');
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

  async function importFile(e) {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      if (f.name.endsWith('.json')) {
        const d = JSON.parse(text);
        if (!Array.isArray(d.events)) throw Error();
        for (const ev of d.events) {
          const payload = { ...ev, id: uid() };
          await apiCall('/events', 'POST', payload);
        }
      } else {
        const blocks = text.split('BEGIN:VEVENT').slice(1);
        for (const b of blocks) {
          const get = k => (b.match(new RegExp(`${k}:(.*)`)) || [])[1]?.trim() || '';
          const ds = get('DTSTART');
          const payload = { title: get('SUMMARY') || 'Imported', date: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`, start: `${ds.slice(9, 11) || '09'}:${ds.slice(11, 13) || '00'}`, end: '10:00', calendar: 'work', location: get('LOCATION'), notes: get('DESCRIPTION') };
          await apiCall('/events', 'POST', payload);
        }
      }
      await loadEvents(); closeModal(); render(); toast('Events imported');
    } catch { toast('Could not import file'); }
    e.target.value = '';
  }

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
        const dt = new Date(`${e.date}T${e.start}`), diff = dt - now;
        if (diff > 0 && diff < 60000 && !sessionStorage.getItem('notified-' + e.id)) {
          new Notification(e.title, { body: `Starts now${e.location ? ' · ' + e.location : ''}` });
          sessionStorage.setItem('notified-' + e.id, '1');
        }
      });
    }, 30000);
  }

  function updateInsight() {
    const w = startWeek(new Date()), count = state.events.filter(e => { const d = parseDate(e.date); return d >= w && d <= addDays(w, 6); }).length;
    $('#focusInsight').textContent = count > 8 ? `${count} events this week. Protect a focus block.` : count > 3 ? `${count} events this week — comfortably balanced.` : 'A spacious week. Perfect for focused progress.';
  }

  function renderAuth(mode = 'login') {
    $('#appRoot').classList.add('hidden');
    $('#authRoot').classList.remove('hidden');
    $('#authRoot').innerHTML = `
      <div class="auth-screen">
        <div class="orb orb-a"></div><div class="orb orb-b"></div>
        <form id="authForm" class="auth-card">
          <div class="flex items-center gap-3">
            <span class="logo-mark">C</span>
            <div><p class="font-display text-xl font-bold">Welcome to Chrona</p><p class="text-xs text-slate-400">Your private planning space</p></div>
          </div>
          <div class="auth-tabs" id="authTabs">
            <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Log in</button>
            <button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">Sign up</button>
            <button type="button" class="auth-tab ${mode === 'reset' ? 'active' : ''}" data-mode="reset">Reset</button>
          </div>
          <div id="authFields" class="space-y-4 mt-4">
            ${mode === 'signup' ? `<div><label class="field-label">Username</label><input class="field" name="username" required placeholder="3+ characters"></div>` : ''}
            ${mode === 'reset' ? `<div><label class="field-label">Username or Telegram ID</label><input class="field" name="identifier" required placeholder="Identifier"></div>` : ''}
            <div><label class="field-label">Password</label><input class="field" name="password" type="password" required minlength="6" placeholder="6+ characters"></div>
            ${mode === 'signup' ? `<div><label class="field-label">Telegram ID</label><input class="field" name="telegramId" required placeholder="For activation"></div>` : ''}
          </div>
          <div id="authError" class="text-red-500 text-sm mt-2 hidden"></div>
          <button class="primary mt-6 w-full" type="submit" id="authSubmitBtn">${mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create Account' : 'Send Reset Code'}</button>
          <p class="mt-4 text-center text-[10px] leading-4 text-slate-500">Secure authentication via Telegram.</p>
        </form>
      </div>`;

    $$('#authTabs .auth-tab').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
    
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#authError');
      errEl.classList.add('hidden');
      const fd = Object.fromEntries(new FormData(e.target));
      
      try {
        if (mode === 'login') {
          const data = await apiCall('/auth/login', 'POST', { username: fd.username || fd.identifier, password: fd.password });
          if (data.success) {
            currentUser = data.username;
            localStorage.setItem('chrona_user', currentUser);
            showApp();
          }
        } else if (mode === 'signup') {
          await apiCall('/auth/register', 'POST', { username: fd.username, password: fd.password, telegramId: fd.telegramId });
          toast('Activation code sent to Telegram.');
          renderAuth('verify');
        } else if (mode === 'reset') {
          await apiCall('/auth/reset-request', 'POST', { username: fd.identifier, telegramId: fd.identifier });
          toast('Reset code sent to Telegram.');
          renderAuth('confirm-reset');
        }
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    };
  }

  function renderAuthVerify() {
    $('#authRoot').innerHTML = `
      <div class="auth-screen">
        <div class="orb orb-a"></div><div class="orb orb-b"></div>
        <form id="authForm" class="auth-card">
          <div class="flex items-center gap-3">
            <span class="logo-mark">C</span>
            <div><p class="font-display text-xl font-bold">Activate Account</p><p class="text-xs text-slate-400">Enter the code sent to Telegram</p></div>
          </div>
          <div class="space-y-4 mt-6">
            <div><label class="field-label">Username</label><input class="field" name="username" required placeholder="Username"></div>
            <div><label class="field-label">Activation Code</label><input class="field" name="code" required placeholder="6-digit code"></div>
          </div>
          <div id="authError" class="text-red-500 text-sm mt-2 hidden"></div>
          <button class="primary mt-6 w-full" type="submit">Activate</button>
          <button type="button" class="secondary mt-3 w-full" onclick="renderAuth('login')">Back to Login</button>
        </form>
      </div>`;
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#authError'); errEl.classList.add('hidden');
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await apiCall('/auth/verify', 'POST', { username: fd.username, code: fd.code });
        toast('Account activated! Please log in.');
        renderAuth('login');
      } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
    };
  }

  function renderAuthConfirmReset() {
    $('#authRoot').innerHTML = `
      <div class="auth-screen">
        <div class="orb orb-a"></div><div class="orb orb-b"></div>
        <form id="authForm" class="auth-card">
          <div class="flex items-center gap-3">
            <span class="logo-mark">C</span>
            <div><p class="font-display text-xl font-bold">Reset Password</p><p class="text-xs text-slate-400">Enter the code sent to Telegram</p></div>
          </div>
          <div class="space-y-4 mt-6">
            <div><label class="field-label">Username</label><input class="field" name="username" required placeholder="Username"></div>
            <div><label class="field-label">Reset Code</label><input class="field" name="code" required placeholder="6-digit code"></div>
            <div><label class="field-label">New Password</label><input class="field" name="newPassword" type="password" required minlength="6" placeholder="New password"></div>
          </div>
          <div id="authError" class="text-red-500 text-sm mt-2 hidden"></div>
          <button class="primary mt-6 w-full" type="submit">Change Password</button>
          <button type="button" class="secondary mt-3 w-full" onclick="renderAuth('login')">Back to Login</button>
        </form>
      </div>`;
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $('#authError'); errEl.classList.add('hidden');
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await apiCall('/auth/reset', 'POST', { username: fd.username, code: fd.code, newPassword: fd.newPassword });
        toast('Password changed successfully.');
        renderAuth('login');
      } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
    };
  }

  const _renderAuth = renderAuth;
  renderAuth = (mode) => {
    if (mode === 'verify') return renderAuthVerify();
    if (mode === 'confirm-reset') return renderAuthConfirmReset();
    _renderAuth(mode);
  };

  function shareReminder(event, channel) {
    const text = `Reminder: ${event.title} · ${fmt(parseDate(event.date), { weekday: 'long', month: 'short', day: 'numeric' })} at ${event.start}${event.location ? ' · ' + event.location : ''}${event.notes ? '\n' + event.notes : ''}`;
    const url = channel === 'whatsapp' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast(`${channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} reminder ready`);
  }

  function enhanceEventModal(event) {
    const form = $('#eventForm'); if (!form) return;
    const box = document.createElement('div');
    box.className = 'mt-5 border-t border-slate-200 pt-5 dark:border-white/10';
    box.innerHTML = `<p class="field-label">Share reminder</p><div class="social-reminders flex gap-2"><button type="button" class="secondary" id="whatsappReminder">◉ WhatsApp</button><button type="button" class="secondary" id="telegramReminder">➤ Telegram</button></div>`;
    form.querySelector('.mt-6').before(box);
    $('#whatsappReminder').onclick = () => shareReminder(event, 'whatsapp');
    $('#telegramReminder').onclick = () => shareReminder(event, 'telegram');
  }

  function closeModal() { $('#modalRoot').innerHTML = ''; }
  
  function logout() {
    currentUser = null;
    localStorage.removeItem('chrona_user');
    renderAuth();
  }

  function toast(msg, undo) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${esc(msg)}${undo ? ' <button class="ml-3 font-bold text-violet-300">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
    $('#toastRoot').append(t);
    setTimeout(() => t.remove(), undo ? 6000 : 2800);
  }

  init();
});
