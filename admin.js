(function () {
  const LITE_API_URL = 'https://script.google.com/macros/s/AKfycbxF57u1UNBsonktp5_2EseJtFkBZR0-CCxyazOGVUmEBrcwjU1-t6Us41gcrRqCsGcR/exec';
  const ADMIN_API_URL = 'https://bot.frostclient.eu/admin';
  const DISCORD_CLIENT_ID = '1512834635640475898';
  const DISCORD_REDIRECT_URI = 'https://admin.frostclient.eu';
  const TOKEN_KEY = 'frostAdminToken';
  const OAUTH_STATE_KEY = 'frostAdminOauthState';
  const APP_VERSION = '1';

  function loadToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function saveToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function fetchJsonWithRetry(url, options, retries) {
    return fetch(url, options)
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        if (retries > 0) {
          return new Promise(function (resolve) { setTimeout(resolve, 1000); })
            .then(function () { return fetchJsonWithRetry(url, options, retries - 1); });
        }
        throw err;
      });
  }

  function callAdmin(action, params) {
    const token = loadToken();
    const body = Object.assign({ token: token, action: action }, params || {});
    return fetchJsonWithRetry(ADMIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 2).then(function (data) {
      if (data && data.ok === false && data.error === 'forbidden') {
        clearToken();
        showGate('gateForbidden');
      } else if (data && data.ok === false && data.error === 'insufficient_permission') {
        showToast("You don't have permission to do that.", 'error');
      }
      return data;
    }).catch(function (err) {
      showToast("Couldn't reach the server — check your connection and try again.", 'error');
      return { ok: false, error: 'network_error' };
    });
  }
  const toastStack = document.getElementById('toastStack');
  const MAX_VISIBLE_TOASTS = 3;
  function removeToastEl(el) {
    if (!el.parentNode) return;
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 300);
  }
  function showToast(message, type) {
    while (toastStack.children.length >= MAX_VISIBLE_TOASTS) {
      toastStack.firstElementChild.remove();
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(function () { removeToastEl(el); }, 3500);
  }
  function setBtnLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
  }
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmText = document.getElementById('confirmText');
  const confirmReasonField = document.getElementById('confirmReasonField');
  const confirmReasonInput = document.getElementById('confirmReasonInput');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  let confirmResolve = null;
  let confirmAction = null;

  // `action`, when given, is called with the reason (if any) once the user hits Confirm - the
  // modal stays open with a spinner on confirmOkBtn until it resolves, instead of closing
  // instantly, since most confirmed actions (ban/kick/warn/accept/deny/...) are real network
  // round trips and closing immediately gave no feedback that anything was happening.
  function askConfirm(title, text, opts, action) {
    opts = opts || {};
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmReasonField.style.display = opts.reason ? '' : 'none';
    confirmReasonInput.value = '';
    confirmOkBtn.classList.toggle('btn-danger', opts.tone !== 'primary');
    confirmOkBtn.classList.toggle('btn-primary', opts.tone === 'primary');
    confirmOkBtn.querySelector('.btn-label').textContent = opts.okLabel || 'Confirm';
    confirmOkBtn.classList.remove('is-loading');
    confirmOkBtn.disabled = false;
    confirmCancelBtn.disabled = false;
    confirmAction = action || null;
    confirmModal.classList.add('active');
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  function closeConfirm(result, reason) {
    confirmModal.classList.remove('active');
    confirmOkBtn.classList.remove('is-loading');
    confirmOkBtn.disabled = false;
    confirmCancelBtn.disabled = false;
    confirmAction = null;
    if (confirmResolve) {
      confirmResolve(result ? { ok: true, reason: reason || '' } : { ok: false });
      confirmResolve = null;
    }
  }
  confirmOkBtn.addEventListener('click', function () {
    const reason = confirmReasonInput.value.trim();
    if (confirmAction) {
      confirmOkBtn.disabled = true;
      confirmCancelBtn.disabled = true;
      confirmOkBtn.classList.add('is-loading');
      Promise.resolve(confirmAction(reason)).then(function () { closeConfirm(true, reason); }, function () { closeConfirm(true, reason); });
      return;
    }
    closeConfirm(true, reason);
  });
  confirmCancelBtn.addEventListener('click', function () { closeConfirm(false); });
  confirmModal.addEventListener('click', function (e) { if (e.target === confirmModal && !confirmOkBtn.disabled) closeConfirm(false); });

  const NOTIF_TOAST_SECONDS = 6;
  const MAX_INDIVIDUAL_NOTIF_TOASTS = 3;
  const notifPanel = document.getElementById('notifPanel');
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifList = document.getElementById('notifList');
  const notifToastStack = document.getElementById('notifToastStack');
  let notifPanelOpen = false;
  let notifCache = [];
  const seenNotifToastIds = new Set();

  function setNotifUnread(count) {
    setBadge('notifBadge', count);
    document.getElementById('notifDot').style.display = count > 0 ? '' : 'none';
  }

  const VIEW_NOTIF_TYPES = {
    warns: ['warn'],
    excuses: ['excuse_decided', 'excuse_submitted'],
    scams: ['scam_report'],
    staffApps: ['staff_app_submitted'],
    partnerLogs: ['partner_signup_logged'],
    partnerRankup: ['partner_rankup_submitted'],
    reports: ['bug_report_submitted']
  };
  const NAV_DOT_IDS = {
    warns: 'navDotWarns', excuses: 'navDotExcuses', scams: 'navDotScams',
    staffApps: 'navDotStaffApps', partnerLogs: 'navDotPartnerLogs', partnerRankup: 'navDotPartnerRankup',
    reports: 'navDotReports'
  };
  function updateNavDots() {
    const unreadViews = new Set();
    notifCache.forEach(function (n) {
      if (n.read) return;
      for (const view in VIEW_NOTIF_TYPES) {
        if (VIEW_NOTIF_TYPES[view].indexOf(n.type) !== -1) unreadViews.add(view);
      }
    });
    Object.keys(NAV_DOT_IDS).forEach(function (view) {
      const el = document.getElementById(NAV_DOT_IDS[view]);
      if (el) el.style.display = unreadViews.has(view) ? '' : 'none';
    });
  }
  function markViewNotifsRead(view) {
    const types = VIEW_NOTIF_TYPES[view];
    if (!types) return;
    const hasUnread = notifCache.some(function (n) { return !n.read && types.indexOf(n.type) !== -1; });
    if (!hasUnread) return;
    notifCache.forEach(function (n) { if (types.indexOf(n.type) !== -1) n.read = true; });
    updateNavDots();
    setNotifUnread(notifCache.filter(function (n) { return !n.read; }).length);
    callAdmin('notifications.markRead', { types: types });
  }

  const NOTIF_ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  const NOTIF_ICON_CLIPBOARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
  const NOTIF_ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const NOTIF_ICON_ALERT_OCTAGON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  const NOTIF_ICON_USER_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>';
  const NOTIF_ICON_USER_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>';
  const NOTIF_ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const NOTIF_ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-icon-svg"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/></svg>';
  function notifTypeMeta(type) {
    if (type === 'warn') return { icon: NOTIF_ICON_WARN, title: 'New warning' };
    if (type === 'excuse_decided') return { icon: NOTIF_ICON_CLIPBOARD, title: 'Excuse update' };
    if (type === 'excuse_submitted') return { icon: NOTIF_ICON_PENCIL, title: 'New excuse' };
    if (type === 'scam_report') return { icon: NOTIF_ICON_ALERT_OCTAGON, title: 'New scam report' };
    if (type === 'staff_app_submitted') return { icon: NOTIF_ICON_USER_CHECK, title: 'New staff application' };
    if (type === 'bug_report_submitted') return { icon: NOTIF_ICON_ALERT_OCTAGON, title: 'New bug report' };
    if (type === 'partner_signup_logged') return { icon: NOTIF_ICON_USER_PLUS, title: 'New Media partner signup' };
    if (type === 'new_review') return { icon: NOTIF_ICON_STAR, title: 'New review' };
    if (type === 'reputation_received') return { icon: NOTIF_ICON_STAR, title: 'New reputation' };
    if (type === 'test') return { icon: NOTIF_ICON_BELL, title: 'Test notification' };
    return { icon: NOTIF_ICON_BELL, title: 'Notification' };
  }

  function renderNotifToastEl(title, msg) {
    const el = document.createElement('div');
    el.className = 'notif-toast';
    el.innerHTML =
      '<div class="notif-toast-title">' + title + '</div>' +
      '<div class="notif-toast-msg">' + msg + '</div>' +
      '<div class="notif-toast-progress"></div>';
    el.querySelector('.notif-toast-progress').style.animationDuration = NOTIF_TOAST_SECONDS + 's';
    let removed = false;
    function removeToast() {
      if (removed) return;
      removed = true;
      el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(24px)';
      setTimeout(function () { el.remove(); }, 250);
    }
    el.addEventListener('click', function () { openNotifPanel(); removeToast(); });
    notifToastStack.appendChild(el);
    setTimeout(removeToast, NOTIF_TOAST_SECONDS * 1000);
  }
  function showNotifToast(n) {
    const meta = notifTypeMeta(n.type);
    renderNotifToastEl(meta.icon + ' ' + escapeHtml(meta.title), escapeHtml(n.message));
  }
  function showAggregateNotifToast(count) {
    renderNotifToastEl(NOTIF_ICON_BELL + ' ' + count + ' new notifications', 'Click to view them all.');
  }

  function wireNotifSwipe(item) {
    const inner = item.querySelector('.notif-item-inner');
    const id = item.dataset.id;
    const THRESHOLD = 90;
    let startX = 0, currentX = 0, dragging = false;
    inner.addEventListener('pointerdown', function (e) {
      dragging = true;
      startX = e.clientX;
      inner.style.transition = 'none';
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      currentX = Math.min(0, e.clientX - startX);
      inner.style.transform = 'translateX(' + currentX + 'px)';
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      inner.style.transition = 'transform 0.25s cubic-bezier(0.16,1,0.3,1)';
      if (currentX < -THRESHOLD) {
        inner.style.transform = 'translateX(-110%)';
        item.style.overflow = 'hidden';
        item.style.maxHeight = item.offsetHeight + 'px';
        requestAnimationFrame(function () {
          item.style.transition = 'max-height 0.25s ease 0.1s, opacity 0.25s ease 0.1s';
          item.style.maxHeight = '0px';
          item.style.opacity = '0';
        });
        callAdmin('notifications.delete', { id: id });
        notifCache = notifCache.filter(function (n) { return n.id !== id; });
        updateNavDots();
        setNotifUnread(notifCache.filter(function (n) { return !n.read; }).length);
        setTimeout(function () { item.remove(); }, 450);
      } else {
        inner.style.transform = 'translateX(0)';
      }
      currentX = 0;
    }
    inner.addEventListener('pointerup', endDrag);
    inner.addEventListener('pointercancel', endDrag);
  }

  function renderNotifList(notifications) {
    if (!notifications.length) {
      notifList.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }
    notifList.innerHTML = notifications.map(function (n) {
      const meta = notifTypeMeta(n.type);
      return (
        '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-id="' + escapeHtml(n.id) + '">' +
          '<div class="notif-item-delete-hint">Delete</div>' +
          '<div class="notif-item-inner">' +
            '<div class="notif-item-msg">' + meta.icon + ' ' + escapeHtml(n.message) + '</div>' +
            '<div class="notif-item-time">' + formatRelative(n.createdAt) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    notifList.querySelectorAll('.notif-item').forEach(wireNotifSwipe);
  }

  function openNotifPanel() {
    notifPanelOpen = true;
    notifPanel.classList.add('active');
    callAdmin('notifications.list').then(function (d) {
      if (!d || !d.ok) return;
      notifCache = d.notifications;
      renderNotifList(notifCache);
      updateNavDots();
      if (d.unreadCount > 0) {
        callAdmin('notifications.markAllRead').then(function (r) {
          if (r && r.ok) {
            notifCache.forEach(function (n) { n.read = true; });
            updateNavDots();
            setNotifUnread(0);
          }
        });
      }
    });
  }
  function closeNotifPanel() {
    notifPanelOpen = false;
    notifPanel.classList.remove('active');
  }
  notifBellBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (notifPanelOpen) closeNotifPanel(); else openNotifPanel();
  });
  notifPanel.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function (e) {
    if (notifPanelOpen && !notifPanel.contains(e.target) && e.target !== notifBellBtn) closeNotifPanel();
  });
  document.getElementById('notifMarkAllBtn').addEventListener('click', function () {
    callAdmin('notifications.markAllRead').then(function (d) {
      if (d && d.ok) {
        notifCache.forEach(function (n) { n.read = true; });
        renderNotifList(notifCache);
        updateNavDots();
        setNotifUnread(0);
      }
    });
  });
  document.getElementById('notifClearAllBtn').addEventListener('click', function () {
    callAdmin('notifications.clearAll').then(function (d) {
      if (d && d.ok) {
        notifCache = [];
        renderNotifList(notifCache);
        updateNavDots();
        setNotifUnread(0);
      }
    });
  });

  function loadNotifications() {
    return callAdmin('notifications.list').then(function (d) {
      if (!d || !d.ok) return;
      const fresh = d.notifications.filter(function (n) { return !n.read && !seenNotifToastIds.has(n.id); });
      fresh.forEach(function (n) { seenNotifToastIds.add(n.id); });
      if (!isMobileDevice() && fresh.length) {
        if (fresh.length > MAX_INDIVIDUAL_NOTIF_TOASTS) showAggregateNotifToast(fresh.length);
        else fresh.forEach(showNotifToast);
      }
      notifCache = d.notifications;
      if (!notifPanelOpen) renderNotifList(notifCache);
      updateNavDots();
      setNotifUnread(d.unreadCount);
    });
  }
  let notifPollTimer = null;
  function startNotifPolling() {
    loadNotifications();
    if (!notifPollTimer) notifPollTimer = setInterval(loadNotifications, 20000);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function avatarUrl(id, avatar) {
    if (avatar) return 'https://cdn.discordapp.com/avatars/' + id + '/' + avatar + '.png?size=64';
    let idx = 0;
    try { idx = Number((BigInt(id || '0') >> 22n) % 6n); } catch (e) { idx = 0; }
    return 'https://cdn.discordapp.com/embed/avatars/' + idx + '.png';
  }
  function reviewAvatarUrl(r) {
    if (r.avatar && /^https?:\/\//.test(r.avatar)) return r.avatar;
    return avatarUrl(r.discordId, null);
  }
  function formatDuration(ms) {
    if (!ms) return '0m';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  }
  function formatDateTime(ms) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return '—'; }
  }
  function formatRelative(ms) {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.round(min / 60);
    if (hr < 24) return hr + 'h ago';
    const days = Math.round(hr / 24);
    return days + 'd ago';
  }
  function emptyRow(colspan, text) {
    return '<tr class="empty-row"><td colspan="' + colspan + '">' + escapeHtml(text) + '</td></tr>';
  }
  const sidebar = document.getElementById('sidebar');
  const viewTitle = document.getElementById('viewTitle');
  const VIEW_TITLES = {
    overview: 'Overview', members: 'Members', leaderboard: 'Leaderboards', staff: 'Staff Team', staffActivity: 'Activity',
    staffApps: 'Staff Applications', partnerLogs: 'Creators', partnerRankup: 'Partner Rankup Requests', reports: 'Bug Reports', scams: 'Scam Database',
    logs: 'Action Logs', excuses: 'Excuses', warns: 'Warns', reviews: 'Reviews', drops: 'Publish Drop', giveaway: 'Publish Giveaway', tickets: 'Tickets',
    ticketArchive: 'Ticket Archive', autoreplies: 'Auto Replies', scamFilter: 'Scam Filter'
  };
  const VIEW_LOADERS = {
    overview: loadOverview, members: function () {}, leaderboard: loadLeaderboard, staff: loadStaff,
    staffActivity: function () { loadStaffActivity(currentStaffActivityFilter); },
    staffApps: function () { loadRecruitment(); loadStaffApps(currentStaffAppsFilter); },
    partnerLogs: function () { loadPartnerLogs(); loadBannedWords(); },
    partnerRankup: function () { loadPartnerRankupRequests(currentPartnerRankupFilter); },
    reports: function () { loadBugReports(currentReportsFilter); },
    scams: function () { loadScams(currentScamsFilter); }, logs: loadLogs, excuses: loadExcuses, warns: loadWarns, reviews: loadReviews,
    drops: function () { loadDropCapeOptions(); }, giveaway: function () {}, tickets: loadTickets,
    ticketArchive: function () { loadTicketArchive(currentTicketArchiveFilter); },
    autoreplies: function () { loadAutoreplies(); },
    scamFilter: function () { loadScamFilter(); }
  };
  let currentView = 'overview';

  function showView(view) {
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.id === 'view-' + view);
    });
    viewTitle.textContent = VIEW_TITLES[view] || view;
    sidebar.classList.remove('open');
    if (VIEW_LOADERS[view]) VIEW_LOADERS[view]();
    markViewNotifsRead(view);
  }

  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.dataset.view); });
  });
  document.querySelectorAll('[data-goto]').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.dataset.goto); });
  });
  document.getElementById('mobileMenuBtn').addEventListener('click', function () { sidebar.classList.toggle('open'); });
  document.getElementById('sidebarToggle').addEventListener('click', function () { sidebar.classList.remove('open'); });

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', function () {
    refreshBtn.classList.add('spinning');
    Promise.resolve((VIEW_LOADERS[currentView] || function () {})()).finally(function () {
      setTimeout(function () { refreshBtn.classList.remove('spinning'); }, 300);
    });
  });
  function animateCount(el, endValue) {
    const start = 0;
    const duration = 700;
    const startTime = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(start + (endValue - start) * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  let canReviewApplications = false;
  let canPublishContent = false;
  let canKickStaff = false;
  function updateNavGroupVisibility() {
    const children = Array.from(document.getElementById('sidebarNav').children);
    children.forEach(function (el, i) {
      if (!el.classList.contains('nav-group-label')) return;
      let hasVisibleItem = false;
      for (let j = i + 1; j < children.length; j++) {
        const sib = children[j];
        if (sib.classList.contains('nav-group-label')) break;
        if (sib.style.display !== 'none') { hasVisibleItem = true; break; }
      }
      el.style.display = hasVisibleItem ? '' : 'none';
    });
  }
  function applyRolePermissions() {
    document.querySelectorAll('[data-requires="highStaff"]').forEach(function (el) { el.style.display = canReviewApplications ? '' : 'none'; });
    document.querySelectorAll('[data-requires="management"]').forEach(function (el) { el.style.display = canPublishContent ? '' : 'none'; });
    updateNavGroupVisibility();
  }
  function renderStatGrid(containerId, cards) {
    document.getElementById(containerId).innerHTML = cards.map(function (c) {
      const targetAttr = c[0] != null ? ' data-target="' + c[0] + '"' : '';
      return '<div class="stat-card"><div class="num' + (c[2] ? ' ' + c[2] : '') + '"' + targetAttr + '>' + (c[0] != null ? 0 : '—') + '</div><div class="label">' + escapeHtml(c[1]) + '</div></div>';
    }).join('');
    document.querySelectorAll('#' + containerId + ' .num[data-target]').forEach(function (el) {
      animateCount(el, parseInt(el.dataset.target, 10) || 0);
    });
  }
  function loadOverview() {
    return callAdmin('overview').then(function (d) {
      if (!d || !d.ok) {
        if (d && d.error && d.error !== 'forbidden') showToast('Could not load overview: ' + d.error, 'error');
        return;
      }
      canReviewApplications = !!d.canReviewApplications;
      canPublishContent = !!d.canPublishContent;
      canKickStaff = !!d.canKickStaff;
      applyRolePermissions();
      loadReputationLeaderboard(5);
      const userTagEl = document.getElementById('userTag');
      userTagEl.textContent = d.myRank || 'Staff';
      userTagEl.style.color = d.myRankColor || '';

      if (d.role !== 'management') {
        document.getElementById('overviewManagement').style.display = 'none';
        document.getElementById('overviewStaff').style.display = '';
        renderStatGrid('myOverviewStats', [
          [d.myStats.solvedTickets, 'Solved tickets'],
          [d.myStats.totalClaims, 'Total claims'],
          [d.myStats.unclaimedTickets, 'Unclaimed'],
          [d.myStreak || 0, 'Current streak'],
          [d.myPeakStreak || 0, 'Peak streak'],
          [d.myReviewCount || 0, 'Reviews'],
        ]);
        renderRankupPanel(d.myRankup ? [d.myRankup] : [], 'myRankupList');
        renderActivityCalendar('myActivityCalendar', d.myActivityCalendar || []);
        myActivityMap = {};
        (d.myActivityCalendar || []).forEach(function (day) { myActivityMap[day.date] = !!day.active; });
        myExcuseDaysMap = d.myExcuseDays || {};
        if (excuseCalMonth) renderExcuseCalendar();

        const inactivityBanner = document.getElementById('inactivityBanner');
        if ((d.daysSinceLastActive || 0) >= 2) {
          document.getElementById('inactivityBannerDays').textContent = 'Last active ' + d.daysSinceLastActive + ' days ago.';
          inactivityBanner.style.display = '';
        } else {
          inactivityBanner.style.display = 'none';
        }

        const warningsPanel = document.getElementById('myWarningsPanel');
        const warnings = d.myWarnings || [];
        if (warnings.length) {
          warningsPanel.style.display = '';
          document.getElementById('myWarningsList').innerHTML = warnings.map(function (w) {
            return '<div class="app-card"><div class="app-card-details"><span>Warned by <strong>' + escapeHtml(w.warnedByUsername || w.warnedBy) + '</strong> · ' + formatDateTime(w.warnedAt) + '</span></div><div class="app-card-a" style="margin-top:8px;">' + escapeHtml(w.reason) + '</div></div>';
          }).join('');
        } else {
          warningsPanel.style.display = 'none';
        }

        const unclaimedPanel = document.getElementById('myUnclaimedPanel');
        const unclaimed = d.myUnclaimedReplyWarnings || [];
        if (unclaimed.length) {
          unclaimedPanel.style.display = '';
          document.getElementById('myUnclaimedTable').innerHTML =
            '<thead><tr><th>Ticket</th><th>When</th></tr></thead><tbody>' +
            unclaimed.map(function (f) { return '<tr><td>' + escapeHtml(f.channelName) + '</td><td class="mono">' + formatRelative(f.timestamp) + '</td></tr>'; }).join('') +
            '</tbody>';
        } else {
          unclaimedPanel.style.display = 'none';
        }
        return;
      }

      document.getElementById('overviewManagement').style.display = '';
      document.getElementById('overviewStaff').style.display = 'none';
      renderStatGrid('overviewStats', [
        [d.onlineNow, 'Discord online now'],
        [d.playingNow, 'Playing FrostClient'],
        [d.memberCount, 'Server members'],
        [d.newUsersToday, 'New members today'],
        [d.newUsersWeek, 'New members this week'],
        [d.partnerCount, 'Creators'],
        [d.totalPlayersSeen, 'Total players seen'],
        [d.openTickets, 'Open tickets'],
        [d.totalReviews, 'Reviews'],
        [d.pendingStaffApps, 'Pending staff apps'],
        [d.mediaSignupsToday, 'Media signups today'],
        [d.scamsToday, 'Scams today', d.scamsToday > 0 ? 'warn' : ''],
        [d.scamsTotal, 'Scams logged (all-time)']
      ]);
      setBadge('badgeStaffApps', d.pendingStaffApps);
      return Promise.all([
        loadGrowthChart(currentGrowthGranularity),
        callAdmin('staff.rankups').then(function (rd) { if (rd && rd.ok) renderRankupPanel(rd.rankups || []); }),
        loadActivityLeaderboard(5)
      ]);
    });
  }

  function renderActivityLeaderboard(entries) {
    const list = document.getElementById('activityLeaderboardList');
    if (!list) return;
    list.innerHTML = entries.map(function (m, i) {
      return '<div class="lb-row" data-lb-id="' + escapeHtml(m.id) + '" data-lb-name="' + escapeHtml(m.username || m.id) + '">' +
        '<span class="lb-rank">#' + (i + 1) + '</span>' +
        '<img class="lb-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' +
        '<span class="lb-name">' + escapeHtml(m.username || m.id) + '</span>' +
        '<span class="lb-count">' + m.weeklyMessages + ' msg</span>' +
      '</div>';
    }).join('') || '<p style="color:var(--muted);font-size:13px;">No chat activity recorded this week yet.</p>';
    list.querySelectorAll('.lb-row[data-lb-id]').forEach(function (row) {
      row.addEventListener('click', function () { openStaffCalendar(row.dataset.lbId, row.dataset.lbName); });
    });
  }
  function loadActivityLeaderboard(limit) {
    return callAdmin('staff.activityLeaderboard', { limit: limit }).then(function (d) {
      if (d && d.ok) renderActivityLeaderboard(d.leaderboard || []);
    });
  }
  const activityLeaderboardMoreBtn = document.getElementById('activityLeaderboardMoreBtn');
  if (activityLeaderboardMoreBtn) {
    activityLeaderboardMoreBtn.addEventListener('click', function () {
      loadActivityLeaderboard(20);
      activityLeaderboardMoreBtn.style.display = 'none';
    });
  }

  function renderReputationLeaderboard(entries) {
    const list = document.getElementById('reputationLeaderboardList');
    if (!list) return;
    list.innerHTML = entries.map(function (m, i) {
      return '<div class="lb-row" data-lb-id="' + escapeHtml(m.id) + '" data-lb-name="' + escapeHtml(m.username || m.id) + '" data-lb-avatar="' + escapeHtml(m.avatar || '') + '">' +
        '<span class="lb-rank">#' + (i + 1) + '</span>' +
        '<img class="lb-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' +
        '<span class="lb-name">' + escapeHtml(m.username || m.id) + '</span>' +
        '<span class="lb-count">' + m.reputation + ' rep</span>' +
      '</div>';
    }).join('') || '<p style="color:var(--muted);font-size:13px;">No reputation given out yet.</p>';
    list.querySelectorAll('.lb-row[data-lb-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        openReputationHistory(row.dataset.lbId, row.dataset.lbName, row.dataset.lbAvatar);
      });
    });
  }
  function loadReputationLeaderboard(limit) {
    return callAdmin('reputation.list', { limit: limit }).then(function (d) {
      if (d && d.ok) renderReputationLeaderboard(d.leaderboard || []);
    });
  }
  const reputationLeaderboardMoreBtn = document.getElementById('reputationLeaderboardMoreBtn');
  if (reputationLeaderboardMoreBtn) {
    reputationLeaderboardMoreBtn.addEventListener('click', function () {
      loadReputationLeaderboard(50);
      reputationLeaderboardMoreBtn.style.display = 'none';
    });
  }

  const reputationHistoryModal = document.getElementById('reputationHistoryModal');
  function openReputationHistory(userId, username, avatar) {
    document.getElementById('reputationHistoryTitle').textContent = (username || userId) + ' — Reputation history';
    const list = document.getElementById('reputationHistoryList');
    list.innerHTML = '<p style="color:var(--muted);font-size:13px;">Loading…</p>';
    reputationHistoryModal.classList.add('active');
    callAdmin('reputation.history', { userId: userId }).then(function (d) {
      if (!d || !d.ok) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">Could not load history.</p>'; return; }
      const history = d.history || [];
      if (!history.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No reputation history yet.</p>'; return; }
      list.innerHTML = history.map(function (h) {
        const sign = h.type === 'remove' ? '−1' : '+1';
        const signClass = h.type === 'remove' ? 'denied' : 'accepted';
        return '<div class="app-card">' +
          '<div class="app-card-details" style="align-items:center;">' +
            '<img class="lb-avatar" src="' + avatarUrl(h.giverId, h.giverAvatar) + '"/>' +
            '<strong>' + escapeHtml(h.giverUsername || h.giverId) + '</strong>' +
            ' <span class="pill ' + signClass + '">' + sign + '</span>' +
            ' <span style="color:var(--muted);">' + formatRelative(h.timestamp) + '</span>' +
          '</div>' +
          (h.reason ? '<div class="app-card-a" style="margin-top:8px;">' + escapeHtml(h.reason) + '</div>' : '') +
        '</div>';
      }).join('');
    });
  }
  document.getElementById('reputationHistoryCloseBtn').addEventListener('click', function () { reputationHistoryModal.classList.remove('active'); });
  reputationHistoryModal.addEventListener('click', function (e) { if (e.target === reputationHistoryModal) reputationHistoryModal.classList.remove('active'); });

  let currentGrowthGranularity = 'day';
  document.querySelectorAll('#growthGranularityFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#growthGranularityFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentGrowthGranularity = btn.dataset.granularity;
      loadGrowthChart(currentGrowthGranularity);
    });
  });
  function loadGrowthChart(granularity) {
    document.getElementById('growthChartSub').textContent = granularity === 'week' ? 'Weekly joins, last 12 weeks' : 'Daily joins, last 30 days';
    return callAdmin('members.growth', { granularity: granularity }).then(function (d) {
      if (d && d.ok) renderGrowthChart(d.buckets || [], granularity);
    });
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function renderGrowthChart(buckets, granularity) {
    const svg = document.getElementById('growthChart');
    const tooltip = document.getElementById('growthChartTooltip');
    svg.innerHTML = '';
    const total = buckets.reduce(function (s, b) { return s + b.count; }, 0);
    const wrap = svg.parentElement;
    const W = Math.max(1, Math.round(wrap.getBoundingClientRect().width));
    const H = 220;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (!buckets.length || total === 0) {
      const empty = svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-axis-label' });
      empty.textContent = 'No new members recorded in this window yet.';
      svg.appendChild(empty);
      return;
    }
    const PAD_L = 34, PAD_R = 8, PAD_T = 16, PAD_B = 26;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;
    const maxVal = Math.max(1, Math.max.apply(null, buckets.map(function (b) { return b.count; })));
    const niceMax = Math.ceil(maxVal * 1.2) || 1;
    const xStep = buckets.length > 1 ? plotW / (buckets.length - 1) : 0;
    function xPix(i) { return PAD_L + i * xStep; }
    function yPix(v) { return PAD_T + plotH - (v / niceMax) * plotH; }

    for (let i = 0; i <= 2; i++) {
      const v = Math.round((niceMax / 2) * i);
      const y = yPix(v);
      svg.appendChild(svgEl('line', { x1: PAD_L, x2: W - PAD_R, y1: y, y2: y, stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 }));
      const label = svgEl('text', { x: PAD_L - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-axis-label' });
      label.textContent = String(v);
      svg.appendChild(label);
    }

    let linePath = '', areaPath = '';
    buckets.forEach(function (b, i) {
      const x = xPix(i), y = yPix(b.count);
      linePath += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    });
    areaPath = 'M' + xPix(0) + ' ' + yPix(0) + ' L' + linePath.slice(1) + 'L' + xPix(buckets.length - 1) + ' ' + yPix(0) + ' Z';
    svg.appendChild(svgEl('path', { d: areaPath, fill: 'var(--accent)', opacity: '0.12', stroke: 'none' }));
    svg.appendChild(svgEl('path', { d: linePath.trim(), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

    const firstLabel = svgEl('text', { x: xPix(0), y: H - 6, 'text-anchor': 'start', class: 'chart-axis-label' });
    firstLabel.textContent = buckets[0].date;
    svg.appendChild(firstLabel);
    const lastLabel = svgEl('text', { x: xPix(buckets.length - 1), y: H - 6, 'text-anchor': 'end', class: 'chart-axis-label' });
    lastLabel.textContent = buckets[buckets.length - 1].date;
    svg.appendChild(lastLabel);

    const hoverDot = svgEl('circle', { r: 4.5, fill: 'var(--accent)', stroke: 'var(--bg-panel)', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(hoverDot);
    const crosshair = svgEl('line', { x1: 0, x2: 0, y1: PAD_T, y2: H - PAD_B, stroke: 'var(--border-strong)', 'stroke-width': 1, opacity: 0 });
    svg.appendChild(crosshair);
    const hitRect = svgEl('rect', { x: PAD_L, y: 0, width: plotW, height: H, fill: 'transparent' });
    svg.appendChild(hitRect);

    hitRect.addEventListener('mousemove', function (e) {
      const rect = svg.getBoundingClientRect();
      const relX = (e.clientX - rect.left) * (W / rect.width);
      let idx = Math.round((relX - PAD_L) / (xStep || 1));
      idx = Math.max(0, Math.min(buckets.length - 1, idx));
      const b = buckets[idx];
      const x = xPix(idx), y = yPix(b.count);
      hoverDot.setAttribute('cx', x); hoverDot.setAttribute('cy', y); hoverDot.setAttribute('opacity', 1);
      crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x); crosshair.setAttribute('opacity', 1);
      const wrapRect = wrap.getBoundingClientRect();
      tooltip.style.left = ((x / W) * wrapRect.width) + 'px';
      tooltip.style.top = ((y / H) * wrapRect.height) + 'px';
      const dateLabel = granularity === 'week' ? 'Week of ' + b.date : b.date;
      tooltip.innerHTML = '<div class="val">+' + b.count + ' member' + (b.count === 1 ? '' : 's') + '</div><div class="date">' + dateLabel + '</div>';
      tooltip.classList.add('show');
    });
    hitRect.addEventListener('mouseleave', function () {
      hoverDot.setAttribute('opacity', 0);
      crosshair.setAttribute('opacity', 0);
      tooltip.classList.remove('show');
    });
  }

  function renderRankupPanel(rankups, containerId) {
    const list = document.getElementById(containerId || 'rankupList');
    if (!rankups.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">Everyone is either fully ranked up or awaiting manual review.</p>'; return; }
    list.innerHTML = rankups.map(function (r) {
      const ticketsPct = Math.min(100, Math.round((r.tickets.current / r.tickets.needed) * 100));
      const rows = [
        '<div class="progress-row"><span class="progress-check ' + (r.tickets.ok ? 'ok' : 'no') + '">' + (r.tickets.ok ? '✓' : '✕') + '</span>' +
          '<span class="progress-label">' + r.tickets.current + '/' + r.tickets.needed + ' tickets</span>' +
          '<div class="progress-bar"><div class="progress-bar-fill ' + (r.tickets.ok ? 'ok' : '') + '" style="width:' + ticketsPct + '%;"></div></div></div>'
      ];
      if (r.reps) {
        const repsPct = Math.min(100, Math.round((r.reps.current / r.reps.needed) * 100));
        rows.push(
          '<div class="progress-row"><span class="progress-check ' + (r.reps.ok ? 'ok' : 'no') + '">' + (r.reps.ok ? '✓' : '✕') + '</span>' +
            '<span class="progress-label">' + r.reps.current + '/' + r.reps.needed + ' reputation</span>' +
            '<div class="progress-bar"><div class="progress-bar-fill ' + (r.reps.ok ? 'ok' : '') + '" style="width:' + repsPct + '%;"></div></div></div>'
        );
      }
      rows.push(
        '<div class="progress-row"><span class="progress-check ' + (r.activity.ok ? 'ok' : 'no') + '">' + (r.activity.ok ? '✓' : '✕') + '</span>' +
          '<span class="progress-label" style="min-width:auto;">' + escapeHtml(r.activity.label) + '</span></div>'
      );
      return (
        '<div class="rankup-card">' +
          '<div class="rankup-head">' +
            '<img class="rankup-avatar" src="' + avatarUrl(r.id, r.avatar) + '"/>' +
            '<span class="rankup-name">' + userLink(r.id, r.username) + '</span>' +
            '<span class="rankup-path">' + escapeHtml(r.currentRank) + ' → ' + escapeHtml(r.nextRank) + (r.eligible ? ' · <span class="eligible-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>eligible</span>' : '') + '</span>' +
          '</div>' +
          '<div class="rankup-progress">' + rows.join('') + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = String(count); el.style.display = ''; }
    else { el.style.display = 'none'; }
  }

  const STREAK_FIRE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
  const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function monthLabelHtml(dateObj, isFirst) {
    return '<div class="activity-cal-month-label' + (isFirst ? ' first' : '') + '">' + MONTH_NAMES[dateObj.getMonth()] + ' ' + dateObj.getFullYear() + '</div>';
  }
  function monthPadHtml(dateObj) {
    const pad = (dateObj.getDay() + 6) % 7;
    let html = '';
    for (let i = 0; i < pad; i++) html += '<div class="activity-day empty"></div>';
    return html;
  }
  function computeStreakDates(days) {
    const set = new Set();
    if (!days.length) return set;
    let idx = days.length - 1;
    if (!days[idx].active) {
      idx -= 1;
      if (idx < 0 || !days[idx].active) return set;
    }
    while (idx >= 0 && days[idx].active) {
      set.add(days[idx].date);
      idx--;
    }
    return set;
  }
  function renderActivityCalendar(containerId, days, opts) {
    opts = opts || {};
    const excuseDays = opts.excuseDays || {};
    const streakDates = computeStreakDates(days);
    const todayStr = new Date().toISOString().slice(0, 10);
    const joinedStr = opts.joinedDate ? new Date(opts.joinedDate).toISOString().slice(0, 10) : null;
    const kickedStr = opts.kickedDate ? new Date(opts.kickedDate).toISOString().slice(0, 10) : null;
    const weekdayHtml = WEEKDAY_LABELS.map(function (w) { return '<div class="activity-cal-weekday">' + w + '</div>'; }).join('');
    let bodyHtml = '';
    if (days.length) {
      const parts = days[0].date.split('-');
      const firstDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      bodyHtml += monthLabelHtml(firstDate, true) + monthPadHtml(firstDate);
    }
    days.forEach(function (d, i) {
      const dayNum = Number(d.date.slice(8, 10));
      if (i > 0 && dayNum === 1) {
        const parts = d.date.split('-');
        const monthStart = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
        bodyHtml += monthLabelHtml(monthStart, false) + monthPadHtml(monthStart);
      }
      const isToday = d.date === todayStr;
      const excuse = excuseDays[d.date];
      const inStreak = streakDates.has(d.date);
      const isJoined = joinedStr === d.date;
      const isKicked = kickedStr === d.date;
      const isPendingExcuse = excuse && (excuse.status || 'pending') === 'pending';
      const cls = 'activity-day' + (d.active ? ' active' : '') + (isToday && !d.active ? ' inactive-today' : '') + (excuse ? ' has-excuse' : '') + (isPendingExcuse ? ' is-pending-excuse' : '') + (inStreak ? ' in-streak' : '') + (isJoined ? ' is-joined' : '') + (isKicked ? ' is-kicked' : '');
      bodyHtml += '<div class="' + cls + '" data-date="' + d.date + '">' + (inStreak ? '<span class="streak-icon">' + STREAK_FIRE_SVG + '</span>' : dayNum) + '</div>';
    });
    document.getElementById(containerId).innerHTML = weekdayHtml + bodyHtml;
    if (opts.onExcuseClick) {
      document.querySelectorAll('#' + containerId + ' .activity-day.has-excuse').forEach(function (el) {
        el.addEventListener('click', function () { opts.onExcuseClick(excuseDays[el.dataset.date]); });
      });
    }
  }

  const excuseModal = document.getElementById('excuseModal');
  const excuseCalGrid = document.getElementById('excuseCalGrid');
  const excuseCalLabel = document.getElementById('excuseCalLabel');
  let excuseCalMonth = null;
  let excuseSelectedDays = new Set();
  let myActivityMap = {};
  let myExcuseDaysMap = {};

  function renderExcuseCalendar() {
    const year = excuseCalMonth.getFullYear(), month = excuseCalMonth.getMonth();
    excuseCalLabel.textContent = MONTH_NAMES[month] + ' ' + year;
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = localDateKey(new Date());
    let html = '';
    for (let i = 0; i < startOffset; i++) html += '<div class="lite-cal-day empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const key = localDateKey(new Date(year, month, day));
      const isSelected = excuseSelectedDays.has(key);
      const isToday = key === todayKey;
      const hasExcuse = !!myExcuseDaysMap[key];
      const isKnownDay = Object.prototype.hasOwnProperty.call(myActivityMap, key);
      const needsExcuse = !isToday && !hasExcuse && isKnownDay && !myActivityMap[key];
      const cls = 'lite-cal-day' + (isSelected ? ' selected' : '') + (isToday ? ' is-today' : '') + (needsExcuse ? ' needs-excuse' : '') + (hasExcuse ? ' has-excuse-marker' : '');
      html += '<div class="' + cls + '" data-date="' + key + '" title="' + (needsExcuse ? 'No excuse submitted for this inactive day' : hasExcuse ? 'Excuse already submitted' : '') + '">' + day + '</div>';
    }
    excuseCalGrid.innerHTML = html;
    excuseCalGrid.querySelectorAll('.lite-cal-day[data-date]').forEach(function (el) {
      el.addEventListener('click', function () {
        const key = el.dataset.date;
        if (excuseSelectedDays.has(key)) excuseSelectedDays.delete(key); else excuseSelectedDays.add(key);
        renderExcuseCalendar();
        updateExcuseDaysSummary();
      });
    });
  }
  function updateExcuseDaysSummary() {
    const n = excuseSelectedDays.size;
    document.getElementById('excuseDaysSummary').textContent = n ? (n + ' day' + (n === 1 ? '' : 's') + ' selected.') : 'No days selected.';
  }
  document.getElementById('excuseCalPrevBtn').addEventListener('click', function () { excuseCalMonth.setMonth(excuseCalMonth.getMonth() - 1); renderExcuseCalendar(); });
  document.getElementById('excuseCalNextBtn').addEventListener('click', function () { excuseCalMonth.setMonth(excuseCalMonth.getMonth() + 1); renderExcuseCalendar(); });

  function openExcuseModal() {
    document.getElementById('excuseReasonInput').value = '';
    excuseSelectedDays = new Set();
    excuseCalMonth = new Date();
    excuseCalMonth.setDate(1);
    renderExcuseCalendar();
    updateExcuseDaysSummary();
    excuseModal.classList.add('active');
  }
  document.getElementById('writeExcuseBtn').addEventListener('click', openExcuseModal);
  const writeExcuseBtn2 = document.getElementById('writeExcuseBtn2');
  if (writeExcuseBtn2) writeExcuseBtn2.addEventListener('click', openExcuseModal);
  document.getElementById('excuseCancelBtn').addEventListener('click', function () { excuseModal.classList.remove('active'); });
  excuseModal.addEventListener('click', function (e) { if (e.target === excuseModal) excuseModal.classList.remove('active'); });
  document.getElementById('excuseSubmitBtn').addEventListener('click', function () {
    const reason = document.getElementById('excuseReasonInput').value.trim();
    if (!reason) { showToast('Please write a reason.', 'error'); return; }
    if (!excuseSelectedDays.size) { showToast('Select at least one inactive day.', 'error'); return; }
    const btn = document.getElementById('excuseSubmitBtn');
    setBtnLoading(btn, true);
    callAdmin('staff.submitExcuse', { reason: reason, days: Array.from(excuseSelectedDays) }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Excuse submitted.', 'success');
        excuseModal.classList.remove('active');
        document.getElementById('inactivityBanner').style.display = 'none';
        if (currentView === 'excuses') loadExcuses();
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });

  function excusePillClass(status) {
    if (status === 'approved') return 'accepted';
    if (status === 'rejected') return 'denied';
    return 'pending';
  }
  function renderExcuseCard(e) {
    const daysList = (e.days || []).slice().sort().join(', ');
    const decideBtns = (!e.status || e.status === 'pending') ? '<button class="btn-small success" data-action="approve">Approve</button><button class="btn-small danger" data-action="reject">Reject</button>' : '';
    const deleteBtn = canPublishContent ? '<button class="btn-small danger" data-action="delete">Delete</button>' : '';
    return (
      '<div class="app-card" id="excuse-' + e.id + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user">' + userLink(e.userId, e.username || e.userId) + '</div>' +
          '<span class="pill ' + excusePillClass(e.status) + '">' + (e.status || 'pending') + '</span>' +
          ((decideBtns || deleteBtn) ? '<div class="app-card-actions">' + decideBtns + deleteBtn + '</div>' : '') +
        '</div>' +
        '<div class="app-card-details"><span>Was inactive: <strong>' + (e.inactiveDays > 30 ? '30+' : e.inactiveDays) + 'd</strong></span><span>Submitted: <strong>' + formatRelative(e.submittedAt) + '</strong></span>' + (daysList ? '<span>Days: <strong>' + escapeHtml(daysList) + '</strong></span>' : '') + '</div>' +
        '<div class="app-card-qa"><div><div class="app-card-q">Reason</div><div class="app-card-a">' + escapeHtml(e.reason) + '</div></div></div>' +
      '</div>'
    );
  }
  function wireExcuseActions(e) {
    const card = document.getElementById('excuse-' + e.id);
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.dataset.action;
        if (action === 'delete') {
          askConfirm('Delete excuse?', "Permanently removes " + (e.username || e.userId) + "'s excuse.", {}, function () {
            return callAdmin('staff.excuses.delete', { id: e.id }).then(function (d) {
              if (d && d.ok) { showToast('Excuse deleted.', 'success'); loadExcuses(); }
              else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
            });
          });
          return;
        }
        askConfirm(action === 'approve' ? 'Approve excuse?' : 'Reject excuse?', (e.username || e.userId) + "'s excuse.", {}, function () {
          return callAdmin('staff.excuses.decide', { id: e.id, decision: action }).then(function (d) {
            if (d && d.ok) { showToast('Excuse ' + action + 'd.', 'success'); loadExcuses(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }

  function loadExcuses() {
    document.getElementById('excusesAllPanel').style.display = canReviewApplications ? '' : 'none';
    const tasks = [
      callAdmin('staff.excuses.mine').then(function (d) {
        if (!d || !d.ok) return;
        const rows = d.excuses.map(function (e) {
          return '<tr><td style="max-width:320px;">' + escapeHtml(e.reason) + '</td><td class="mono">' + (e.days || []).length + 'd</td><td><span class="pill ' + excusePillClass(e.status) + '">' + (e.status || 'pending') + '</span></td><td class="mono">' + formatRelative(e.submittedAt) + '</td></tr>';
        }).join('') || emptyRow(4, "You haven't submitted any excuses yet.");
        document.getElementById('myExcusesTable').innerHTML =
          '<thead><tr><th>Reason</th><th>Days</th><th>Status</th><th>Submitted</th></tr></thead><tbody>' + rows + '</tbody>';
      })
    ];
    if (canReviewApplications) {
      tasks.push(callAdmin('staff.excuses.list').then(function (d) {
        if (!d || !d.ok) return;
        const list = document.getElementById('excusesList');
        list.innerHTML = d.excuses.map(renderExcuseCard).join('') || '<p style="color:var(--muted);font-size:13px;">No excuses submitted yet.</p>';
        d.excuses.forEach(wireExcuseActions);
      }));
    }
    return Promise.all(tasks);
  }
  function loadWarns() {
    document.getElementById('warnsAllPanel').style.display = canReviewApplications ? '' : 'none';
    const tasks = [
      callAdmin('staff.warns.mine').then(function (d) {
        if (!d || !d.ok) return;
        const rows = d.warns.map(function (w) {
          const statusPill = w.active ? '<span class="pill accepted">active</span>' : '<span class="pill denied">expired</span>';
          const expires = w.expiresAt ? formatDateTime(w.expiresAt) : 'Permanent';
          return '<tr><td style="max-width:280px;">' + escapeHtml(w.reason) + '</td><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(w.warnedBy, w.warnedByAvatar) + '"/>' + userLink(w.warnedBy, w.warnedByUsername || w.warnedBy) + '</span></td><td>' + statusPill + '</td><td class="mono">' + expires + '</td><td class="mono">' + formatRelative(w.warnedAt) + '</td></tr>';
        }).join('') || emptyRow(5, "You don't have any warnings — nice.");
        document.getElementById('myWarnsTable').innerHTML =
          '<thead><tr><th>Reason</th><th>Warned by</th><th>Status</th><th>Expires</th><th>Issued</th></tr></thead><tbody>' + rows + '</tbody>' +
          (d.total ? '<tfoot><tr><td colspan="5" class="mono" style="color:var(--muted);">' + d.total + ' total warning(s) on record</td></tr></tfoot>' : '');
      })
    ];
    if (canReviewApplications) {
      tasks.push(callAdmin('staff.warns.list').then(function (d) {
        if (!d || !d.ok) return;
        const rows = d.warns.map(function (w) {
          const statusPill = w.active ? '<span class="pill accepted">active</span>' : '<span class="pill denied">expired</span>';
          const expires = w.expiresAt ? formatDateTime(w.expiresAt) : 'Permanent';
          return '<tr><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(w.userId, w.targetAvatar) + '"/>' + userLink(w.userId, w.targetUsername || w.userId) + '</span></td><td style="max-width:280px;">' + escapeHtml(w.reason) + '</td><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(w.warnedBy, w.warnedByAvatar) + '"/>' + userLink(w.warnedBy, w.warnedByUsername || w.warnedBy) + '</span></td><td class="mono">' + (d.totals[w.userId] || 1) + '</td><td>' + statusPill + '</td><td class="mono">' + expires + '</td><td class="mono">' + formatRelative(w.warnedAt) + '</td><td><button class="btn-small danger" data-warn-delete-id="' + escapeHtml(w.id) + '" data-warn-delete-target="' + escapeHtml(w.userId) + '">Delete</button></td></tr>';
        }).join('') || emptyRow(8, 'No warnings issued yet.');
        const table = document.getElementById('warnsAllTable');
        table.innerHTML =
          '<thead><tr><th>Member</th><th>Reason</th><th>Warned by</th><th>Total</th><th>Status</th><th>Expires</th><th>Issued</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
        table.querySelectorAll('button[data-warn-delete-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const warnId = btn.dataset.warnDeleteId, targetId = btn.dataset.warnDeleteTarget;
            askConfirm('Delete this warning?', 'Permanently removes it from the record.', {}, function () {
              return callAdmin('staff.warns.delete', { id: warnId, targetId: targetId }).then(function (r) {
                if (r && r.ok) { showToast('Warning deleted.', 'success'); loadWarns(); }
                else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
              });
            });
          });
        });
      }));
    }
    return Promise.all(tasks);
  }

  const memberSearchInput = document.getElementById('memberSearchInput');
  const memberSearchBtn = document.getElementById('memberSearchBtn');
  const memberResults = document.getElementById('memberResults');

  function runMemberSearch() {
    const query = memberSearchInput.value.trim();
    if (!query) return;
    memberResults.innerHTML = '<p style="color:var(--muted);font-size:13px;">Searching…</p>';
    callAdmin('members.search', { query: query }).then(function (d) {
      if (!d || !d.ok) { memberResults.innerHTML = '<p style="color:var(--danger);font-size:13px;">Search failed.</p>'; return; }
      if (!d.members.length) { memberResults.innerHTML = '<p style="color:var(--muted);font-size:13px;">No members found.</p>'; return; }
      memberResults.innerHTML = d.members.map(function (m) { return renderMemberCard(m); }).join('');
      d.members.forEach(function (m) { wireMemberActions(m, document.getElementById('member-' + m.id), runMemberSearch); });
    });
  }
  memberSearchBtn.addEventListener('click', runMemberSearch);
  memberSearchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runMemberSearch(); });

  const TICKET_BAN_ROLE_ID = '1373379758150254653';
  function renderMemberCard(m, idPrefix) {
    idPrefix = idPrefix || 'member-';
    const roles = (m.roles || []).map(function (r) { return '<span class="pill" style="background:rgba(255,255,255,0.06);color:' + (r.color && r.color !== '#000000' ? r.color : 'var(--muted)') + ';">' + escapeHtml(r.name) + '</span>'; }).join(' ');
    const protectedTarget = (m.isStaff || m.isBot) && !canPublishContent;
    const modActions = protectedTarget
      ? '<span class="app-card-meta">' + (m.isBot ? 'Bots' : 'Staff members') + ' can only be managed by Management</span>'
      : (
          (m.isStaff && canKickStaff ? '<button class="btn-small danger" data-action="kickStaff" data-id="' + m.id + '">Kick from staff</button>' : '') +
          (m.timedOutUntil ? '<button class="btn-small success" data-action="removeTimeout" data-id="' + m.id + '">Remove timeout</button>' : '<button class="btn-small" data-action="timeout" data-id="' + m.id + '">Timeout</button>') +
          '<button class="btn-small danger" data-action="kick" data-id="' + m.id + '">Kick</button>' +
          (canReviewApplications ? '<button class="btn-small danger" data-action="ban" data-id="' + m.id + '">Ban</button>' : '')
        );
    const hasTicketBan = (m.roles || []).some(function (r) { return r.id === TICKET_BAN_ROLE_ID; });
    const ticketBanBtn = !m.isBot
      ? (hasTicketBan
          ? '<button class="btn-small success" data-action="ticketUnban" data-id="' + m.id + '">Ticket Unban</button>'
          : '<button class="btn-small danger" data-action="ticketBan" data-id="' + m.id + '">Ticket ban</button>')
      : '';
    const liteBtn = (canPublishContent && !m.isBot) ? '<button class="btn-small" data-lite-id="' + m.id + '" data-lite-name="' + escapeHtml(m.globalName || m.username) + '">Grant Lite</button>' : '';
    const grantMediaBtn = (canPublishContent && !m.isBot) ? '<button class="btn-small" data-grant-media-id="' + m.id + '" data-grant-media-name="' + escapeHtml(m.globalName || m.username) + '">Grant Media</button>' : '';
    const topRoleName = (m.roles || []).length ? m.roles[0].name : 'Unranked';
    const staffBtns = (m.isStaff && canReviewApplications)
      ? '<button class="btn-small" data-calendar-id="' + m.id + '" data-calendar-name="' + escapeHtml(m.globalName || m.username) + '">Activity</button>' +
        '<button class="btn-small danger" data-warn-id="' + m.id + '" data-warn-name="' + escapeHtml(m.globalName || m.username) + '">Warn</button>' +
        '<button class="btn-small" data-promote-id="' + m.id + '" data-promote-name="' + escapeHtml(m.globalName || m.username) + '" data-promote-rank="' + escapeHtml(topRoleName) + '">Promote</button>'
      : '';
    const creatorBtns = (m.isCreator && canPublishContent)
      ? '<button class="btn-small" data-change-code-id="' + m.id + '" data-change-code-name="' + escapeHtml(m.globalName || m.username) + '">Change code</button>' +
        '<button class="btn-small danger" data-delete-creator-id="' + m.id + '" data-delete-creator-name="' + escapeHtml(m.globalName || m.username) + '">Delete creator</button>'
      : '';
    const liteStatus = (m.lite && m.lite.gifted)
      ? '<span>Lite until <strong style="color:var(--success);">' + formatDateTime(Date.parse(m.lite.expiresAt)) + '</strong> (gifted)</span>'
      : (m.hasLiteRole ? '<span>Lite: <strong style="color:var(--success);">purchased</strong></span>' : '');
    return (
      '<div class="app-card" id="' + idPrefix + m.id + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' + escapeHtml(m.globalName || m.username) + ' <span class="app-card-meta">@' + escapeHtml(m.username) + ' · ' + m.id + '</span></div>' +
          '<div class="app-card-actions">' + modActions + ticketBanBtn + liteBtn + grantMediaBtn + staffBtns + creatorBtns + '</div>' +
        '</div>' +
        '<div class="app-card-details">' +
          '<span>Joined: <strong>' + formatDateTime(m.joinedAt ? Date.parse(m.joinedAt) : null) + '</strong></span>' +
          (m.timedOutUntil ? '<span>Timed out until: <strong style="color:var(--warning);">' + formatDateTime(Date.parse(m.timedOutUntil)) + '</strong></span>' : '') +
          liteStatus +
        '</div>' +
        (roles ? '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">' + roles + '</div>' : '') +
      '</div>'
    );
  }

  const MEMBER_ACTION_COPY = {
    kickStaff: { title: 'Kick from staff team', text: 'Removes their STAFF role and highest staff rank.', reason: true },
    timeout: { title: 'Timeout member', text: 'Mutes them for 24 hours.', reason: true },
    removeTimeout: { title: 'Remove timeout', text: 'Lifts their current timeout.', reason: false },
    kick: { title: 'Kick member', text: 'Removes them from the server. They can rejoin with a new invite.', reason: true },
    ban: { title: 'Ban member', text: 'Permanently bans them from the server.', reason: true },
    ticketBan: { title: 'Ticket ban', text: 'Prevents them from opening new tickets.', reason: true },
    ticketUnban: { title: 'Ticket unban', text: 'Allows them to open tickets again.', reason: false }
  };
  function wireMemberActions(m, card, onDone) {
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.dataset.action;
        const copy = MEMBER_ACTION_COPY[action];
        askConfirm(copy.title, copy.text + ' Target: ' + (m.globalName || m.username), { reason: copy.reason }, function (reason) {
          return callAdmin('members.action', {
            targetId: m.id, memberAction: action, reason: reason || undefined,
            durationMs: action === 'timeout' ? 24 * 60 * 60 * 1000 : undefined
          }).then(function (d) {
            if (d && d.ok) { showToast('Done.', 'success'); (onDone || runMemberSearch)(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
    const liteBtn = card.querySelector('button[data-lite-id]');
    if (liteBtn) liteBtn.addEventListener('click', function () { openLiteModal(liteBtn.dataset.liteId, liteBtn.dataset.liteName, onDone); });
    const grantMediaBtn = card.querySelector('button[data-grant-media-id]');
    if (grantMediaBtn) grantMediaBtn.addEventListener('click', function () { openGrantMediaModal(grantMediaBtn.dataset.grantMediaId, grantMediaBtn.dataset.grantMediaName, onDone); });
    const calendarBtn = card.querySelector('button[data-calendar-id]');
    if (calendarBtn) calendarBtn.addEventListener('click', function () { openStaffCalendar(calendarBtn.dataset.calendarId, calendarBtn.dataset.calendarName); });
    const warnBtn = card.querySelector('button[data-warn-id]');
    if (warnBtn) warnBtn.addEventListener('click', function () { openWarnModal(warnBtn.dataset.warnId, warnBtn.dataset.warnName); });
    const promoteBtn = card.querySelector('button[data-promote-id]');
    if (promoteBtn) promoteBtn.addEventListener('click', function () { openPromoteModal(promoteBtn.dataset.promoteId, promoteBtn.dataset.promoteName, promoteBtn.dataset.promoteRank); });
    const changeCodeBtn = card.querySelector('button[data-change-code-id]');
    if (changeCodeBtn) changeCodeBtn.addEventListener('click', function () { openChangeCodeModal(changeCodeBtn.dataset.changeCodeId, changeCodeBtn.dataset.changeCodeName); });
    const deleteCreatorBtn = card.querySelector('button[data-delete-creator-id]');
    if (deleteCreatorBtn) {
      deleteCreatorBtn.addEventListener('click', function () {
        const targetId = deleteCreatorBtn.dataset.deleteCreatorId, name = deleteCreatorBtn.dataset.deleteCreatorName;
        askConfirm('Delete ' + name + ' as a creator?', 'Deletes their Whop discount code, removes their Media/Partner/Partner+ role, and removes them from the Partners sheet. This cannot be undone.', {}, function () {
          return callAdmin('staff.deleteCreator', { targetId: targetId }).then(function (d) {
            if (d && d.ok) { showToast('Creator deleted.', 'success'); (onDone || runMemberSearch)(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    }
  }

  function userLink(id, label) {
    if (!id) return escapeHtml(label || '—');
    return '<span class="user-link" data-user-id="' + escapeHtml(id) + '">' + escapeHtml(label || id) + '</span>';
  }

  const memberModal = document.getElementById('memberModal');
  const memberModalBody = document.getElementById('memberModalBody');
  function openMemberModal(userId) {
    memberModalBody.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:6px 0;">Loading…</p>';
    memberModal.classList.add('active');
    callAdmin('members.search', { query: userId }).then(function (d) {
      if (!d || !d.ok || !d.members.length) {
        memberModalBody.innerHTML = '<p style="color:var(--danger);font-size:13px;padding:6px 0;">Member not found — they may have left the server.</p>';
        return;
      }
      const m = d.members[0];
      memberModalBody.innerHTML = renderMemberCard(m, 'modal-member-');
      wireMemberActions(m, document.getElementById('modal-member-' + m.id), function () { openMemberModal(userId); });
    });
  }
  document.addEventListener('click', function (e) {
    const link = e.target.closest('.user-link');
    if (link && link.dataset.userId) openMemberModal(link.dataset.userId);
  });
  document.getElementById('memberModalCloseBtn').addEventListener('click', function () { memberModal.classList.remove('active'); });
  memberModal.addEventListener('click', function (e) { if (e.target === memberModal) memberModal.classList.remove('active'); });

  const globalSearchModal = document.getElementById('globalSearchModal');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const globalSearchResults = document.getElementById('globalSearchResults');
  const GLOBAL_SEARCH_HINT = '<p style="color:var(--muted);font-size:13px;">Search by username, Discord ID, or creator code.</p>';
  let globalSearchSeq = 0;
  let globalSearchTimer = null;
  function openGlobalSearch() {
    globalSearchModal.classList.add('active');
    globalSearchInput.value = '';
    globalSearchResults.innerHTML = GLOBAL_SEARCH_HINT;
    setTimeout(function () { globalSearchInput.focus(); }, 50);
  }
  function closeGlobalSearch() { globalSearchModal.classList.remove('active'); }
  document.getElementById('globalSearchBtn').addEventListener('click', openGlobalSearch);
  globalSearchModal.addEventListener('click', function (e) { if (e.target === globalSearchModal) closeGlobalSearch(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && globalSearchModal.classList.contains('active')) closeGlobalSearch();
  });
  function renderGlobalSearchResults(members, creators) {
    if (!members.length && !creators.length) { globalSearchResults.innerHTML = '<p style="color:var(--muted);font-size:13px;">No matches.</p>'; return; }
    let html = '';
    if (members.length) {
      html += '<div class="global-search-group-label">Members</div>' + members.map(function (m) {
        return '<div class="global-search-row" data-user-id="' + escapeHtml(m.id) + '">' +
          '<img class="lb-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' +
          '<span class="lb-name">' + escapeHtml(m.globalName || m.username) + '</span>' +
          '<span class="app-card-meta">@' + escapeHtml(m.username) + '</span>' +
          (m.isStaff ? '<span class="pill">staff</span>' : '') +
        '</div>';
      }).join('');
    }
    if (creators.length) {
      html += '<div class="global-search-group-label">Creators</div>' + creators.map(function (c) {
        return '<div class="global-search-row" data-user-id="' + escapeHtml(c.id) + '">' +
          '<img class="lb-avatar" src="' + avatarUrl(c.id, c.avatar) + '"/>' +
          '<span class="lb-name">' + escapeHtml(c.globalName || c.username) + '</span>' +
          (c.code ? '<span class="pill">' + escapeHtml(c.code) + '</span>' : '') +
        '</div>';
      }).join('');
    }
    globalSearchResults.innerHTML = html;
    globalSearchResults.querySelectorAll('.global-search-row[data-user-id]').forEach(function (row) {
      row.addEventListener('click', function () { closeGlobalSearch(); openMemberModal(row.dataset.userId); });
    });
  }
  function runGlobalSearch() {
    const query = globalSearchInput.value.trim();
    if (!query) return;
    const mySeq = ++globalSearchSeq;
    callAdmin('search.global', { query: query }).then(function (d) {
      if (mySeq !== globalSearchSeq) return;
      if (!d || !d.ok) { globalSearchResults.innerHTML = '<p style="color:var(--danger);font-size:13px;">Search failed.</p>'; return; }
      renderGlobalSearchResults(d.members || [], d.creators || []);
    });
  }
  globalSearchInput.addEventListener('input', function () {
    clearTimeout(globalSearchTimer);
    if (!globalSearchInput.value.trim()) { globalSearchResults.innerHTML = GLOBAL_SEARCH_HINT; return; }
    globalSearchResults.innerHTML = '<p style="color:var(--muted);font-size:13px;">Searching…</p>';
    globalSearchTimer = setTimeout(runGlobalSearch, 300);
  });

  const liteModal = document.getElementById('liteModal');
  const liteCalGrid = document.getElementById('liteCalGrid');
  const liteCalLabel = document.getElementById('liteCalLabel');
  const liteSelectionSummary = document.getElementById('liteSelectionSummary');
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let liteTargetId = null;
  let liteOnDone = null;
  let liteCalMonth = null;
  let liteSelectedEnd = null;

  function localDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function renderLiteCalendar() {
    const today = startOfToday();
    const year = liteCalMonth.getFullYear(), month = liteCalMonth.getMonth();
    liteCalLabel.textContent = MONTH_NAMES[month] + ' ' + year;
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < startOffset; i++) html += '<div class="lite-cal-day empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const isPast = d < today;
      const inRange = liteSelectedEnd && d >= today && d <= liteSelectedEnd;
      const isEnd = liteSelectedEnd && localDateKey(d) === localDateKey(liteSelectedEnd);
      const cls = 'lite-cal-day' + (isPast ? ' past' : '') + (inRange ? ' in-range' : '') + (isEnd ? ' range-end' : '');
      html += '<div class="' + cls + '" data-date="' + localDateKey(d) + '">' + day + '</div>';
    }
    liteCalGrid.innerHTML = html;
    liteCalGrid.querySelectorAll('.lite-cal-day[data-date]').forEach(function (el) {
      el.addEventListener('click', function () {
        const parts = el.dataset.date.split('-');
        liteSelectedEnd = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        renderLiteCalendar();
        updateLiteSummary();
      });
    });
  }
  function updateLiteSummary() {
    if (!liteSelectedEnd) { liteSelectionSummary.textContent = 'No days selected.'; return; }
    const today = startOfToday();
    const days = Math.round((liteSelectedEnd - today) / 86400000) + 1;
    liteSelectionSummary.textContent = days + ' day' + (days === 1 ? '' : 's') + ' selected (through ' + liteSelectedEnd.toLocaleDateString() + ').';
  }
  document.getElementById('liteCalPrevBtn').addEventListener('click', function () {
    liteCalMonth.setMonth(liteCalMonth.getMonth() - 1);
    renderLiteCalendar();
  });
  document.getElementById('liteCalNextBtn').addEventListener('click', function () {
    liteCalMonth.setMonth(liteCalMonth.getMonth() + 1);
    renderLiteCalendar();
  });

  function openLiteModal(userId, name, onDone) {
    liteTargetId = userId;
    liteOnDone = onDone;
    liteSelectedEnd = null;
    liteCalMonth = new Date();
    liteCalMonth.setDate(1);
    document.getElementById('liteModalName').textContent = name;
    renderLiteCalendar();
    updateLiteSummary();
    liteModal.classList.add('active');
  }
  document.getElementById('liteModalCancelBtn').addEventListener('click', function () { liteModal.classList.remove('active'); });
  liteModal.addEventListener('click', function (e) { if (e.target === liteModal) liteModal.classList.remove('active'); });
  document.getElementById('liteModalGrantBtn').addEventListener('click', function () {
    if (!liteSelectedEnd || !liteTargetId) { showToast('Pick a day first.', 'error'); return; }
    const days = Math.round((liteSelectedEnd - startOfToday()) / 86400000) + 1;
    const btn = document.getElementById('liteModalGrantBtn');
    setBtnLoading(btn, true);
    callAdmin('members.grantLite', { targetId: liteTargetId, days: days, source: 'gift' }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Lite granted for ' + days + ' day(s).', 'success');
        liteModal.classList.remove('active');
        if (liteOnDone) liteOnDone();
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });
  const grantMediaModal = document.getElementById('grantMediaModal');
  let grantMediaTargetId = null, grantMediaOnDone = null;
  function openGrantMediaModal(userId, name, onDone) {
    grantMediaTargetId = userId;
    grantMediaOnDone = onDone;
    document.getElementById('grantMediaModalName').textContent = name;
    document.getElementById('grantMediaCodeInput').value = '';
    document.getElementById('grantMediaError').style.display = 'none';
    grantMediaModal.classList.add('active');
  }
  document.getElementById('grantMediaCancelBtn').addEventListener('click', function () { grantMediaModal.classList.remove('active'); });
  grantMediaModal.addEventListener('click', function (e) { if (e.target === grantMediaModal) grantMediaModal.classList.remove('active'); });
  document.getElementById('grantMediaSubmitBtn').addEventListener('click', function () {
    const code = document.getElementById('grantMediaCodeInput').value.trim();
    const errEl = document.getElementById('grantMediaError');
    if (!code || code.length < 3) {
      errEl.textContent = 'Enter a code (at least 3 characters).';
      errEl.style.display = '';
      return;
    }
    if (!grantMediaTargetId) return;
    const btn = document.getElementById('grantMediaSubmitBtn');
    setBtnLoading(btn, true);
    callAdmin('staff.grantMedia', { targetId: grantMediaTargetId, code: code }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Granted Media with code ' + d.code + '.', 'success');
        grantMediaModal.classList.remove('active');
        if (grantMediaOnDone) grantMediaOnDone();
      } else {
        errEl.textContent = 'Failed: ' + (d && d.error || 'unknown error');
        errEl.style.display = '';
      }
    });
  });

  const LB_PAGE_SIZE = 10;
  const lbData = { mostActive: [], playtime: [], staffLeaderboard: [] };
  const lbExpanded = { mostActive: false, playtime: false, staffLeaderboard: false };

  function renderMostActiveTable() {
    const rows = lbData.mostActive.slice(0, lbExpanded.mostActive ? undefined : LB_PAGE_SIZE).map(function (a, i) {
      return '<tr><td class="mono">#' + (i + 1) + '</td><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(a.userId, a.avatar) + '"/>' + userLink(a.userId, a.username || a.userId) + '</span></td><td class="mono">' + a.messageCount + '</td></tr>';
    }).join('') || emptyRow(3, 'No chat activity recorded this week yet.');
    document.getElementById('mostActiveTable').innerHTML =
      '<thead><tr><th>#</th><th>Member</th><th>Messages</th></tr></thead><tbody>' + rows + '</tbody>';
  }
  function renderPlaytimeTable() {
    const rows = lbData.playtime.slice(0, lbExpanded.playtime ? undefined : LB_PAGE_SIZE).map(function (p, i) {
      return '<tr><td class="mono">#' + (i + 1) + '</td><td>' + escapeHtml(p.username) + (p.isLite ? ' <span class="pill accepted" style="margin-left:6px;">LITE</span>' : '') + '</td><td class="mono">' + formatDuration(p.ms) + '</td></tr>';
    }).join('') || emptyRow(3, 'No playtime recorded yet this month.');
    document.getElementById('playtimeTable').innerHTML =
      '<thead><tr><th>#</th><th>Player</th><th>Playtime</th></tr></thead><tbody>' + rows + '</tbody>';
  }
  function renderStaffLeaderboardTable() {
    const rows = lbData.staffLeaderboard.slice(0, lbExpanded.staffLeaderboard ? undefined : LB_PAGE_SIZE).map(function (s, i) {
      return '<tr><td class="mono">#' + (i + 1) + '</td><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.userId, s.avatar) + '"/>' + userLink(s.userId, s.username || s.userId) + '</span></td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + formatDuration(s.totalResolutionMs) + '</td></tr>';
    }).join('') || emptyRow(5, 'No staff activity recorded yet.');
    document.getElementById('staffLeaderboardTable').innerHTML =
      '<thead><tr><th>#</th><th>Member</th><th>Solved</th><th>Claims</th><th>Avg. handling</th></tr></thead><tbody>' + rows + '</tbody>';
  }
  const LB_RENDERERS = { mostActive: renderMostActiveTable, playtime: renderPlaytimeTable, staffLeaderboard: renderStaffLeaderboardTable };
  document.querySelectorAll('.lb-more-btn[data-lb]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const key = btn.dataset.lb;
      lbExpanded[key] = !lbExpanded[key];
      btn.textContent = lbExpanded[key] ? 'Show less' : 'Show more';
      LB_RENDERERS[key]();
    });
  });
  function loadLeaderboard() {
    return callAdmin('leaderboard').then(function (d) {
      if (!d || !d.ok) return;
      lbData.mostActive = d.mostActive || [];
      lbData.playtime = d.monthly || [];
      lbData.staffLeaderboard = d.staffLeaderboard || [];
      renderMostActiveTable();
      renderPlaytimeTable();
      renderStaffLeaderboardTable();
    });
  }
  function readableRankColor(hex) {
    if (!hex) return '#6b8fa8';
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.25 ? '#6b8fa8' : hex;
  }

  let lastStaffList = [];
  let staffSortDir = 'desc';
  let staffSortMode = 'activity';
  const STAFF_SORT_KEYS = {
    activity: function (s) { return s.weeklyMessages || 0; },
    rank: function (s) { return s.rankIndex != null ? s.rankIndex : -1; }
  };
  function renderStaffTable(list) {
    const keyFn = STAFF_SORT_KEYS[staffSortMode] || STAFF_SORT_KEYS.activity;
    const sorted = list.slice().sort(function (a, b) {
      const diff = keyFn(b) - keyFn(a);
      return staffSortDir === 'asc' ? -diff : diff;
    });
    const rows = sorted.map(function (s) {
      const color = readableRankColor(s.rankColor);
      const rankPill = s.rank ? '<span class="pill" style="background:' + color + '1a;color:' + color + ';">' + escapeHtml(s.rank) + '</span>' : '—';
      const actions = canReviewApplications
        ? '<button class="btn-small" data-calendar-id="' + s.id + '" data-calendar-name="' + escapeHtml(s.tag) + '">Activity</button> ' +
          '<button class="btn-small danger" data-warn-id="' + s.id + '" data-warn-name="' + escapeHtml(s.tag) + '">Warn</button> ' +
          '<button class="btn-small" data-promote-id="' + s.id + '" data-promote-name="' + escapeHtml(s.tag) + '" data-promote-rank="' + escapeHtml(s.rank || 'Unranked') + '">Promote</button>' +
          (canKickStaff ? ' <button class="btn-small danger" data-kick-id="' + s.id + '" data-kick-name="' + escapeHtml(s.tag) + '">Kick</button>' : '')
        : '';
      const streak = (s.currentStreak || 0) > 0 ? '<span class="streak-icon">' + STREAK_FIRE_SVG + '</span>' + s.currentStreak : '—';
      return '<tr><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.id, s.avatar) + '"/>' + userLink(s.id, s.tag) + '</span></td><td>' + rankPill + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + s.unclaimedTickets + '</td><td class="mono">' + streak + '</td><td class="mono">' + (s.reviewCount || 0) + '</td><td class="mono">' + (s.weeklyMessages || 0) + '</td><td>' + actions + '</td></tr>';
    }).join('') || emptyRow(9, 'No staff members found.');
    const table = document.getElementById('staffTable');
    table.innerHTML =
      '<thead><tr><th>Member</th><th>Rank</th><th>Solved</th><th>Claims</th><th>Unclaimed</th><th>Streak</th><th>Reviews</th><th>Messages (7d)</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
    table.querySelectorAll('button[data-calendar-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openStaffCalendar(btn.dataset.calendarId, btn.dataset.calendarName); });
    });
    table.querySelectorAll('button[data-promote-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openPromoteModal(btn.dataset.promoteId, btn.dataset.promoteName, btn.dataset.promoteRank); });
    });
    table.querySelectorAll('button[data-warn-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openWarnModal(btn.dataset.warnId, btn.dataset.warnName);
      });
    });
    table.querySelectorAll('button[data-kick-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.dataset.kickId, name = btn.dataset.kickName;
        askConfirm('Kick from staff team?', 'Removes the STAFF role and highest staff rank from ' + name + '.', { reason: true }, function (reason) {
          return callAdmin('members.action', { targetId: id, memberAction: 'kickStaff', reason: reason || undefined }).then(function (d) {
            if (d && d.ok) { showToast('Kicked from staff team.', 'success'); loadStaff(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }
  const staffSortToggle = document.getElementById('staffSortToggle');
  if (staffSortToggle) {
    staffSortToggle.addEventListener('click', function () {
      staffSortDir = staffSortDir === 'desc' ? 'asc' : 'desc';
      staffSortToggle.dataset.dir = staffSortDir;
      staffSortToggle.innerHTML = (staffSortDir === 'desc' ? 'Highest first' : 'Lowest first') + ' <span class="sort-arrow">↓</span>';
      renderStaffTable(lastStaffList);
    });
  }
  document.querySelectorAll('#staffSortMode .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#staffSortMode .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      staffSortMode = btn.dataset.sort;
      renderStaffTable(lastStaffList);
    });
  });
  function loadStaff() {
    return callAdmin('staff.list').then(function (d) {
      if (!d || !d.ok) return;
      lastStaffList = d.staff;
      renderStaffTable(lastStaffList);
    });
  }

  const EXCUSE_STATUS_META = {
    excused: { cls: 'accepted', label: 'Excused' },
    pending: { cls: 'pending', label: 'Pending review' },
    none: { cls: 'denied', label: 'No excuse' },
    active: { cls: 'auto', label: 'Active' }
  };
  let currentStaffActivityFilter = 'inactive';
  document.querySelectorAll('#staffActivityFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#staffActivityFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentStaffActivityFilter = btn.dataset.filter;
      loadStaffActivity(currentStaffActivityFilter);
    });
  });
  function renderStaffActivityTable(list, filter) {
    const rows = list
      .filter(function (s) { return filter === 'all' || s.daysSinceLastActive >= 2; })
      .map(function (s) {
        const color = readableRankColor(s.rankColor);
        const rankPill = s.rank ? '<span class="pill" style="background:' + color + '1a;color:' + color + ';">' + escapeHtml(s.rank) + '</span>' : '—';
        const meta = EXCUSE_STATUS_META[s.excuseStatus] || EXCUSE_STATUS_META.none;
        const excusePill = '<span class="pill ' + meta.cls + '">' + meta.label + '</span>';
        const inactiveLabel = s.daysSinceLastActive <= 0 ? 'Active today' : s.daysSinceLastActive + 'd';
        const warnsLabel = s.activeWarnsCount > 0 ? '<span style="color:var(--danger);">' + s.activeWarnsCount + '</span>' : '0';
        const actions =
          '<button class="btn-small" data-calendar-id="' + s.id + '" data-calendar-name="' + escapeHtml(s.tag) + '">Activity</button> ' +
          '<button class="btn-small danger" data-warn-id="' + s.id + '" data-warn-name="' + escapeHtml(s.tag) + '">Warn</button>';
        return '<tr><td><span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.id, s.avatar) + '"/>' + userLink(s.id, s.tag) + '</span></td><td>' + rankPill + '</td><td class="mono">' + inactiveLabel + '</td><td>' + excusePill + '</td><td class="mono">' + warnsLabel + '</td><td>' + actions + '</td></tr>';
      }).join('') || emptyRow(6, filter === 'all' ? 'No staff members found.' : "No one's flagged inactive right now.");
    const table = document.getElementById('staffActivityTable');
    table.innerHTML =
      '<thead><tr><th>Member</th><th>Rank</th><th>Inactive for</th><th>Excuse</th><th>Warns</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
    table.querySelectorAll('button[data-calendar-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openStaffCalendar(btn.dataset.calendarId, btn.dataset.calendarName); });
    });
    table.querySelectorAll('button[data-warn-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openWarnModal(btn.dataset.warnId, btn.dataset.warnName); });
    });
  }
  function loadStaffActivity(filter) {
    return callAdmin('staff.activity').then(function (d) {
      if (!d || !d.ok) return;
      lastStaffActivityList = d.activity;
      renderStaffActivityTable(lastStaffActivityList, filter);
    });
  }
  let lastStaffActivityList = [];

  function renderExcuseDetailBox(boxId, excuse) {
    const box = document.getElementById(boxId);
    box.style.display = '';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><strong>Excuse</strong><span class="pill ' + excusePillClass(excuse.status) + '">' + escapeHtml(excuse.status) + '</span><span class="app-card-meta" style="margin-left:auto;">' + formatRelative(excuse.submittedAt) + '</span></div>' +
      '<div style="font-size:13px;color:var(--text);">' + escapeHtml(excuse.reason) + '</div>';
  }
  const EXCUSES_HISTORY_CAP = 4;
  function renderExcusesHistoryList(listId, moreBtnId, excuses, onItemClick) {
    const list = document.getElementById(listId);
    const moreBtn = moreBtnId ? document.getElementById(moreBtnId) : null;
    if (!excuses.length) {
      list.innerHTML = '<div class="calendar-excuses-empty">No excuses submitted yet.</div>';
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }
    const shown = excuses.slice(0, EXCUSES_HISTORY_CAP);
    list.innerHTML = shown.map(function (e, i) {
      const pending = (e.status || 'pending') === 'pending';
      return '<div class="calendar-excuse-item' + (pending ? ' pending' : '') + '" data-excuse-index="' + i + '">' +
        '<div class="calendar-excuse-item-head"><span class="pill ' + excusePillClass(e.status) + '">' + escapeHtml(e.status || 'pending') + '</span></div>' +
        '<div class="calendar-excuse-item-reason">' + escapeHtml(e.reason || '') + '</div>' +
        '<div class="calendar-excuse-item-meta">' + formatRelative(e.submittedAt) + '</div>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.calendar-excuse-item').forEach(function (el) {
      el.addEventListener('click', function () { onItemClick(shown[parseInt(el.dataset.excuseIndex, 10)]); });
    });
    if (moreBtn) moreBtn.style.display = excuses.length > EXCUSES_HISTORY_CAP ? '' : 'none';
  }

  const calendarModal = document.getElementById('calendarModal');
  let currentCalendarTargetId = null, currentCalendarTargetName = null;
  function openStaffCalendar(userId, name) {
    currentCalendarTargetId = userId;
    currentCalendarTargetName = name;
    document.getElementById('calendarModalName').textContent = name;
    document.getElementById('calendarModalGrid').innerHTML = '';
    document.getElementById('calendarModalWarnings').innerHTML = '';
    document.getElementById('calendarModalStats').innerHTML = '';
    document.getElementById('calendarModalExcuses').innerHTML = '';
    document.getElementById('calendarModalExcuseDetail').style.display = 'none';
    calendarModal.classList.add('active');
    callAdmin('staff.calendar', { targetId: userId, days: 30 }).then(function (d) {
      if (!d || !d.ok) return;
      if (d.stats) {
        renderStatGrid('calendarModalStats', [
          [d.stats.messagesToday, 'Messages today'],
          [d.stats.weeklyMessages, 'Messages this week'],
          [d.stats.solvedTickets, 'Solved tickets'],
          [d.stats.totalClaims, 'Total claims'],
          [d.stats.unclaimedTickets, 'Unclaims'],
          [d.stats.currentStreak, 'Current streak'],
          [d.stats.peakStreak, 'Peak streak'],
          [d.stats.reviewCount, 'Reviews']
        ]);
      }
      renderActivityCalendar('calendarModalGrid', d.calendar || [], {
        excuseDays: d.excuseDays || {},
        joinedDate: d.joinedStaffAt, kickedDate: d.kickedAt,
        onExcuseClick: function (excuse) { renderExcuseDetailBox('calendarModalExcuseDetail', excuse); }
      });
      renderExcusesHistoryList('calendarModalExcuses', 'calendarModalExcusesMoreBtn', d.excuses || [], function (excuse) {
        renderExcuseDetailBox('calendarModalExcuseDetail', excuse);
      });
      const warnings = d.warnings || [];
      document.getElementById('calendarModalWarnings').innerHTML = warnings.length
        ? '<div class="panel-sub" style="margin-bottom:8px;">' + warnings.length + ' warning(s)</div>' + warnings.map(function (w) {
            return '<div class="app-card"><div class="app-card-details"><span>' + formatDateTime(w.warnedAt) + ' by <strong>' + escapeHtml(w.warnedByUsername || w.warnedBy) + '</strong></span></div><div class="app-card-a" style="margin-top:8px;">' + escapeHtml(w.reason) + '</div></div>';
          }).join('')
        : '';
    });
  }
  document.getElementById('calendarModalCloseBtn').addEventListener('click', function () { calendarModal.classList.remove('active'); });
  document.getElementById('calendarModalExcusesMoreBtn').addEventListener('click', function () { calendarModal.classList.remove('active'); });

  const fullActivityModal = document.getElementById('fullActivityModal');
  const FULL_ACTIVITY_DAYS = 90;
  function openFullActivityModal(userId, name) {
    document.getElementById('fullActivityModalName').textContent = name;
    document.getElementById('fullActivityModalGrid').innerHTML = '';
    document.getElementById('fullActivityModalWarnings').innerHTML = '';
    document.getElementById('fullActivityModalStats').innerHTML = '';
    document.getElementById('fullActivityModalExcuseDetail').style.display = 'none';
    fullActivityModal.classList.add('active');
    callAdmin('staff.calendar', { targetId: userId, days: FULL_ACTIVITY_DAYS }).then(function (d) {
      if (!d || !d.ok) return;
      if (d.stats) {
        renderStatGrid('fullActivityModalStats', [
          [d.stats.messagesToday, 'Messages today'],
          [d.stats.weeklyMessages, 'Messages this week'],
          [d.stats.solvedTickets, 'Solved tickets'],
          [d.stats.totalClaims, 'Total claims'],
          [d.stats.unclaimedTickets, 'Unclaims'],
          [d.stats.currentStreak, 'Current streak'],
          [d.stats.peakStreak, 'Peak streak'],
          [d.stats.reviewCount, 'Reviews']
        ]);
      }
      renderActivityCalendar('fullActivityModalGrid', d.calendar || [], {
        excuseDays: d.excuseDays || {},
        joinedDate: d.joinedStaffAt, kickedDate: d.kickedAt,
        onExcuseClick: function (excuse) { renderExcuseDetailBox('fullActivityModalExcuseDetail', excuse); }
      });
      const warnings = d.warnings || [];
      document.getElementById('fullActivityModalWarnings').innerHTML = warnings.length
        ? '<div class="panel-sub" style="margin-bottom:8px;">' + warnings.length + ' warning(s)</div>' + warnings.map(function (w) {
            return '<div class="app-card"><div class="app-card-details"><span>' + formatDateTime(w.warnedAt) + ' by <strong>' + escapeHtml(w.warnedByUsername || w.warnedBy) + '</strong></span></div><div class="app-card-a" style="margin-top:8px;">' + escapeHtml(w.reason) + '</div></div>';
          }).join('')
        : '';
    });
  }
  document.getElementById('calendarModalFullBtn').addEventListener('click', function () {
    calendarModal.classList.remove('active');
    openFullActivityModal(currentCalendarTargetId, currentCalendarTargetName);
  });
  document.getElementById('fullActivityModalCloseBtn').addEventListener('click', function () { fullActivityModal.classList.remove('active'); });
  fullActivityModal.addEventListener('click', function (e) { if (e.target === fullActivityModal) fullActivityModal.classList.remove('active'); });
  calendarModal.addEventListener('click', function (e) { if (e.target === calendarModal) calendarModal.classList.remove('active'); });

  const promoteModal = document.getElementById('promoteModal');
  let currentPromoteTargetId = null;
  function openPromoteModal(userId, name, rank) {
    currentPromoteTargetId = userId;
    document.getElementById('promoteTargetName').textContent = name;
    document.getElementById('promoteTargetPath').textContent = 'Current rank: ' + rank;
    document.getElementById('promoteReasonInput').value = '';
    promoteModal.classList.add('active');
  }
  document.getElementById('promoteCancelBtn').addEventListener('click', function () { promoteModal.classList.remove('active'); });
  promoteModal.addEventListener('click', function (e) { if (e.target === promoteModal) promoteModal.classList.remove('active'); });
  document.getElementById('promoteSubmitBtn').addEventListener('click', function () {
    const reason = document.getElementById('promoteReasonInput').value.trim();
    if (!reason || !currentPromoteTargetId) { showToast('Please write a reason.', 'error'); return; }
    const btn = document.getElementById('promoteSubmitBtn');
    setBtnLoading(btn, true);
    callAdmin('staff.promote', { targetId: currentPromoteTargetId, reason: reason }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Promoted to ' + d.newRank + '.', 'success');
        promoteModal.classList.remove('active');
        loadStaff();
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });

  const warnModal = document.getElementById('warnModal');
  let currentWarnTargetId = null;
  function openWarnModal(userId, name) {
    currentWarnTargetId = userId;
    document.getElementById('warnTargetName').textContent = name;
    document.getElementById('warnReasonInput').value = '';
    document.getElementById('warnDurationInput').value = '';
    warnModal.classList.add('active');
  }
  document.getElementById('warnCancelBtn').addEventListener('click', function () { warnModal.classList.remove('active'); });
  warnModal.addEventListener('click', function (e) { if (e.target === warnModal) warnModal.classList.remove('active'); });
  document.getElementById('warnSubmitBtn').addEventListener('click', function () {
    const reason = document.getElementById('warnReasonInput').value.trim();
    const duration = document.getElementById('warnDurationInput').value.trim();
    if (!reason || !currentWarnTargetId) { showToast('Please write a reason.', 'error'); return; }
    const btn = document.getElementById('warnSubmitBtn');
    setBtnLoading(btn, true);
    callAdmin('staff.warn', { targetId: currentWarnTargetId, reason: reason, duration: duration }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast(duration ? 'Temporary warning issued.' : 'Warning issued.', 'success');
        warnModal.classList.remove('active');
        if (currentView === 'staffActivity') loadStaffActivity(currentStaffActivityFilter); else loadStaff();
      } else if (d && d.error === 'invalid_duration') {
        showToast('Could not parse that duration — try e.g. 7d, 12h, 30m.', 'error');
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });

  let currentStaffAppsFilter = 'pending';
  let currentStaffAppsRole = '';
  document.querySelectorAll('#staffAppsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#staffAppsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentStaffAppsFilter = btn.dataset.status;
      loadStaffApps(currentStaffAppsFilter);
    });
  });
  document.querySelectorAll('#staffAppsRoleFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#staffAppsRoleFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentStaffAppsRole = btn.dataset.role;
      loadStaffApps(currentStaffAppsFilter);
    });
  });
  function loadStaffApps(status) {
    return callAdmin('staffApplications.list', { status: status, role: currentStaffAppsRole }).then(function (d) {
      if (!d || !d.ok) return;
      const list = document.getElementById('staffAppsList');
      if (!d.applications.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No applications here.</p>'; return; }
      const roles = d.roles || {};
      list.innerHTML = d.applications.map(function (a) {
        const roleInfo = roles[a.role || 'staff'] || {};
        return renderStaffAppCard(a, roleInfo.fields || d.questionLabels, roleInfo.label || 'Staff Team');
      }).join('');
      d.applications.forEach(wireStaffAppActions);
    });
  }
  function renderRecruitment(roles) {
    const list = document.getElementById('recruitmentList');
    list.innerHTML = Object.keys(roles).map(function (id) {
      const r = roles[id];
      return '<label class="recruitment-row' + (r.open ? '' : ' closed') + '" data-role-id="' + escapeHtml(id) + '">' +
        '<span>' + escapeHtml(r.label) + '</span>' +
        '<span class="pill ' + (r.open ? 'accepted' : 'denied') + '">' + (r.open ? 'open' : 'closed') + '</span>' +
        '<span class="switch"><input type="checkbox"' + (r.open ? ' checked' : '') + '/><span class="switch-track"></span></span>' +
      '</label>';
    }).join('');
    list.querySelectorAll('.recruitment-row input').forEach(function (input) {
      input.addEventListener('change', function () {
        const row = input.closest('.recruitment-row');
        const roleId = row.dataset.roleId;
        input.disabled = true;
        callAdmin('staffApplications.setRecruitment', { roleId: roleId, open: input.checked }).then(function (d) {
          if (d && d.ok) {
            showToast((roles[roleId] ? roles[roleId].label : roleId) + ' applications ' + (input.checked ? 'opened.' : 'closed.'), 'success');
            renderRecruitment(d.roles || roles);
          } else {
            input.checked = !input.checked;
            input.disabled = false;
            showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          }
        });
      });
    });
  }
  function loadRecruitment() {
    return callAdmin('staffApplications.getRecruitment').then(function (d) {
      if (d && d.ok && d.roles) renderRecruitment(d.roles);
    });
  }

  const AUTOREPLY_MODES = { auto: 'Auto (learn)', on: 'Always on', off: 'Off' };
  let autoreplyCustomRules = [];
  function autoreplyPrecision(r) {
    return r.precision == null ? '—' : Math.round(r.precision * 100) + '%';
  }
  function autoreplyStatePill(r) {
    if (r.override === 'off') return '<span class="pill denied">forced off</span>';
    if (r.override === 'on') return '<span class="pill accepted">forced on</span>';
    if (r.state !== 'active') return '<span class="pill denied" title="' + escapeHtml(r.reason || '') + '">paused</span>';
    return '<span class="pill ' + (r.reason === 'learning' ? 'auto' : 'accepted') + '">' + (r.reason === 'learning' ? 'learning' : 'active') + '</span>';
  }
  function autoreplyModeSelect(key, value) {
    return '<select class="text-input autoreply-mode" data-key="' + escapeHtml(key) + '">' + Object.keys(AUTOREPLY_MODES).map(function (m) {
      return '<option value="' + m + '"' + (value === m ? ' selected' : '') + '>' + AUTOREPLY_MODES[m] + '</option>';
    }).join('') + '</select>';
  }
  function bindAutoreplyModes(table) {
    table.querySelectorAll('.autoreply-mode').forEach(function (sel) {
      sel.addEventListener('change', function () {
        sel.disabled = true;
        callAdmin('autoreply.setOverride', { key: sel.dataset.key, mode: sel.value }).then(function (d) {
          if (d && d.ok) { showToast('Auto reply mode saved.', 'success'); loadAutoreplies(); }
          else { showToast('Failed: ' + (d && d.error || 'unknown error'), 'error'); sel.disabled = false; }
        });
      });
    });
  }
  function renderAutoreplies(d) {
    const builtinTable = document.getElementById('autoreplyBuiltinTable');
    builtinTable.innerHTML = '<thead><tr><th>Rule</th><th>Good</th><th>Wrong</th><th>Precision</th><th>State</th><th>Mode</th></tr></thead><tbody>' +
      (d.builtin.map(function (r) {
        return '<tr><td><strong>' + escapeHtml(r.key) + '</strong><div class="autoreply-desc">' + escapeHtml(r.label) + '</div></td>' +
          '<td class="mono">' + r.good + (r.weak ? ' <span class="autoreply-weak" title="' + r.weak + ' counted as good because nobody marked them within 24h">(' + r.weak + ' silent)</span>' : '') + '</td>' +
          '<td class="mono">' + r.bad + '</td><td class="mono">' + autoreplyPrecision(r) + '</td><td>' + autoreplyStatePill(r) + '</td><td>' + autoreplyModeSelect(r.key, r.override) + '</td></tr>';
      }).join('') || emptyRow(6, 'No built-in rules.')) + '</tbody>';
    bindAutoreplyModes(builtinTable);

    autoreplyCustomRules = d.custom || [];
    const customTable = document.getElementById('autoreplyCustomTable');
    customTable.innerHTML = '<thead><tr><th>Name</th><th>Keywords</th><th>Reply</th><th>Good / Wrong</th><th>State</th><th>Mode</th><th></th></tr></thead><tbody>' +
      (autoreplyCustomRules.map(function (r) {
        const flags = [r.requireAll ? 'all keywords' : 'any keyword', r.ticketOnly ? 'tickets only' : 'everywhere', r.plain ? 'plain' : 'embed'].join(' · ');
        return '<tr data-rule-id="' + escapeHtml(r.id) + '"' + (r.enabled ? '' : ' style="opacity:0.55;"') + '>' +
          '<td><strong>' + escapeHtml(r.name) + '</strong><div class="autoreply-desc">' + escapeHtml(flags) + (r.enabled ? '' : ' · disabled') + '</div></td>' +
          '<td>' + (r.keywords || []).map(function (k) { return '<span class="pill report">' + escapeHtml(k) + '</span>'; }).join(' ') + '</td>' +
          '<td class="autoreply-reply">' + escapeHtml(String(r.reply || '').slice(0, 140)) + (String(r.reply || '').length > 140 ? '…' : '') + '</td>' +
          '<td class="mono">' + r.good + ' / ' + r.bad + '</td><td>' + autoreplyStatePill(r) + '</td><td>' + autoreplyModeSelect('custom:' + r.id, r.override) + '</td>' +
          '<td><button type="button" class="btn-small" data-autoreply-edit="' + escapeHtml(r.id) + '">Edit</button> <button type="button" class="btn-small danger" data-autoreply-delete="' + escapeHtml(r.id) + '">Delete</button></td></tr>';
      }).join('') || emptyRow(7, 'No custom replies yet. Click "+ New reply" to add one.')) + '</tbody>';
    bindAutoreplyModes(customTable);
    customTable.querySelectorAll('[data-autoreply-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const rule = autoreplyCustomRules.find(function (r) { return r.id === btn.dataset.autoreplyEdit; });
        if (rule) openAutoreplyForm(rule);
      });
    });
    customTable.querySelectorAll('[data-autoreply-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const rule = autoreplyCustomRules.find(function (r) { return r.id === btn.dataset.autoreplyDelete; });
        askConfirm('Delete this auto reply?', (rule ? '"' + rule.name + '"' : 'This reply') + ' will stop triggering immediately.', {}, function () {
          return callAdmin('autoreply.deleteCustom', { id: btn.dataset.autoreplyDelete }).then(function (r) {
            if (r && r.ok) { showToast('Auto reply deleted.', 'success'); loadAutoreplies(); }
            else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
          });
        });
      });
    });

    const feedbackTable = document.getElementById('autoreplyFeedbackTable');
    feedbackTable.innerHTML = '<thead><tr><th>When</th><th>Rule</th><th>Mark</th><th>User message</th><th>By</th></tr></thead><tbody>' +
      ((d.recent || []).map(function (e) {
        return '<tr><td class="mono">' + formatRelative(e.at) + '</td><td class="mono">' + escapeHtml(e.ruleKey) + '</td>' +
          '<td><span class="pill ' + (e.label === 'bad' ? 'denied' : 'accepted') + '">' + (e.label === 'bad' ? 'wrong reply' : 'solved') + '</span></td>' +
          '<td class="autoreply-reply">' + escapeHtml(String(e.text || '').slice(0, 160)) + '</td>' +
          '<td>' + (e.by ? userLink(e.by, e.byUsername || e.by) : '—') + '</td></tr>';
      }).join('') || emptyRow(5, 'No feedback yet.')) + '</tbody>';
  }
  function loadAutoreplies() {
    return callAdmin('autoreply.overview').then(function (d) {
      if (d && d.ok) renderAutoreplies(d);
      else if (d && d.error) showToast('Could not load auto replies: ' + d.error, 'error');
    });
  }
  let autoreplyEditingId = null;
  function openAutoreplyForm(rule) {
    autoreplyEditingId = rule ? rule.id : null;
    document.getElementById('autoreplyName').value = rule ? rule.name : '';
    document.getElementById('autoreplyKeywords').value = rule ? (rule.keywords || []).join(', ') : '';
    document.getElementById('autoreplyReply').value = rule ? rule.reply : '';
    document.getElementById('autoreplyRequireAll').checked = !!(rule && rule.requireAll);
    document.getElementById('autoreplyTicketOnly').checked = rule ? rule.ticketOnly !== false : true;
    document.getElementById('autoreplyPlain').checked = !!(rule && rule.plain);
    document.getElementById('autoreplyEnabled').checked = rule ? rule.enabled !== false : true;
    document.querySelector('#autoreplySaveBtn .btn-label').textContent = rule ? 'Save changes' : 'Save reply';
    document.getElementById('autoreplyForm').style.display = '';
    document.getElementById('autoreplyName').focus();
  }
  function closeAutoreplyForm() {
    autoreplyEditingId = null;
    document.getElementById('autoreplyForm').style.display = 'none';
  }
  document.getElementById('autoreplyNewBtn').addEventListener('click', function () { openAutoreplyForm(null); });
  document.getElementById('autoreplyCancelBtn').addEventListener('click', closeAutoreplyForm);
  document.getElementById('autoreplySaveBtn').addEventListener('click', function () {
    const btn = document.getElementById('autoreplySaveBtn');
    const payload = {
      id: autoreplyEditingId,
      name: document.getElementById('autoreplyName').value.trim(),
      keywords: document.getElementById('autoreplyKeywords').value.split(',').map(function (k) { return k.trim(); }).filter(Boolean),
      reply: document.getElementById('autoreplyReply').value.trim(),
      requireAll: document.getElementById('autoreplyRequireAll').checked,
      ticketOnly: document.getElementById('autoreplyTicketOnly').checked,
      plain: document.getElementById('autoreplyPlain').checked,
      enabled: document.getElementById('autoreplyEnabled').checked
    };
    if (!payload.name || !payload.keywords.length || !payload.reply) { showToast('Name, at least one keyword and a reply are required.', 'error'); return; }
    setBtnLoading(btn, true);
    callAdmin('autoreply.saveCustom', payload).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) { showToast('Auto reply saved.', 'success'); closeAutoreplyForm(); loadAutoreplies(); }
      else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
    });
  });
  function scamFilterPct(v) { return v == null ? '—' : Math.round(v * 100) + ' %'; }
  function scamFilterReasonText(score) {
    if (!score) return '—';
    if (score.reason === 'similar_to_report') return scamFilterPct(score.similarity) + ' similar to a report';
    if (score.reason === 'bayes') return 'probability ' + scamFilterPct(score.pScam);
    return escapeHtml(String(score.reason || '').replace(/_/g, ' '));
  }
  function scamFilterReviewPill(review) {
    if (!review) return '<span class="pill pending">awaiting review</span>';
    return review.label === 'wrong'
      ? '<span class="pill denied">wrong deletion</span>'
      : '<span class="pill accepted">confirmed scam</span>';
  }
  function renderScamFilter(d) {
    const s = d.settings || {};
    const st = d.stats || {};
    document.getElementById('scamFilterStats').innerHTML = [
      [st.deletedToday || 0, 'Deleted today', st.deletedToday > 0 ? 'warn' : ''],
      [st.deletedTotal || 0, 'Deleted total'],
      [st.pendingReview || 0, 'Awaiting review', st.pendingReview > 0 ? 'warn' : ''],
      [st.samples || 0, 'Learned scam examples'],
      [st.hamMessages || 0, 'Normal messages learned'],
      [st.reviewedWrong || 0, 'Wrong deletions', st.reviewedWrong > 0 ? 'danger' : '']
    ].map(function (c) {
      return '<div class="stat-card"><div class="num ' + (c[2] || '') + '">' + c[0] + '</div><div class="label">' + c[1] + '</div></div>';
    }).join('');
    let state, cls;
    if (!s.enabled) { state = 'Off — nothing is deleted automatically.'; cls = 'off'; }
    else if (d.paused) { state = 'Paused since ' + formatRelative(d.paused.at) + ' (' + escapeHtml(d.paused.reason || 'too many wrong deletions') + '). Resume it once you have reviewed the recent deletions.'; cls = 'paused'; }
    else if ((st.samples || 0) < (s.minSamples || 0)) { state = 'Learning — copies of reported scams are deleted right away, probability-based deletion starts at ' + s.minSamples + ' learned examples (' + (st.samples || 0) + ' so far).'; cls = 'learning'; }
    else { state = 'Active — deleting messages that look like the learned scams.'; cls = 'active'; }
    const statusEl = document.getElementById('scamFilterStatus');
    statusEl.className = 'scamfilter-status ' + cls;
    statusEl.textContent = state;
    document.getElementById('scamFilterThreshold').value = Math.round((s.threshold || 0.95) * 100);
    document.getElementById('scamFilterSimilarity').value = Math.round((s.similarity || 0.75) * 100);
    document.getElementById('scamFilterMinSamples').value = s.minSamples || 8;
    document.getElementById('scamFilterMinTokens').value = s.minTokens || 4;
    document.getElementById('scamFilterPauseAfter').value = s.pauseAfterFalsePositives || 3;
    document.getElementById('scamFilterEnabled').checked = s.enabled !== false;
    document.getElementById('scamFilterTimeout').checked = !!s.timeoutOnDelete;
    document.getElementById('scamFilterResumeBtn').style.display = d.paused ? '' : 'none';
    const badge = document.getElementById('badgeScamFilter');
    if (badge) { badge.textContent = st.pendingReview || 0; badge.style.display = st.pendingReview > 0 ? '' : 'none'; }

    const recentTable = document.getElementById('scamFilterRecentTable');
    recentTable.innerHTML = '<thead><tr><th>When</th><th>User</th><th>Message</th><th>Why</th><th>Review</th><th></th></tr></thead><tbody>' +
      ((d.recent || []).map(function (e) {
        const user = e.targetUserId
          ? '<span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(e.targetUserId, e.targetAvatar) + '"/>' + userLink(e.targetUserId, e.targetUsername || e.targetUserId) + '</span>'
          : '—';
        const reviewBy = e.review && e.review.by ? '<div class="autoreply-desc">by ' + userLink(e.review.by, e.review.byUsername || e.review.by) + ' · ' + formatRelative(e.review.at) + '</div>' : '';
        const actions = '<button type="button" class="btn-small danger" data-scamfilter-review="wrong" data-id="' + escapeHtml(e.id) + '"' + (e.review && e.review.label === 'wrong' ? ' disabled' : '') + '>Wrong</button> ' +
          '<button type="button" class="btn-small success" data-scamfilter-review="ok" data-id="' + escapeHtml(e.id) + '"' + (e.review && e.review.label === 'ok' ? ' disabled' : '') + '>Confirm</button>';
        return '<tr><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td>' + user + '</td>' +
          '<td class="autoreply-reply">' + escapeHtml(String(e.messageContent || '').slice(0, 200)) + '</td>' +
          '<td class="mono">' + scamFilterReasonText(e.filterScore) + (e.timedOut ? '<div class="autoreply-desc">timed out 24 h</div>' : '') + '</td>' +
          '<td>' + scamFilterReviewPill(e.review) + reviewBy + '</td><td style="white-space:nowrap;">' + actions + '</td></tr>';
      }).join('') || emptyRow(6, 'The filter has not deleted anything yet.')) + '</tbody>';
    recentTable.querySelectorAll('button[data-scamfilter-review]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const label = btn.dataset.scamfilterReview;
        const run = function () {
          return callAdmin('scamfilter.review', { id: btn.dataset.id, label: label }).then(function (r) {
            if (r && r.ok) { showToast(label === 'wrong' ? 'Marked as wrong deletion — the filter learned from it.' + (r.paused ? ' The filter paused itself.' : '') : 'Confirmed as scam.', 'success'); loadScamFilter(); }
            else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
          });
        };
        if (label === 'wrong') askConfirm('Mark as wrong deletion?', 'The message goes on the safe list and its report (if any) stops being used as an example.', {}, run);
        else run();
      });
    });

    const samplesTable = document.getElementById('scamFilterSamplesTable');
    samplesTable.innerHTML = '<thead><tr><th>When</th><th>Source</th><th>Text</th><th>Sender</th><th>State</th><th></th></tr></thead><tbody>' +
      ((d.samples || []).map(function (e) {
        let state;
        if (e.ignored) state = '<span class="pill denied">ignored</span>';
        else if (e.pendingReview) state = '<span class="pill pending">not confirmed</span>';
        else if (e.active) state = '<span class="pill accepted">used</span>';
        else state = '<span class="pill">unused</span>';
        const btn = e.pendingReview ? '' : '<button type="button" class="btn-small' + (e.ignored ? '' : ' danger') + '" data-scamfilter-ignore="' + (e.ignored ? '0' : '1') + '" data-id="' + escapeHtml(e.id) + '">' + (e.ignored ? 'Use again' : 'Ignore') + '</button>';
        return '<tr><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td><span class="pill ' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span>' + (e.reporterUsername ? '<div class="autoreply-desc">' + escapeHtml(e.reporterUsername) + '</div>' : '') + '</td>' +
          '<td class="autoreply-reply">' + escapeHtml(e.text) + '</td><td>' + (e.targetUserId ? userLink(e.targetUserId, e.targetUsername || e.targetUserId) : '—') + '</td><td>' + state + '</td><td>' + btn + '</td></tr>';
      }).join('') || emptyRow(6, 'No examples yet — scam reports with text will show up here.')) + '</tbody>';
    samplesTable.querySelectorAll('button[data-scamfilter-ignore]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        callAdmin('scamfilter.ignoreSample', { id: btn.dataset.id, ignored: btn.dataset.scamfilterIgnore === '1' }).then(function (r) {
          if (r && r.ok) { showToast(btn.dataset.scamfilterIgnore === '1' ? 'Example ignored.' : 'Example is used again.', 'success'); loadScamFilter(); }
          else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
        });
      });
    });
  }
  function loadScamFilter() {
    return callAdmin('scamfilter.overview').then(function (d) {
      if (d && d.ok) renderScamFilter(d);
      else if (d && d.error) showToast('Could not load the scam filter: ' + d.error, 'error');
    });
  }
  function scamFilterSettingsPayload() {
    return {
      enabled: document.getElementById('scamFilterEnabled').checked,
      timeoutOnDelete: document.getElementById('scamFilterTimeout').checked,
      threshold: Number(document.getElementById('scamFilterThreshold').value) / 100,
      similarity: Number(document.getElementById('scamFilterSimilarity').value) / 100,
      minSamples: Number(document.getElementById('scamFilterMinSamples').value),
      minTokens: Number(document.getElementById('scamFilterMinTokens').value),
      pauseAfterFalsePositives: Number(document.getElementById('scamFilterPauseAfter').value)
    };
  }
  document.getElementById('scamFilterSaveBtn').addEventListener('click', function () {
    const btn = document.getElementById('scamFilterSaveBtn');
    setBtnLoading(btn, true);
    callAdmin('scamfilter.saveSettings', { settings: scamFilterSettingsPayload() }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) { showToast('Scam filter settings saved.', 'success'); loadScamFilter(); }
      else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
    });
  });
  document.getElementById('scamFilterResumeBtn').addEventListener('click', function () {
    callAdmin('scamfilter.saveSettings', { settings: scamFilterSettingsPayload(), resume: true }).then(function (d) {
      if (d && d.ok) { showToast('Scam filter resumed.', 'success'); loadScamFilter(); }
      else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
    });
  });
  document.getElementById('scamFilterTestBtn').addEventListener('click', function () {
    const text = document.getElementById('scamFilterTestText').value.trim();
    const out = document.getElementById('scamFilterTestResult');
    if (!text) { out.textContent = 'Paste a message first.'; return; }
    out.textContent = 'Scoring…';
    callAdmin('scamfilter.test', { text: text }).then(function (d) {
      if (!d || !d.ok) { out.textContent = 'Failed: ' + (d && d.error || 'unknown error'); return; }
      const r = d.decision;
      const verdict = r.action === 'delete' ? 'Would delete' : 'Would keep';
      out.innerHTML = '<span class="pill ' + (r.action === 'delete' ? 'denied' : 'accepted') + '">' + verdict + '</span> ' +
        escapeHtml(String(r.reason || '').replace(/_/g, ' ')) + ' · probability ' + scamFilterPct(r.pScam) + ' · closest example ' + scamFilterPct(r.similarity) +
        (r.matched ? ' (' + escapeHtml(r.matched.type) + ': ' + escapeHtml(String(r.matched.text || '').slice(0, 80)) + ')' : '') + ' · ' + r.tokens + ' words';
    });
  });
  function renderStaffAppCard(a, labels, roleLabel) {
    const qa = (labels || []).map(function (pair) {
      const key = pair[0], label = pair[1];
      const val = a.answers ? a.answers[key] : null;
      if (!val) return '';
      return '<div><div class="app-card-q">' + escapeHtml(label) + '</div><div class="app-card-a">' + escapeHtml(val) + '</div></div>';
    }).join('');
    const extra = (a.extra ? '<div><div class="app-card-q">Anything else</div><div class="app-card-a">' + escapeHtml(a.extra) + '</div></div>' : '') +
      (a.status === 'denied' && a.denyReason ? '<div><div class="app-card-q">Denial reason</div><div class="app-card-a" style="color:var(--danger);">' + escapeHtml(a.denyReason) + '</div></div>' : '');
    return (
      '<div class="app-card" id="staffapp-' + a.discordId + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user">' + userLink(a.discordId, a.username || a.discordId) + ' <span class="app-card-meta">' + a.discordId + '</span></div>' +
          '<span class="pill">' + escapeHtml(roleLabel || 'Staff Team') + '</span>' +
          '<span class="pill ' + a.status + '">' + a.status + '</span>' +
          (a.status === 'pending' ? '<div class="app-card-actions"><button class="btn-small success" data-action="accept">Accept</button><button class="btn-small danger" data-action="deny">Deny</button></div>' : '') +
        '</div>' +
        '<div class="app-card-details"><span>Applied: <strong>' + formatRelative(a.appliedAt) + '</strong></span>' + (a.decidedAt ? '<span>Decided: <strong>' + formatRelative(a.decidedAt) + '</strong></span>' : '') + '</div>' +
        '<div class="app-card-qa">' + qa + extra + '</div>' +
      '</div>'
    );
  }
  function wireStaffAppActions(a) {
    const card = document.getElementById('staffapp-' + a.discordId);
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const decision = btn.dataset.action;
        const opts = decision === 'deny' ? { reason: true, okLabel: 'Deny' } : { tone: 'primary', okLabel: 'Accept' };
        askConfirm(decision === 'accept' ? 'Accept application?' : 'Deny application?', (a.username || a.discordId) + "'s staff application." + (decision === 'deny' ? ' You can add a reason — the applicant will see it.' : ''), opts, function (reason) {
          return callAdmin('staffApplications.decide', { discordId: a.discordId, decision: decision, reason: reason || undefined }).then(function (d) {
            if (d && d.ok) { showToast('Application ' + decision + 'ed.', 'success'); loadStaffApps(currentStaffAppsFilter); loadOverview(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }
  let currentReportsFilter = '';
  document.querySelectorAll('#reportsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#reportsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentReportsFilter = btn.dataset.category;
      loadBugReports(currentReportsFilter);
    });
  });
  function loadBugReports(category) {
    return callAdmin('bugReports.list', { category: category }).then(function (d) {
      if (!d || !d.ok) return;
      const list = document.getElementById('reportsList');
      if (!d.reports.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No bug reports here.</p>'; return; }
      list.innerHTML = d.reports.map(renderReportCard).join('');
    });
  }
  function reportDownloadUrl(reportId, file) {
    return 'https://bot.frostclient.eu/bug-reports/download?token=' + encodeURIComponent(loadToken())
      + '&reportId=' + encodeURIComponent(reportId) + '&file=' + encodeURIComponent(file);
  }
  function renderReportCard(r) {
    const details = [
      ['Description', r.description],
      ['Mods', r.isModded ? (r.modList || 'Yes') : 'No (vanilla instance)'],
      ['Attached link', r.linkUrl]
    ].filter(function (p) { return p[1]; }).map(function (p) {
      return '<div><div class="app-card-q">' + escapeHtml(p[0]) + '</div><div class="app-card-a">' + escapeHtml(p[1]) + '</div></div>';
    }).join('');
    const files = [r.buglogFileName].concat(r.attachmentFileNames || []).filter(Boolean);
    const fileLinks = files.map(function (f) {
      return '<a class="btn-small" href="' + reportDownloadUrl(r.reportId, f) + '" target="_blank" rel="noopener">' + escapeHtml(f) + '</a>';
    }).join(' ');
    return (
      '<div class="app-card" id="report-' + escapeHtml(r.reportId) + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(r.discordId, r.avatar) + '"/>' + userLink(r.discordId, r.username || r.discordId) + ' <span class="app-card-meta">' + r.discordId + '</span></div>' +
          '<span class="pill">' + escapeHtml(r.category || 'Unknown') + '</span>' +
        '</div>' +
        '<div class="app-card-details"><span>Reported: <strong>' + formatRelative(r.createdAt) + '</strong></span></div>' +
        '<div class="app-card-qa">' + details + '</div>' +
        '<div class="app-card-actions" style="margin-top:10px;">' + fileLinks + '</div>' +
      '</div>'
    );
  }

  let lastPartnerLogs = [];
  function loadPartnerLogs() {
    return callAdmin('partnerSignupLogs.list', {}).then(function (d) {
      if (!d || !d.ok) return;
      lastPartnerLogs = d.logs;
      renderPartnerLogsList();
    });
  }
  function renderPartnerLogsList() {
    const query = (document.getElementById('creatorsSearchInput').value || '').trim().toLowerCase();
    const filtered = !query ? lastPartnerLogs : lastPartnerLogs.filter(function (l) {
      return (l.username || '').toLowerCase().indexOf(query) !== -1 || String(l.discordId || '').indexOf(query) !== -1 || (l.code || '').toLowerCase().indexOf(query) !== -1;
    });
    const list = document.getElementById('partnerLogsList');
    if (!filtered.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">' + (lastPartnerLogs.length ? 'No matches.' : 'No signups logged yet.') + '</p>'; return; }
    list.innerHTML = filtered.map(renderPartnerLogCard).join('');
    filtered.forEach(wirePartnerLogActions);
  }
  const creatorsSearchInput = document.getElementById('creatorsSearchInput');
  if (creatorsSearchInput) creatorsSearchInput.addEventListener('input', renderPartnerLogsList);
  function renderPartnerLogCard(l) {
    const logId = l.id || (l.discordId + '_' + l.loggedAt);
    const details = [
      ['Code', l.code], ['Promoting at', l.socialLink],
      ['Granted by', l.grantedBy ? ('Staff (' + l.grantedBy + ')') : null]
    ].filter(function (p) { return p[1]; }).map(function (p) {
      return '<div><div class="app-card-q">' + escapeHtml(p[0]) + '</div><div class="app-card-a">' + escapeHtml(p[1]) + '</div></div>';
    }).join('');
    return (
      '<div class="app-card" id="creator-' + escapeHtml(logId) + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(l.discordId, l.avatar) + '"/>' + userLink(l.discordId, l.username || l.discordId) + ' <span class="app-card-meta">' + l.discordId + '</span></div>' +
          (l.grantedBy ? '<span class="pill manual">staff grant</span>' : (l.hasSignupLog === false ? '<span class="pill manual">role only — no signup record</span>' : '')) +
          '<div class="app-card-actions">' +
            '<button class="btn-small" data-change-code-id="' + escapeHtml(l.discordId) + '" data-change-code-name="' + escapeHtml(l.username || l.discordId) + '">Change code</button>' +
            '<button class="btn-small danger" data-delete-creator-id="' + escapeHtml(l.discordId) + '" data-delete-creator-name="' + escapeHtml(l.username || l.discordId) + '">Delete creator</button>' +
          '</div>' +
        '</div>' +
        '<div class="app-card-details"><span>Signed up: <strong>' + formatRelative(l.loggedAt) + '</strong></span></div>' +
        '<div class="app-card-qa">' + details + '</div>' +
      '</div>'
    );
  }
  function wirePartnerLogActions(l) {
    const logId = l.id || (l.discordId + '_' + l.loggedAt);
    const card = document.getElementById('creator-' + logId);
    if (!card) return;
    const changeBtn = card.querySelector('button[data-change-code-id]');
    if (changeBtn) changeBtn.addEventListener('click', function () { openChangeCodeModal(changeBtn.dataset.changeCodeId, changeBtn.dataset.changeCodeName); });
    const deleteBtn = card.querySelector('button[data-delete-creator-id]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        const targetId = deleteBtn.dataset.deleteCreatorId, name = deleteBtn.dataset.deleteCreatorName;
        askConfirm('Delete ' + name + ' as a creator?', 'Deletes their Whop discount code, removes their Media/Partner/Partner+ role, and removes them from the Partners sheet. This cannot be undone.', {}, function () {
          return callAdmin('staff.deleteCreator', { targetId: targetId }).then(function (d) {
            if (d && d.ok) { showToast('Creator deleted.', 'success'); loadPartnerLogs(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    }
  }
  const changeCodeModal = document.getElementById('changeCodeModal');
  const changeCodeInput = document.getElementById('changeCodeInput');
  const changeCodeStatus = document.getElementById('changeCodeStatus');
  let changeCodeTargetId = null;
  let changeCodeCheckTimer = null, changeCodeCheckSeq = 0;
  function setChangeCodeStatus(state, text) {
    changeCodeStatus.className = 'code-check-status' + (state ? ' ' + state : '');
    changeCodeStatus.textContent = text || '';
  }
  function openChangeCodeModal(userId, name) {
    changeCodeTargetId = userId;
    document.getElementById('changeCodeModalName').textContent = name;
    changeCodeInput.value = '';
    setChangeCodeStatus(null, '');
    document.getElementById('changeCodeError').style.display = 'none';
    changeCodeModal.classList.add('active');
  }
  changeCodeInput.addEventListener('input', function () {
    const raw = changeCodeInput.value.trim();
    clearTimeout(changeCodeCheckTimer);
    const mySeq = ++changeCodeCheckSeq;
    if (!raw) { setChangeCodeStatus(null, ''); return; }
    if (raw.length < 3) { setChangeCodeStatus('taken', 'At least 3 characters.'); return; }
    setChangeCodeStatus('checking', 'Checking…');
    changeCodeCheckTimer = setTimeout(function () {
      callAdmin('staff.codeCheck', { code: raw, excludeDiscordId: changeCodeTargetId || '' }).then(function (d) {
        if (mySeq !== changeCodeCheckSeq) return;
        if (d && d.ok && d.available) {
          setChangeCodeStatus('available', 'Available');
        } else {
          const reason = d && d.reason;
          setChangeCodeStatus('taken', reason === 'blocked' ? 'Not allowed — pick a different code.' : reason === 'invalid' ? 'Letters and numbers only.' : 'Already in use');
        }
      }).catch(function () {
        if (mySeq !== changeCodeCheckSeq) return;
        setChangeCodeStatus(null, '');
      });
    }, 450);
  });
  document.getElementById('changeCodeCancelBtn').addEventListener('click', function () { changeCodeModal.classList.remove('active'); });
  changeCodeModal.addEventListener('click', function (e) { if (e.target === changeCodeModal) changeCodeModal.classList.remove('active'); });
  document.getElementById('changeCodeSubmitBtn').addEventListener('click', function () {
    const code = changeCodeInput.value.trim();
    const errEl = document.getElementById('changeCodeError');
    errEl.style.display = 'none';
    if (!code || code.length < 3) {
      errEl.textContent = 'Enter a code (at least 3 characters).';
      errEl.style.display = '';
      return;
    }
    if (!changeCodeTargetId) return;
    const btn = document.getElementById('changeCodeSubmitBtn');
    setBtnLoading(btn, true);
    callAdmin('staff.changeMediaCode', { targetId: changeCodeTargetId, newCode: code }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Code changed to ' + d.code + '.', 'success');
        changeCodeModal.classList.remove('active');
        loadPartnerLogs();
      } else {
        errEl.textContent = 'Failed: ' + (d && d.error || 'unknown error');
        errEl.style.display = '';
      }
    });
  });

  let lastBannedWords = [];
  function loadBannedWords() {
    return callAdmin('bannedWords.list', {}).then(function (d) {
      if (!d || !d.ok) return;
      lastBannedWords = d.words || [];
      renderBannedWordsList();
    });
  }
  function renderBannedWordsList() {
    const list = document.getElementById('bannedWordsList');
    if (!lastBannedWords.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No blocked words yet.</p>'; return; }
    list.innerHTML = lastBannedWords.map(function (w) {
      return '<span class="banned-word-chip">' +
        '<span class="banned-word-text" data-edit-word="' + escapeHtml(w) + '" title="Click to rename">' + escapeHtml(w) + '</span>' +
        '<button type="button" class="danger" data-delete-word="' + escapeHtml(w) + '" aria-label="Delete" title="Delete">✕</button>' +
      '</span>';
    }).join('');
    // All three actions below update lastBannedWords + re-render immediately (optimistic), then
    // fire the actual request in the background - the round trip to Code.gs (itself relayed
    // through the bot) is slow enough that waiting for it before showing the change made the list
    // feel laggy. On failure the local change is rolled back and the list re-synced from the
    // server, so it never stays out of sync with what's actually blocked.
    list.querySelectorAll('button[data-delete-word]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const word = btn.dataset.deleteWord;
        const previous = lastBannedWords;
        lastBannedWords = lastBannedWords.filter(function (w) { return w !== word; });
        renderBannedWordsList();
        callAdmin('bannedWords.delete', { word: word }).then(function (d) {
          if (!d || !d.ok) {
            showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
            lastBannedWords = previous;
            renderBannedWordsList();
          }
        });
      });
    });
    list.querySelectorAll('.banned-word-text[data-edit-word]').forEach(function (el) {
      el.addEventListener('click', function () {
        const oldWord = el.dataset.editWord;
        const newWord = window.prompt('Rename "' + oldWord + '" to:', oldWord);
        if (!newWord || !newWord.trim() || newWord.trim().toLowerCase() === oldWord.toLowerCase()) return;
        const trimmed = newWord.trim();
        const previous = lastBannedWords;
        lastBannedWords = lastBannedWords.map(function (w) { return w === oldWord ? trimmed : w; });
        renderBannedWordsList();
        callAdmin('bannedWords.update', { oldWord: oldWord, newWord: trimmed }).then(function (d) {
          if (!d || !d.ok) {
            showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
            lastBannedWords = previous;
            renderBannedWordsList();
          }
        });
      });
    });
  }
  const bannedWordAddBtn = document.getElementById('bannedWordAddBtn');
  if (bannedWordAddBtn) {
    bannedWordAddBtn.addEventListener('click', function () {
      const input = document.getElementById('bannedWordInput');
      const word = input.value.trim();
      if (!word) return;
      if (lastBannedWords.some(function (w) { return w.toLowerCase() === word.toLowerCase(); })) {
        showToast('That word is already blocked.', 'error');
        return;
      }
      const previous = lastBannedWords;
      lastBannedWords = lastBannedWords.concat([word]);
      input.value = '';
      renderBannedWordsList();
      callAdmin('bannedWords.add', { word: word }).then(function (d) {
        if (!d || !d.ok) {
          // "already_exists" here means this admin's view was stale even after the client-side
          // check above (e.g. someone else added it between page load and now) - resync from the
          // server rather than just rolling back, so the list reflects what's actually blocked.
          showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          lastBannedWords = previous;
          renderBannedWordsList();
          loadBannedWords();
        }
      });
    });
    document.getElementById('bannedWordInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') bannedWordAddBtn.click(); });
  }
  let currentPartnerRankupFilter = 'pending';
  document.querySelectorAll('#partnerRankupFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#partnerRankupFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentPartnerRankupFilter = btn.dataset.status;
      loadPartnerRankupRequests(currentPartnerRankupFilter);
    });
  });
  const TIER_LABELS = { media: 'Media', partner: 'Partner', partner_plus: 'Partner+' };
  function loadPartnerRankupRequests(status) {
    return callAdmin('partnerRankupRequests.list', { status: status }).then(function (d) {
      if (!d || !d.ok) return;
      const list = document.getElementById('partnerRankupList');
      if (!d.requests.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No rankup requests here.</p>'; return; }
      list.innerHTML = d.requests.map(renderRankupRequestCard).join('');
      d.requests.forEach(wireRankupRequestActions);
    });
  }
  function renderRankupRequestCard(r) {
    const details = [
      ['Current tier', TIER_LABELS[r.currentTier] || r.currentTier],
      ['Requesting', TIER_LABELS[r.requestedTier] || r.requestedTier],
      ['Total orders', r.totalOrders], ['Followers', r.followers], ['Profile link', r.profileLink]
    ].filter(function (p) { return p[1] || p[1] === 0; }).map(function (p) {
      return '<div><div class="app-card-q">' + escapeHtml(String(p[0])) + '</div><div class="app-card-a">' + escapeHtml(String(p[1])) + '</div></div>';
    }).join('');
    return (
      '<div class="app-card" id="partnerrankup-' + r.discordId + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user">' + userLink(r.discordId, r.username || r.discordId) + ' <span class="app-card-meta">' + r.discordId + '</span></div>' +
          '<span class="pill ' + r.status + '">' + r.status + '</span>' +
          (r.status === 'pending' ? '<div class="app-card-actions"><button class="btn-small success" data-action="accept">Accept</button><button class="btn-small danger" data-action="deny">Deny</button></div>' : '') +
          (r.sheetSyncPending ? '<div class="app-card-actions"><button class="btn-small warn" data-mark-synced-id="' + r.discordId + '">Sheet not updated — mark done</button></div>' : '') +
        '</div>' +
        '<div class="app-card-details"><span>Requested: <strong>' + formatRelative(r.requestedAt) + '</strong></span>' + (r.decidedAt ? '<span>Decided: <strong>' + formatRelative(r.decidedAt) + '</strong></span>' : '') + '</div>' +
        '<div class="app-card-qa">' + details + '</div>' +
      '</div>'
    );
  }
  function wireRankupRequestActions(r) {
    const card = document.getElementById('partnerrankup-' + r.discordId);
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const decision = btn.dataset.action;
        const note = decision === 'accept' ? ' Their Discord role will be swapped immediately.' : '';
        askConfirm(decision === 'accept' ? 'Accept rankup request?' : 'Deny rankup request?', (r.username || r.discordId) + "'s request to rank up to " + (TIER_LABELS[r.requestedTier] || r.requestedTier) + '.' + note, {}, function () {
          return callAdmin('partnerRankupRequests.decide', { discordId: r.discordId, decision: decision }).then(function (d) {
            if (d && d.ok) { showToast('Rankup request ' + decision + 'ed.', 'success'); loadPartnerRankupRequests(currentPartnerRankupFilter); loadOverview(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
    const markSyncedBtn = card.querySelector('button[data-mark-synced-id]');
    if (markSyncedBtn) {
      markSyncedBtn.addEventListener('click', function () {
        callAdmin('partnerRankupRequests.markSheetSynced', { discordId: r.discordId }).then(function (d) {
          if (d && d.ok) { showToast('Marked as updated.', 'success'); loadPartnerRankupRequests(currentPartnerRankupFilter); }
          else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
        });
      });
    }
  }
  let currentScamsFilter = '';
  document.querySelectorAll('#scamsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#scamsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentScamsFilter = btn.dataset.type;
      loadScams(currentScamsFilter);
    });
  });
  let loadedScamEntries = [];
  function loadScams(type) {
    return callAdmin('scams.list', { type: type, limit: 200 }).then(function (d) {
      if (!d || !d.ok) return;
      loadedScamEntries = d.entries;
      const rows = d.entries.map(function (e, i) {
        const target = e.targetUserId
          ? '<span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(e.targetUserId, e.targetAvatar) + '"/>' + userLink(e.targetUserId, e.targetUsername || e.targetUserId) + '</span>'
          : '—';
        const content = e.messageContent ? escapeHtml(e.messageContent).slice(0, 80) : '<span style="color:var(--muted-dim);">(no text)</span>';
        const actionerId = e.actorId || e.reporterId;
        const actionedBy = actionerId
          ? '<span class="cell-user"><img class="cell-avatar" src="' + avatarUrl(actionerId, e.actorAvatar) + '"/>' + userLink(actionerId, e.actorUsername || e.reporterUsername || actionerId) + '</span>'
          : '<span style="color:var(--muted-dim);">—</span>';
        const attachCount = (e.attachments || e.attachmentNames || []).length;
        const deleteBtn = canPublishContent ? '<button class="btn-small danger" data-scam-delete-id="' + escapeHtml(e.id) + '">Delete</button>' : '';
        return '<tr class="clickable-row" data-scam-index="' + i + '"><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td><span class="pill ' + e.type + '">' + e.type + '</span></td><td>' + target + '</td><td>' + content + '</td><td>' + actionedBy + '</td><td class="mono">' + (attachCount || '—') + '</td><td>' + deleteBtn + '</td></tr>';
      }).join('') || emptyRow(7, 'No scam entries logged yet.');
      const table = document.getElementById('scamsTable');
      table.innerHTML =
        '<thead><tr><th>When</th><th>Type</th><th>Target</th><th>Content</th><th>Actioned by</th><th>Files</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('tr[data-scam-index]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.user-link') || e.target.closest('button')) return;
          openScamDetail(loadedScamEntries[Number(row.dataset.scamIndex)]);
        });
      });
      table.querySelectorAll('button[data-scam-delete-id]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const entryId = btn.dataset.scamDeleteId;
          askConfirm('Delete this scam report?', 'Permanently removes it from the database.', {}, function () {
            return callAdmin('scams.delete', { id: entryId }).then(function (r) {
              if (r && r.ok) { showToast('Scam report deleted.', 'success'); loadScams(currentScamsFilter); }
              else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
            });
          });
        });
      });
    });
  }

  const scamDetailModal = document.getElementById('scamDetailModal');
  const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)(\?|$)/i;
  function openScamDetail(entry) {
    document.getElementById('scamDetailTitle').textContent = (entry.type || 'scam') + ' — ' + (entry.targetUsername || entry.targetUserId || 'unknown user');
    const actionerId = entry.actorId || entry.reporterId;
    document.getElementById('scamDetailMeta').innerHTML =
      '<span class="pill ' + entry.type + '">' + escapeHtml(entry.type) + '</span>' +
      '<span class="cell-user">Target: <img class="cell-avatar" src="' + avatarUrl(entry.targetUserId, entry.targetAvatar) + '"/><strong>' + userLink(entry.targetUserId, entry.targetUsername || entry.targetUserId || '—') + '</strong></span>' +
      (actionerId ? '<span class="cell-user">' + (entry.reporterId ? 'Reported' : 'Actioned') + ' by: <img class="cell-avatar" src="' + avatarUrl(actionerId, entry.actorAvatar) + '"/><strong>' + userLink(actionerId, entry.actorUsername || entry.reporterUsername || actionerId) + '</strong></span>' : '') +
      '<span>' + formatDateTime(entry.timestamp) + '</span>' +
      (entry.messageLink ? '<span><a href="' + escapeHtml(entry.messageLink) + '" target="_blank" style="color:var(--accent);">Original link</a></span>' : '');

    const attachments = entry.attachments || (entry.attachmentNames || []).map(function (n) { return { name: n, url: null }; });
    const attachmentsHtml = attachments.map(function (a) {
      if (a.url && (IMAGE_EXT_RE.test(a.url) || (a.contentType || '').indexOf('image/') === 0)) {
        return '<a href="' + escapeHtml(a.url) + '" target="_blank"><img src="' + escapeHtml(a.url) + '" class="scam-attachment-img" alt="' + escapeHtml(a.name) + '"/></a>';
      }
      return a.url
        ? '<a href="' + escapeHtml(a.url) + '" target="_blank" class="transcript-attachment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' + escapeHtml(a.name) + '</a>'
        : '<span class="transcript-attachment" style="color:var(--muted-dim);cursor:default;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' + escapeHtml(a.name) + ' (expired)</span>';
    }).join('');

    document.getElementById('scamDetailBody').innerHTML =
      '<div class="transcript-content" style="white-space:pre-wrap;">' + (entry.messageContent ? escapeHtml(entry.messageContent) : '<span style="color:var(--muted-dim);">(no text content)</span>') + '</div>' +
      (attachmentsHtml ? '<div class="scam-attachment-grid">' + attachmentsHtml + '</div>' : '') +
      (entry.actionTaken ? '<div class="app-card-details" style="margin-top:14px;"><span>Action taken: <strong>' + escapeHtml(entry.actionTaken) + '</strong></span></div>' : '');
    scamDetailModal.classList.add('active');
  }
  document.getElementById('scamDetailCloseBtn').addEventListener('click', function () { scamDetailModal.classList.remove('active'); });
  scamDetailModal.addEventListener('click', function (e) { if (e.target === scamDetailModal) scamDetailModal.classList.remove('active'); });
  function loadLogs() {
    return callAdmin('logs.list', { limit: 200 }).then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.entries.map(function (e) {
        const detail = e.targetUsername || e.targetUserId || e.detail || '—';
        const executedBy = userLink(e.actorId, e.actorUsername || e.actorId || '—');
        const result = e.result === 'success' ? '<span class="pill accepted">ok</span>' : '<span class="pill denied">' + escapeHtml(e.result || 'failed') + '</span>';
        return '<tr><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td class="mono">' + escapeHtml(e.type) + '</td><td>' + escapeHtml(detail) + '</td><td>' + executedBy + '</td><td>' + escapeHtml(e.reason || '') + '</td><td>' + result + '</td></tr>';
      }).join('') || emptyRow(6, 'No dashboard actions logged yet.');
      document.getElementById('logsTable').innerHTML =
        '<thead><tr><th>When</th><th>Action</th><th>Target</th><th>Executed by</th><th>Reason</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }
  const REVIEWS_PAGE_SIZE = 10;
  let lastReviews = [];
  function loadReviews() {
    return callAdmin('reviews.list').then(function (d) {
      if (!d || !d.ok) return;
      lastReviews = d.reviews;
      renderReviews(filterReviews(lastReviews), REVIEWS_PAGE_SIZE);
    });
  }
  function filterReviews(reviews) {
    const query = (document.getElementById('reviewsSearchInput').value || '').trim().toLowerCase();
    if (!query) return reviews;
    return reviews.filter(function (r) { return (r.username || '').toLowerCase().indexOf(query) !== -1; });
  }
  const reviewsSearchInput = document.getElementById('reviewsSearchInput');
  if (reviewsSearchInput) reviewsSearchInput.addEventListener('input', function () { renderReviews(filterReviews(lastReviews), REVIEWS_PAGE_SIZE); });
  function renderReviews(reviews, limit) {
    const shown = limit ? reviews.slice(0, limit) : reviews;
    const rows = shown.map(function (r) {
      const removeBtn = (r.discordId && canPublishContent) ? '<button class="btn-small danger" data-remove="' + r.discordId + '">Remove</button>' : '';
      const hasFps = r.fpsBefore != null && r.fpsAfter != null && !isNaN(Number(r.fpsBefore)) && !isNaN(Number(r.fpsAfter));
      const fps = hasFps ? Math.round(Number(r.fpsBefore)) + ' → ' + Math.round(Number(r.fpsAfter)) : '—';
      return '<tr><td><span class="cell-user"><img class="cell-avatar" src="' + reviewAvatarUrl(r) + '"/>' + userLink(r.discordId, r.username) + '</span></td><td class="mono">' + escapeHtml(r.stars || '') + '</td><td class="mono">' + fps + '</td><td style="max-width:340px;">' + escapeHtml((r.comment || '').slice(0, 140)) + '</td><td>' + removeBtn + '</td></tr>';
    }).join('') || emptyRow(5, 'No reviews yet.');
    const table = document.getElementById('reviewsTable');
    table.innerHTML = '<thead><tr><th>Reviewer</th><th>Rating</th><th>FPS</th><th>Comment</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
    table.querySelectorAll('button[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const discordId = btn.dataset.remove;
        askConfirm('Remove review?', 'This deletes the Discord message and the export entry.', {}, function () {
          return callAdmin('reviews.remove', { discordId: discordId }).then(function (d2) {
            if (d2 && d2.ok) { showToast('Review removed.', 'success'); loadReviews(); }
            else showToast('Failed: ' + (d2 && d2.error || 'unknown error'), 'error');
          });
        });
      });
    });
    const footer = document.getElementById('reviewsFooter');
    if (limit && reviews.length > limit) {
      footer.innerHTML = '<button type="button" class="view-all-btn" id="reviewsViewAllBtn">View all ' + reviews.length + ' reviews</button>';
      document.getElementById('reviewsViewAllBtn').addEventListener('click', function () { renderReviews(reviews, null); });
    } else if (!limit && reviews.length > REVIEWS_PAGE_SIZE) {
      footer.innerHTML = '<button type="button" class="view-all-btn" id="reviewsCollapseBtn">Show fewer</button>';
      document.getElementById('reviewsCollapseBtn').addEventListener('click', function () { renderReviews(reviews, REVIEWS_PAGE_SIZE); });
    } else {
      footer.innerHTML = '';
    }
  }
  let dropCapeOptionsLoaded = false;
  function loadDropCapeOptions() {
    if (dropCapeOptionsLoaded) return;
    dropCapeOptionsLoaded = true;
    const select = document.getElementById('dropTarget');
    if (!select) return;
    fetch('https://bot.frostclient.eu/launcher/capes/capes.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        list.filter(function (c) { return c.store && c.store.checkout; }).forEach(function (c) {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name + ' cape';
          select.appendChild(opt);
        });
      })
      .catch(function () { dropCapeOptionsLoaded = false; });
  }
  document.getElementById('dropSubmitBtn').addEventListener('click', function () {
    const btn = this;
    const name = document.getElementById('dropName').value.trim();
    const link = document.getElementById('dropLink').value.trim();
    const code = document.getElementById('dropCode').value.trim();
    const description = document.getElementById('dropDescription').value.trim();
    const redeemTarget = document.getElementById('dropTarget').value;
    if (!name || (!link && !code)) { showToast('Name and a link or code are required.', 'error'); return; }
    setBtnLoading(btn, true);
    callAdmin('drops.publish', { name: name, link: link, code: code, description: description, redeemTarget: redeemTarget }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Drop published!', 'success');
        ['dropName', 'dropLink', 'dropCode', 'dropDescription'].forEach(function (id) { document.getElementById(id).value = ''; });
        document.getElementById('dropTarget').value = '';
      } else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
    });
  });
  document.getElementById('gwSubmitBtn').addEventListener('click', function () {
    const btn = this;
    const title = document.getElementById('gwTitle').value.trim();
    const description = document.getElementById('gwDescription').value.trim();
    const winners = document.getElementById('gwWinners').value.trim();
    const duration = document.getElementById('gwDuration').value.trim();
    const channelId = document.getElementById('gwChannelId').value.trim();
    if (!title || !channelId) { showToast('Title and channel ID are required.', 'error'); return; }
    setBtnLoading(btn, true);
    callAdmin('giveaway.publish', { title: title, description: description, winners: winners, duration: duration, channelId: channelId }).then(function (d) {
      setBtnLoading(btn, false);
      if (d && d.ok) {
        showToast('Giveaway published!', 'success');
        ['gwTitle', 'gwDescription', 'gwWinners', 'gwDuration', 'gwChannelId'].forEach(function (id) { document.getElementById(id).value = ''; });
      } else showToast('Failed: ' + (d && d.error === 'invalid_input' ? 'Check winners count and duration format.' : (d && d.error || 'unknown error')), 'error');
    });
  });
  function loadTickets() {
    return callAdmin('tickets.overview').then(function (d) {
      if (!d || !d.ok) return;
      document.getElementById('ticketsStats').innerHTML =
        '<div class="stat-card"><div class="num">' + d.openCount + '</div><div class="label">Open tickets</div></div>' +
        '<div class="stat-card"><div class="num">' + d.closedCount + '</div><div class="label">Closed tickets</div></div>';
      const rows = d.open.map(function (t) {
        const name = (t.isPriority ? '<span class="priority-flag" title="Priority ticket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg></span>' : '') + escapeHtml(t.name);
        return '<tr class="clickable-row ' + (t.isPriority ? 'priority-row' : '') + '" data-channel="' + t.id + '"><td>' + name + '</td><td class="mono">' + escapeHtml(t.category || '—') + '</td><td>' + (t.claimedBy ? '<span class="pill accepted">claimed</span>' : '<span class="pill pending">unclaimed</span>') + '</td><td class="mono">' + formatRelative(t.createdAt ? Date.parse(t.createdAt) : null) + '</td></tr>';
      }).join('') || emptyRow(4, 'No open tickets.');
      const ticketsTable = document.getElementById('ticketsTable');
      ticketsTable.innerHTML =
        '<thead><tr><th>Channel</th><th>Category</th><th>Claim status</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody>';
      ticketsTable.querySelectorAll('tr[data-channel]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.user-link') || e.target.closest('button')) return;
          openLiveTicket(row.dataset.channel);
        });
      });
    });
  }
  let currentTicketArchiveFilter = '';
  document.querySelectorAll('#ticketArchiveFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#ticketArchiveFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentTicketArchiveFilter = btn.dataset.status;
      loadTicketArchive(currentTicketArchiveFilter);
    });
  });
  const TICKET_ARCHIVE_STATUS_PILL = { open: 'pending', closed: 'accepted', deleted: 'denied' };
  function loadTicketArchive(status) {
    return callAdmin('ticketArchive.list', { status: status }).then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.entries.map(function (t) {
        const created = t.createdBy ? userLink(t.createdBy, t.createdByUsername || t.createdBy) : '—';
        const claimed = t.claimedBy ? userLink(t.claimedBy, t.claimedByUsername || t.claimedBy) : '—';
        const closed = t.closedBy ? userLink(t.closedBy, t.closedByUsername || t.closedBy) : '—';
        const name = (t.isPriority ? '<span class="priority-flag" title="Priority ticket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg></span>' : '') + escapeHtml(t.channelName || t.channelId);
        const deleteBtn = canPublishContent ? ' <button class="btn-small danger" data-archive-delete="' + t.channelId + '">Delete</button>' : '';
        return '<tr class="clickable-row ' + (t.isPriority ? 'priority-row' : '') + '" data-channel="' + t.channelId + '">' +
          '<td>' + name + '</td>' +
          '<td class="mono">' + escapeHtml(t.category || '—') + '</td>' +
          '<td>' + created + '</td>' +
          '<td class="mono">' + formatRelative(t.createdAt) + '</td>' +
          '<td>' + claimed + '</td>' +
          '<td>' + closed + '</td>' +
          '<td><span class="pill ' + (TICKET_ARCHIVE_STATUS_PILL[t.status] || '') + '">' + escapeHtml(t.status) + '</span></td>' +
          '<td><button class="btn-small" data-transcript="' + t.channelId + '">View chat</button>' + deleteBtn + '</td>' +
        '</tr>';
      }).join('') || emptyRow(8, 'No archived tickets yet.');
      const table = document.getElementById('ticketArchiveTable');
      table.innerHTML =
        '<thead><tr><th>Ticket</th><th>Category</th><th>Created by</th><th>Created</th><th>Claimed by</th><th>Closed by</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('button[data-transcript]').forEach(function (btn) {
        btn.addEventListener('click', function () { openTranscript(btn.dataset.transcript); });
      });
      table.querySelectorAll('button[data-archive-delete]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const channelId = btn.dataset.archiveDelete;
          askConfirm('Delete this archived ticket?', 'Permanently removes the transcript and record.', {}, function () {
            return callAdmin('ticketArchive.delete', { channelId: channelId }).then(function (r) {
              if (r && r.ok) { showToast('Ticket deleted.', 'success'); loadTicketArchive(currentTicketArchiveFilter); }
              else showToast('Failed: ' + (r && r.error || 'unknown error'), 'error');
            });
          });
        });
      });
      table.querySelectorAll('tr[data-channel]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.user-link') || e.target.closest('button')) return;
          openTranscript(row.dataset.channel);
        });
      });
    });
  }

  function renderTranscriptMessagesHtml(messages) {
    return messages.map(function (m) {
      const attachments = (m.attachments || []).map(function (a) {
        return '<a href="' + escapeHtml(a.url) + '" target="_blank" class="transcript-attachment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' + escapeHtml(a.name) + '</a>';
      }).join('');
      const embeds = (m.embeds || []).map(function (e) {
        return '<div class="transcript-embed">' + (e.title ? '<strong>' + escapeHtml(e.title) + '</strong><br/>' : '') + (e.description ? escapeHtml(e.description) : '') + '</div>';
      }).join('');
      return '<div class="transcript-msg">' +
        '<img class="transcript-avatar" src="' + escapeHtml(m.authorAvatar) + '"/>' +
        '<div class="transcript-body">' +
          '<div class="transcript-head"><span class="transcript-author">' + escapeHtml(m.authorTag) + (m.isBot ? ' <span class="pill" style="background:rgba(255,255,255,0.06);">BOT</span>' : '') + '</span><span class="transcript-time">' + formatDateTime(m.timestamp) + '</span></div>' +
          (m.content ? '<div class="transcript-content">' + escapeHtml(m.content) + '</div>' : '') +
          embeds + attachments +
        '</div>' +
      '</div>';
    }).join('') || '<p style="color:var(--muted);font-size:13px;">No messages captured for this ticket.</p>';
  }

  const transcriptModal = document.getElementById('transcriptModal');
  const transcriptTitle = document.getElementById('transcriptTitle');
  const transcriptMeta = document.getElementById('transcriptMeta');
  const transcriptMessages = document.getElementById('transcriptMessages');
  function openTranscript(channelId) {
    transcriptTitle.textContent = 'Loading transcript…';
    transcriptMeta.innerHTML = '';
    transcriptMessages.innerHTML = '';
    transcriptModal.classList.add('active');
    callAdmin('ticketArchive.get', { channelId: channelId }).then(function (d) {
      if (!d || !d.ok) { transcriptTitle.textContent = 'Failed to load transcript'; return; }
      const t = d.ticket;
      transcriptTitle.innerHTML = (t.isPriority ? '<span class="priority-flag" title="Priority ticket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg></span>' : '') + escapeHtml(t.channelName || t.channelId);
      transcriptMeta.innerHTML =
        (t.isPriority ? '<span class="pill priority">Priority</span>' : '') +
        '<span>Created by <strong>' + userLink(t.createdBy, t.createdByUsername || t.createdBy || '—') + '</strong> · ' + formatDateTime(t.createdAt) + '</span>' +
        (t.claimedByUsername ? '<span>Claimed by <strong>' + userLink(t.claimedBy, t.claimedByUsername) + '</strong></span>' : '') +
        (t.closedByUsername ? '<span>Closed by <strong>' + userLink(t.closedBy, t.closedByUsername) + '</strong>' + (t.closeReason ? ' — ' + escapeHtml(t.closeReason) : '') + '</span>' : '');
      transcriptMessages.innerHTML = renderTranscriptMessagesHtml(t.messages || []);
    });
  }
  document.getElementById('transcriptCloseBtn').addEventListener('click', function () { transcriptModal.classList.remove('active'); });
  transcriptModal.addEventListener('click', function (e) { if (e.target === transcriptModal) transcriptModal.classList.remove('active'); });

  const liveTicketModal = document.getElementById('liveTicketModal');
  const liveTicketTitle = document.getElementById('liveTicketTitle');
  const liveTicketMeta = document.getElementById('liveTicketMeta');
  const liveTicketMessages = document.getElementById('liveTicketMessages');
  function openLiveTicket(channelId) {
    liveTicketTitle.textContent = 'Loading ticket…';
    liveTicketMeta.innerHTML = '';
    liveTicketMessages.innerHTML = '';
    liveTicketModal.classList.add('active');
    callAdmin('tickets.get', { channelId: channelId }).then(function (d) {
      if (!d || !d.ok) { liveTicketTitle.textContent = 'Failed to load ticket'; return; }
      const t = d.ticket;
      liveTicketTitle.innerHTML = (t.isPriority ? '<span class="priority-flag" title="Priority ticket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg></span>' : '') + escapeHtml(t.channelName || t.channelId);
      liveTicketMeta.innerHTML =
        (t.isPriority ? '<span class="pill priority">Priority</span>' : '') +
        '<span>Category: <strong>' + escapeHtml(t.category || '—') + '</strong></span>' +
        '<span>Created by <strong>' + userLink(t.createdBy, t.createdBy || '—') + '</strong></span>' +
        (t.claimedBy ? '<span>Claimed by <strong>' + userLink(t.claimedBy, t.claimedBy) + '</strong></span>' : '<span>Unclaimed</span>');
      liveTicketMessages.innerHTML = renderTranscriptMessagesHtml(t.messages || []);
      liveTicketMessages.scrollTop = liveTicketMessages.scrollHeight;
    });
  }
  document.getElementById('liveTicketCloseBtn').addEventListener('click', function () { liveTicketModal.classList.remove('active'); });
  liveTicketModal.addEventListener('click', function (e) { if (e.target === liveTicketModal) liveTicketModal.classList.remove('active'); });
  function showGate(id) {
    document.querySelectorAll('.gate-screen').forEach(function (el) { el.classList.toggle('active', el.id === id); });
    document.getElementById('appShell').classList.remove('active');
  }
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }
  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  const ADD_HOME_SCREEN_DISMISSED_KEY = 'frostAdminAddHomeScreenDismissed';
  function maybeShowAddHomeScreenPrompt() {
    if (!isMobileDevice() || isStandaloneMode()) return;
    try { if (localStorage.getItem(ADD_HOME_SCREEN_DISMISSED_KEY)) return; } catch (e) {}
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const steps = isIOS
      ? ['Tap the Share button in Safari\'s toolbar.', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add" in the top-right corner.']
      : isAndroid
        ? ['Tap the ⋮ menu in your browser.', 'Tap "Add to Home screen" (or "Install app").', 'Confirm by tapping "Add" / "Install".']
        : ['Open your browser\'s menu.', 'Look for "Add to Home Screen" or "Install app".', 'Confirm the install.'];
    const list = document.getElementById('homeScreenSteps');
    list.innerHTML = steps.map(function (s) { return '<li><span>' + escapeHtml(s) + '</span></li>'; }).join('');
    document.getElementById('addHomeScreenModal').classList.add('active');
  }
  document.getElementById('addHomeScreenGotItBtn').addEventListener('click', function () {
    document.getElementById('addHomeScreenModal').classList.remove('active');
    try { localStorage.setItem(ADD_HOME_SCREEN_DISMISSED_KEY, '1'); } catch (e) {}
  });
  document.getElementById('addHomeScreenModal').addEventListener('click', function (e) {
    if (e.target === document.getElementById('addHomeScreenModal')) {
      e.currentTarget.classList.remove('active');
      try { localStorage.setItem(ADD_HOME_SCREEN_DISMISSED_KEY, '1'); } catch (err) {}
    }
  });

  function checkForAppUpdate() {
    if (!isMobileDevice() || !isStandaloneMode()) return;
    fetch('version.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.version || d.version === APP_VERSION) return;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const steps = isIOS
        ? ['Long-press the Frost Admin icon on your Home Screen.', 'Tap "Remove App" → "Delete App".', 'Open Safari, go to admin.frostclient.eu, and add it to your Home Screen again.']
        : ['Long-press the Frost Admin icon on your Home Screen.', 'Tap "Remove" / "Uninstall".', 'Open your browser, go to admin.frostclient.eu, and add it to your Home Screen again.'];
      const list = document.getElementById('appUpdateSteps');
      list.innerHTML = steps.map(function (s) { return '<li><span>' + escapeHtml(s) + '</span></li>'; }).join('');
      document.getElementById('appUpdateModal').classList.add('active');
    }).catch(function () {});
  }
  document.getElementById('appUpdateGotItBtn').addEventListener('click', function () {
    document.getElementById('appUpdateModal').classList.remove('active');
  });
  document.getElementById('appUpdateModal').addEventListener('click', function (e) {
    if (e.target === document.getElementById('appUpdateModal')) e.currentTarget.classList.remove('active');
  });

  function subscribeToPush(registration) {
    return registration.pushManager.getSubscription().then(function (existing) {
      if (existing) return existing;
      return callAdmin('push.publicKey').then(function (d) {
        if (!d || !d.ok || !d.publicKey) return null;
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(d.publicKey)
        });
      });
    }).then(function (sub) {
      if (sub) callAdmin('push.subscribe', { subscription: sub.toJSON() });
    });
  }

  function initPushNotifications() {
    if (!isMobileDevice() || !isStandaloneMode()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    navigator.serviceWorker.register('sw.js').then(function (registration) {
      if (Notification.permission === 'granted') {
        subscribeToPush(registration);
        return;
      }
      if (Notification.permission === 'denied') return;
      askConfirm('Enable notifications?', 'Get notified on this device even when Frost Admin is closed.', { tone: 'primary', okLabel: 'Enable' }, function () {
        return Notification.requestPermission().then(function (permission) {
          if (permission === 'granted') subscribeToPush(registration);
        });
      });
    }).catch(function () {});
  }

  function unsubscribeFromPush(registration) {
    return registration.pushManager.getSubscription().then(function (sub) {
      if (!sub) return;
      const endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () { callAdmin('push.unsubscribe', { endpoint: endpoint }); });
    });
  }

  const PUSH_TYPE_DEFS = [
    { type: 'new_review', label: 'New reviews', desc: 'A player leaves a new review on the website.', gate: 'management' },
    { type: 'warn', label: 'Warnings', desc: 'You personally receive a staff warning.', gate: null },
    { type: 'reputation_received', label: 'New reputation', desc: 'Someone gives you +rep in the reputation channel.', gate: null },
    { type: 'priority_ticket_created', label: 'Priority ticket opened', desc: 'A Booster or Lite member opens a ticket that needs a fast reply.', gate: null },
    { type: 'excuse_submitted', label: 'New excuse submitted', desc: 'A staff member submits an excuse for review.', gate: 'highStaff' },
    { type: 'excuse_decided', label: 'Your excuse decided', desc: 'An excuse you submitted gets approved or rejected.', gate: null },
    { type: 'staff_app_submitted', label: 'New staff application', desc: 'Someone applies for the staff team on the website.', gate: 'highStaff' },
    { type: 'partner_signup_logged', label: 'New Media partner signup', desc: 'Someone signs up for (or is granted) the Media creator tier.', gate: 'management' },
    { type: 'partner_rankup_submitted', label: 'New rank-up request', desc: 'A creator requests a rank-up to Partner or Partner+.', gate: 'highStaff' },
    { type: 'scam_report', label: 'New scam report', desc: 'Someone reports a suspected scam message for review.', gate: null },
    { type: 'inactivity_reminder', label: 'Inactivity reminder', desc: 'You\'ve been inactive for 2+ days with no excuse on file.', gate: null }
  ];

  function saveSettingsTypePreferences() {
    const prefs = {};
    document.querySelectorAll('.settings-type-toggle').forEach(function (el) { prefs[el.dataset.type] = el.checked; });
    callAdmin('push.setPreferences', { preferences: prefs });
  }

  function renderSettingsTypes(prefs) {
    const container = document.getElementById('settingsTypes');
    const visible = PUSH_TYPE_DEFS.filter(function (d) {
      if (d.gate === 'management') return canPublishContent;
      if (d.gate === 'highStaff') return canReviewApplications;
      return true;
    });
    container.innerHTML = visible.map(function (d) {
      const checked = prefs[d.type] !== false;
      return '<div class="settings-row">' +
        '<div class="settings-row-label"><div class="settings-row-title">' + escapeHtml(d.label) + '</div><div class="settings-row-sub">' + escapeHtml(d.desc) + '</div></div>' +
        '<label class="switch"><input type="checkbox" class="settings-type-toggle" data-type="' + d.type + '"' + (checked ? ' checked' : '') + '/><span class="switch-track"></span></label>' +
        '</div>';
    }).join('');
    container.querySelectorAll('.settings-type-toggle').forEach(function (el) {
      el.addEventListener('change', saveSettingsTypePreferences);
    });
  }

  function openSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
    const warningEl = document.getElementById('settingsPermissionWarning');
    const masterToggle = document.getElementById('settingsMasterToggle');
    const typesContainer = document.getElementById('settingsTypes');

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      warningEl.style.display = 'none';
      masterToggle.disabled = true;
      masterToggle.checked = false;
      typesContainer.innerHTML = '<div class="settings-row-sub">Push notifications aren\'t supported in this browser.</div>';
      return;
    }

    if (Notification.permission === 'denied') {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);
      const howTo = isIOS
        ? 'Open the iPhone Settings app → Notifications → Frost Admin → turn Allow Notifications back on.'
        : isAndroid
          ? 'Open your browser\'s site settings for this page → Notifications → Allow.'
          : 'Check your browser\'s site settings for this page and re-allow notifications.';
      warningEl.innerHTML = '<strong>Notifications are blocked.</strong>' + escapeHtml(howTo);
      warningEl.style.display = '';
      masterToggle.disabled = true;
      masterToggle.checked = false;
    } else {
      warningEl.style.display = 'none';
      masterToggle.disabled = false;
    }

    navigator.serviceWorker.register('sw.js').then(function (registration) {
      return registration.pushManager.getSubscription().then(function (sub) {
        masterToggle.checked = !!sub && Notification.permission === 'granted';
        masterToggle.onchange = function () {
          if (masterToggle.checked) {
            (Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission()).then(function (permission) {
              if (permission === 'granted') subscribeToPush(registration);
              else masterToggle.checked = false;
            });
          } else {
            unsubscribeFromPush(registration);
          }
        };
      });
    }).catch(function () {});

    callAdmin('push.getPreferences').then(function (d) {
      renderSettingsTypes((d && d.ok && d.preferences) || {});
    });
  }

  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('settingsCloseBtn').addEventListener('click', function () {
    document.getElementById('settingsModal').classList.remove('active');
  });
  document.getElementById('settingsModal').addEventListener('click', function (e) {
    if (e.target === document.getElementById('settingsModal')) e.currentTarget.classList.remove('active');
  });

  const PENDING_ACTION_KEY = 'frostAdminPendingAction';
  function showApp(user) {
    document.querySelectorAll('.gate-screen').forEach(function (el) { el.classList.remove('active'); });
    document.getElementById('appShell').classList.add('active');
    document.getElementById('userAvatar').src = avatarUrl(user.id, user.avatar);
    document.getElementById('userName').textContent = user.name || user.username || 'Owner';
    let pendingAction = '';
    try { pendingAction = sessionStorage.getItem(PENDING_ACTION_KEY) || ''; sessionStorage.removeItem(PENDING_ACTION_KEY); } catch (e) {}
    if (pendingAction === 'writeExcuse') {
      showView('excuses');
      openExcuseModal();
    } else {
      showView('overview');
    }
    startNotifPolling();
    maybeShowAddHomeScreenPrompt();
    initPushNotifications();
    document.getElementById('settingsBtn').style.display = isMobileDevice() ? 'flex' : 'none';
    checkForAppUpdate();
    setInterval(checkForAppUpdate, 30 * 60 * 1000);
  }

  function startLogin() {
    let csrfState = '';
    try {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      csrfState = Array.from(buf).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      sessionStorage.setItem(OAUTH_STATE_KEY, csrfState);
    } catch (e) {}
    const url = 'https://discord.com/oauth2/authorize'
      + '?client_id=' + encodeURIComponent(DISCORD_CLIENT_ID)
      + '&response_type=code'
      + '&redirect_uri=' + encodeURIComponent(DISCORD_REDIRECT_URI)
      + '&scope=' + encodeURIComponent('identify')
      + '&state=' + csrfState;
    window.location.href = url;
  }
  function showGateError(msg) {
    document.getElementById('gateErrorText').textContent = msg;
    showGate('gateError');
  }

  document.getElementById('loginBtn').addEventListener('click', startLogin);
  document.getElementById('forbiddenBackBtn').addEventListener('click', function () { clearToken(); startLogin(); });
  document.getElementById('errorRetryBtn').addEventListener('click', function () { window.location.reload(); });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearToken();
    showGate('gateLogin');
  });

  (function init() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('writeExcuse')) {
      try { sessionStorage.setItem(PENDING_ACTION_KEY, 'writeExcuse'); } catch (e) {}
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('writeExcuse');
      window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }

    if (params.has('code')) {
      const code = params.get('code');
      const returnedState = params.get('state') || '';
      let storedState = '';
      try { storedState = sessionStorage.getItem(OAUTH_STATE_KEY) || ''; } catch (e) {}
      try { sessionStorage.removeItem(OAUTH_STATE_KEY); } catch (e) {}

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('code');
      cleanUrl.searchParams.delete('state');
      window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

      if (storedState && returnedState !== storedState) {
        showGateError('Sign-in session mismatch. Please try again.');
        return;
      }

      fetchJsonWithRetry(LITE_API_URL + '?action=adminAuth&code=' + encodeURIComponent(code), { cache: 'no-store' }, 4)
        .then(function (data) {
          if (!data.ok) { showGateError('Discord sign-in failed. Please try again.'); return; }
          if (data.status === 'forbidden') { showGate('gateForbidden'); return; }
          if (data.status === 'eligible' && data.ownerToken) {
            saveToken(data.ownerToken);
            showApp(data.user);
            return;
          }
          showGateError('Something unexpected happened. Please try again.');
        })
        .catch(function () { showGateError('Network error while contacting the server. Please try again.'); });
      return;
    }

    if (params.has('error')) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('error');
      cleanUrl.searchParams.delete('error_description');
      cleanUrl.searchParams.delete('state');
      window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      showGate('gateLogin');
      return;
    }

    const token = loadToken();
    if (!token) { showGate('gateLogin'); return; }

    callAdmin('overview').then(function (d) {
      if (d && d.ok) {
        showApp(d.user || { id: '', username: 'Owner', name: 'Owner', avatar: null });
      } else if (d && d.error === 'forbidden') {
        showGate('gateForbidden');
      } else {
        showGate('gateLogin');
      }
    }).catch(function () { showGate('gateLogin'); });
  })();
  (function () {
    const canvas = document.getElementById('snowCanvas');
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];
    function resizeCanvas() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    for (let i = 0; i < 60; i++) particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + 0.5,
      speed: Math.random() * 0.35 + 0.1,
      drift: (Math.random() - 0.5) * 0.25,
      opacity: Math.random() * 0.35 + 0.08
    });
    (function animateParticles() {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(168,230,248,' + p.opacity + ')';
        ctx.fill();
        p.y += p.speed; p.x += p.drift;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x > W + 10) p.x = -10;
        if (p.x < -10) p.x = W + 10;
      }
      requestAnimationFrame(animateParticles);
    })();

    const cursorGlow = document.getElementById('cursorGlow');
    const HALF = 280;
    document.addEventListener('mousemove', function (e) {
      cursorGlow.style.transform = 'translate(' + (e.clientX - HALF) + 'px,' + (e.clientY - HALF) + 'px)';
      cursorGlow.style.opacity = '1';
    });
    document.addEventListener('mouseleave', function () { cursorGlow.style.opacity = '0'; });
  })();

  window.addEventListener('scroll', function () {
    const header = document.querySelector('.content-header');
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
})();
