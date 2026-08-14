(function () {
  const LITE_API_URL = 'https://script.google.com/macros/s/AKfycbxF57u1UNBsonktp5_2EseJtFkBZR0-CCxyazOGVUmEBrcwjU1-t6Us41gcrRqCsGcR/exec';
  const ADMIN_API_URL = 'https://bot.frostclient.eu/admin';
  const DISCORD_CLIENT_ID = '1512834635640475898';
  const DISCORD_REDIRECT_URI = 'https://admin.frostclient.eu';
  const TOKEN_KEY = 'frostAdminToken';
  const OAUTH_STATE_KEY = 'frostAdminOauthState';

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
      }
      return data;
    });
  }

  // ---------- Toasts ----------
  const toastStack = document.getElementById('toastStack');
  function showToast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  // ---------- Confirm modal ----------
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmText = document.getElementById('confirmText');
  const confirmReasonField = document.getElementById('confirmReasonField');
  const confirmReasonInput = document.getElementById('confirmReasonInput');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  let confirmResolve = null;

  function askConfirm(title, text, opts) {
    opts = opts || {};
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmReasonField.style.display = opts.reason ? '' : 'none';
    confirmReasonInput.value = '';
    confirmModal.classList.add('active');
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    confirmModal.classList.remove('active');
    if (confirmResolve) {
      confirmResolve(result ? { ok: true, reason: confirmReasonInput.value.trim() } : { ok: false });
      confirmResolve = null;
    }
  }
  confirmOkBtn.addEventListener('click', function () { closeConfirm(true); });
  confirmCancelBtn.addEventListener('click', function () { closeConfirm(false); });
  confirmModal.addEventListener('click', function (e) { if (e.target === confirmModal) closeConfirm(false); });

  // ---------- Formatting helpers ----------
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

  // ---------- Sidebar / view routing ----------
  const sidebar = document.getElementById('sidebar');
  const viewTitle = document.getElementById('viewTitle');
  const VIEW_TITLES = {
    overview: 'Overview', members: 'Members', leaderboard: 'Leaderboards', staff: 'Staff Team',
    staffApps: 'Staff Applications', partnerApps: 'Partner Applications', scams: 'Scam Database',
    logs: 'Action Logs', reviews: 'Reviews', drops: 'Publish Drop', giveaway: 'Publish Giveaway', tickets: 'Tickets'
  };
  const VIEW_LOADERS = {
    overview: loadOverview, members: function () {}, leaderboard: loadLeaderboard, staff: loadStaff,
    staffApps: function () { loadStaffApps(currentStaffAppsFilter); },
    partnerApps: function () { loadPartnerApps(currentPartnerAppsFilter); },
    scams: function () { loadScams(currentScamsFilter); }, logs: loadLogs, reviews: loadReviews,
    drops: function () {}, giveaway: function () {}, tickets: loadTickets
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

  // ================= OVERVIEW =================
  function loadOverview() {
    return callAdmin('overview').then(function (d) {
      if (!d || !d.ok) return;
      const cards = [
        [d.onlineNow, 'Online now'],
        [d.memberCount, 'Server members'],
        [d.partnerCount, 'Partners'],
        [d.totalPlayersSeen, 'Total players seen'],
        [d.openTickets, 'Open tickets'],
        [d.totalReviews, 'Reviews'],
        [d.pendingStaffApps, 'Pending staff apps'],
        [d.pendingPartnerApps, 'Pending partner apps'],
        [d.scamsToday, 'Scams today', d.scamsToday > 0 ? 'warn' : ''],
        [d.scamsTotal, 'Scams logged (all-time)']
      ];
      document.getElementById('overviewStats').innerHTML = cards.map(function (c) {
        return '<div class="stat-card"><div class="num' + (c[2] ? ' ' + c[2] : '') + '">' + (c[0] != null ? c[0] : '—') + '</div><div class="label">' + escapeHtml(c[1]) + '</div></div>';
      }).join('');
      setBadge('badgeStaffApps', d.pendingStaffApps);
      setBadge('badgePartnerApps', d.pendingPartnerApps);
    });
  }
  function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = String(count); el.style.display = ''; }
    else { el.style.display = 'none'; }
  }

  // ================= MEMBERS =================
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
      memberResults.innerHTML = d.members.map(renderMemberCard).join('');
      d.members.forEach(function (m) { wireMemberActions(m); });
    });
  }
  memberSearchBtn.addEventListener('click', runMemberSearch);
  memberSearchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runMemberSearch(); });

  function renderMemberCard(m) {
    const roles = (m.roles || []).map(function (r) { return '<span class="pill" style="background:rgba(255,255,255,0.06);color:' + (r.color && r.color !== '#000000' ? r.color : 'var(--muted)') + ';">' + escapeHtml(r.name) + '</span>'; }).join(' ');
    return (
      '<div class="app-card" id="member-' + m.id + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' + escapeHtml(m.globalName || m.username) + ' <span class="app-card-meta">@' + escapeHtml(m.username) + ' · ' + m.id + '</span></div>' +
          '<div class="app-card-actions">' +
            (m.isStaff ? '<button class="btn-small danger" data-action="kickStaff" data-id="' + m.id + '">Kick from staff</button>' : '') +
            (m.timedOutUntil ? '<button class="btn-small success" data-action="removeTimeout" data-id="' + m.id + '">Remove timeout</button>' : '<button class="btn-small" data-action="timeout" data-id="' + m.id + '">Timeout</button>') +
            '<button class="btn-small danger" data-action="kick" data-id="' + m.id + '">Kick</button>' +
            '<button class="btn-small danger" data-action="ban" data-id="' + m.id + '">Ban</button>' +
          '</div>' +
        '</div>' +
        '<div class="app-card-details">' +
          '<span>Joined: <strong>' + formatDateTime(m.joinedAt ? Date.parse(m.joinedAt) : null) + '</strong></span>' +
          (m.timedOutUntil ? '<span>Timed out until: <strong style="color:var(--warning);">' + formatDateTime(Date.parse(m.timedOutUntil)) + '</strong></span>' : '') +
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
    ban: { title: 'Ban member', text: 'Permanently bans them from the server.', reason: true }
  };
  function wireMemberActions(m) {
    const card = document.getElementById('member-' + m.id);
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.dataset.action;
        const copy = MEMBER_ACTION_COPY[action];
        askConfirm(copy.title, copy.text + ' Target: ' + (m.globalName || m.username), { reason: copy.reason }).then(function (res) {
          if (!res.ok) return;
          callAdmin('members.action', {
            targetId: m.id, memberAction: action, reason: res.reason || undefined,
            durationMs: action === 'timeout' ? 24 * 60 * 60 * 1000 : undefined
          }).then(function (d) {
            if (d && d.ok) { showToast('Done.', 'success'); runMemberSearch(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }

  // ================= LEADERBOARD =================
  function loadLeaderboard() {
    return callAdmin('leaderboard').then(function (d) {
      if (!d || !d.ok) return;
      const playtimeRows = d.monthly.map(function (p, i) {
        return '<tr><td class="mono">#' + (i + 1) + '</td><td>' + escapeHtml(p.username) + (p.isLite ? ' <span class="pill accepted" style="margin-left:6px;">LITE</span>' : '') + '</td><td class="mono">' + formatDuration(p.ms) + '</td></tr>';
      }).join('') || emptyRow(3, 'No playtime recorded yet this month.');
      document.getElementById('playtimeTable').innerHTML =
        '<thead><tr><th>#</th><th>Player</th><th>Playtime</th></tr></thead><tbody>' + playtimeRows + '</tbody>';

      const staffRows = d.staffLeaderboard.map(function (s, i) {
        return '<tr><td class="mono">#' + (i + 1) + '</td><td class="mono">' + s.userId + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + formatDuration(s.totalResolutionMs) + '</td></tr>';
      }).join('') || emptyRow(5, 'No staff activity recorded yet.');
      document.getElementById('staffLeaderboardTable').innerHTML =
        '<thead><tr><th>#</th><th>User ID</th><th>Solved</th><th>Claims</th><th>Avg. handling</th></tr></thead><tbody>' + staffRows + '</tbody>';
    });
  }

  // ================= STAFF TEAM =================
  function loadStaff() {
    return callAdmin('staff.list').then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.staff.map(function (s) {
        return '<tr><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.id, s.avatar) + '"/>' + escapeHtml(s.tag) + '</td><td>' + (s.rank ? '<span class="pill accepted">' + escapeHtml(s.rank) + '</span>' : '—') + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + s.unclaimedTickets + '</td></tr>';
      }).join('') || emptyRow(5, 'No staff members found.');
      document.getElementById('staffTable').innerHTML =
        '<thead><tr><th>Member</th><th>Rank</th><th>Solved</th><th>Claims</th><th>Unclaimed</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }

  // ================= STAFF APPLICATIONS =================
  let currentStaffAppsFilter = 'pending';
  document.querySelectorAll('#staffAppsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#staffAppsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentStaffAppsFilter = btn.dataset.status;
      loadStaffApps(currentStaffAppsFilter);
    });
  });
  function loadStaffApps(status) {
    return callAdmin('staffApplications.list', { status: status }).then(function (d) {
      if (!d || !d.ok) return;
      const list = document.getElementById('staffAppsList');
      if (!d.applications.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No applications here.</p>'; return; }
      list.innerHTML = d.applications.map(function (a) { return renderStaffAppCard(a, d.questionLabels); }).join('');
      d.applications.forEach(wireStaffAppActions);
    });
  }
  function renderStaffAppCard(a, labels) {
    const qa = (labels || []).map(function (pair) {
      const key = pair[0], label = pair[1];
      const val = a.answers ? a.answers[key] : null;
      if (!val) return '';
      return '<div><div class="app-card-q">' + escapeHtml(label) + '</div><div class="app-card-a">' + escapeHtml(val) + '</div></div>';
    }).join('');
    const extra = a.extra ? '<div><div class="app-card-q">Anything else</div><div class="app-card-a">' + escapeHtml(a.extra) + '</div></div>' : '';
    return (
      '<div class="app-card" id="staffapp-' + a.discordId + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user">' + escapeHtml(a.username || a.discordId) + ' <span class="app-card-meta">' + a.discordId + '</span></div>' +
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
        askConfirm(decision === 'accept' ? 'Accept application?' : 'Deny application?', (a.username || a.discordId) + "'s staff application.", {}).then(function (res) {
          if (!res.ok) return;
          callAdmin('staffApplications.decide', { discordId: a.discordId, decision: decision }).then(function (d) {
            if (d && d.ok) { showToast('Application ' + decision + 'ed.', 'success'); loadStaffApps(currentStaffAppsFilter); loadOverview(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }

  // ================= PARTNER APPLICATIONS =================
  let currentPartnerAppsFilter = 'pending';
  document.querySelectorAll('#partnerAppsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#partnerAppsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentPartnerAppsFilter = btn.dataset.status;
      loadPartnerApps(currentPartnerAppsFilter);
    });
  });
  function loadPartnerApps(status) {
    return callAdmin('partnerApplications.list', { status: status }).then(function (d) {
      if (!d || !d.ok) return;
      const list = document.getElementById('partnerAppsList');
      if (!d.applications.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px;">No applications here.</p>'; return; }
      list.innerHTML = d.applications.map(renderPartnerAppCard).join('');
      d.applications.forEach(wirePartnerAppActions);
    });
  }
  function renderPartnerAppCard(a) {
    const details = [
      ['Tier', a.tier], ['Platform', a.platform], ['Link', a.link], ['Desired code', a.code]
    ].filter(function (p) { return p[1]; }).map(function (p) {
      return '<div><div class="app-card-q">' + escapeHtml(p[0]) + '</div><div class="app-card-a">' + escapeHtml(p[1]) + '</div></div>';
    }).join('');
    return (
      '<div class="app-card" id="partnerapp-' + a.discordId + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user">' + escapeHtml(a.username || a.discordId) + ' <span class="app-card-meta">' + a.discordId + '</span></div>' +
          '<span class="pill ' + a.status + '">' + a.status + '</span>' +
          (a.status === 'pending' ? '<div class="app-card-actions"><button class="btn-small success" data-action="accept">Accept</button><button class="btn-small danger" data-action="deny">Deny</button></div>' : '') +
        '</div>' +
        '<div class="app-card-details"><span>Applied: <strong>' + formatRelative(a.appliedAt) + '</strong></span>' + (a.decidedAt ? '<span>Decided: <strong>' + formatRelative(a.decidedAt) + '</strong></span>' : '') + '</div>' +
        '<div class="app-card-qa">' + details + '</div>' +
      '</div>'
    );
  }
  function wirePartnerAppActions(a) {
    const card = document.getElementById('partnerapp-' + a.discordId);
    if (!card) return;
    card.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const decision = btn.dataset.action;
        const note = decision === 'accept' ? ' A partnership ticket will be opened for them.' : '';
        askConfirm(decision === 'accept' ? 'Accept application?' : 'Deny application?', (a.username || a.discordId) + "'s partner application." + note, {}).then(function (res) {
          if (!res.ok) return;
          callAdmin('partnerApplications.decide', { discordId: a.discordId, decision: decision }).then(function (d) {
            if (d && d.ok) { showToast('Application ' + decision + 'ed.', 'success'); loadPartnerApps(currentPartnerAppsFilter); loadOverview(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
  }

  // ================= SCAMS =================
  let currentScamsFilter = '';
  document.querySelectorAll('#scamsFilter .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#scamsFilter .filter-pill').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentScamsFilter = btn.dataset.type;
      loadScams(currentScamsFilter);
    });
  });
  function loadScams(type) {
    return callAdmin('scams.list', { type: type, limit: 200 }).then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.entries.map(function (e) {
        const target = e.targetUsername ? escapeHtml(e.targetUsername) : (e.targetUserId || '—');
        const content = e.messageContent ? escapeHtml(e.messageContent).slice(0, 80) : '<span style="color:var(--muted-dim);">(no text)</span>';
        const attachments = (e.attachmentNames || []).join(', ');
        return '<tr><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td><span class="pill ' + e.type + '">' + e.type + '</span></td><td>' + target + '</td><td>' + content + '</td><td class="mono">' + escapeHtml(attachments) + '</td><td>' + (e.messageLink ? '<a href="' + escapeHtml(e.messageLink) + '" target="_blank" style="color:var(--accent);">view</a>' : '—') + '</td></tr>';
      }).join('') || emptyRow(6, 'No scam entries logged yet.');
      document.getElementById('scamsTable').innerHTML =
        '<thead><tr><th>When</th><th>Type</th><th>Target</th><th>Content</th><th>Attachments</th><th>Link</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }

  // ================= LOGS =================
  function loadLogs() {
    return callAdmin('logs.list', { limit: 200 }).then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.entries.map(function (e) {
        const detail = e.targetUsername || e.targetUserId || e.detail || '—';
        const result = e.result === 'success' ? '<span class="pill accepted">ok</span>' : '<span class="pill denied">' + escapeHtml(e.result || 'failed') + '</span>';
        return '<tr><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td class="mono">' + escapeHtml(e.type) + '</td><td>' + escapeHtml(detail) + '</td><td>' + escapeHtml(e.reason || '') + '</td><td>' + result + '</td></tr>';
      }).join('') || emptyRow(5, 'No dashboard actions logged yet.');
      document.getElementById('logsTable').innerHTML =
        '<thead><tr><th>When</th><th>Action</th><th>Target</th><th>Reason</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }

  // ================= REVIEWS =================
  function loadReviews() {
    return callAdmin('reviews.list').then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.reviews.map(function (r) {
        return '<tr><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(r.discordId, r.avatar) + '"/>' + escapeHtml(r.username) + '</td><td class="mono">' + escapeHtml(r.stars || '') + '</td><td style="max-width:340px;">' + escapeHtml((r.comment || '').slice(0, 140)) + '</td><td>' + '<button class="btn-small danger" data-remove="' + r.discordId + '">Remove</button></td></tr>';
      }).join('') || emptyRow(4, 'No reviews yet.');
      const table = document.getElementById('reviewsTable');
      table.innerHTML = '<thead><tr><th>Reviewer</th><th>Rating</th><th>Comment</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('button[data-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const discordId = btn.dataset.remove;
          askConfirm('Remove review?', 'This deletes the Discord message and the export entry.', {}).then(function (res) {
            if (!res.ok) return;
            callAdmin('reviews.remove', { discordId: discordId }).then(function (d2) {
              if (d2 && d2.ok) { showToast('Review removed.', 'success'); loadReviews(); }
              else showToast('Failed: ' + (d2 && d2.error || 'unknown error'), 'error');
            });
          });
        });
      });
    });
  }

  // ================= DROPS =================
  document.getElementById('dropSubmitBtn').addEventListener('click', function () {
    const btn = this;
    const name = document.getElementById('dropName').value.trim();
    const link = document.getElementById('dropLink').value.trim();
    const code = document.getElementById('dropCode').value.trim();
    const description = document.getElementById('dropDescription').value.trim();
    if (!name || (!link && !code)) { showToast('Name and a link or code are required.', 'error'); return; }
    btn.disabled = true;
    callAdmin('drops.publish', { name: name, link: link, code: code, description: description }).then(function (d) {
      btn.disabled = false;
      if (d && d.ok) {
        showToast('Drop published!', 'success');
        ['dropName', 'dropLink', 'dropCode', 'dropDescription'].forEach(function (id) { document.getElementById(id).value = ''; });
      } else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
    });
  });

  // ================= GIVEAWAY =================
  document.getElementById('gwSubmitBtn').addEventListener('click', function () {
    const btn = this;
    const title = document.getElementById('gwTitle').value.trim();
    const description = document.getElementById('gwDescription').value.trim();
    const winners = document.getElementById('gwWinners').value.trim();
    const duration = document.getElementById('gwDuration').value.trim();
    const channelId = document.getElementById('gwChannelId').value.trim();
    if (!title || !channelId) { showToast('Title and channel ID are required.', 'error'); return; }
    btn.disabled = true;
    callAdmin('giveaway.publish', { title: title, description: description, winners: winners, duration: duration, channelId: channelId }).then(function (d) {
      btn.disabled = false;
      if (d && d.ok) {
        showToast('Giveaway published!', 'success');
        ['gwTitle', 'gwDescription', 'gwWinners', 'gwDuration', 'gwChannelId'].forEach(function (id) { document.getElementById(id).value = ''; });
      } else showToast('Failed: ' + (d && d.error === 'invalid_input' ? 'Check winners count and duration format.' : (d && d.error || 'unknown error')), 'error');
    });
  });

  // ================= TICKETS =================
  function loadTickets() {
    return callAdmin('tickets.overview').then(function (d) {
      if (!d || !d.ok) return;
      document.getElementById('ticketsStats').innerHTML =
        '<div class="stat-card"><div class="num">' + d.openCount + '</div><div class="label">Open tickets</div></div>' +
        '<div class="stat-card"><div class="num">' + d.closedCount + '</div><div class="label">Closed tickets</div></div>';
      const rows = d.open.map(function (t) {
        return '<tr><td>' + escapeHtml(t.name) + '</td><td class="mono">' + escapeHtml(t.category || '—') + '</td><td>' + (t.claimedBy ? '<span class="pill accepted">claimed</span>' : '<span class="pill pending">unclaimed</span>') + '</td><td class="mono">' + formatRelative(t.createdAt ? Date.parse(t.createdAt) : null) + '</td></tr>';
      }).join('') || emptyRow(4, 'No open tickets.');
      document.getElementById('ticketsTable').innerHTML =
        '<thead><tr><th>Channel</th><th>Category</th><th>Claim status</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }

  // ================= AUTH =================
  function showGate(id) {
    document.querySelectorAll('.gate-screen').forEach(function (el) { el.classList.toggle('active', el.id === id); });
    document.getElementById('appShell').classList.remove('active');
  }
  function showApp(user) {
    document.querySelectorAll('.gate-screen').forEach(function (el) { el.classList.remove('active'); });
    document.getElementById('appShell').classList.add('active');
    document.getElementById('userAvatar').src = avatarUrl(user.id, user.avatar);
    document.getElementById('userName').textContent = user.name || user.username || 'Owner';
    showView('overview');
  }

  function startLogin() {
    fetch(LITE_API_URL + '?action=adminConfig', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        let csrfState = '';
        try {
          const buf = new Uint8Array(16);
          crypto.getRandomValues(buf);
          csrfState = Array.from(buf).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
          sessionStorage.setItem(OAUTH_STATE_KEY, csrfState);
        } catch (e) {}
        const url = 'https://discord.com/oauth2/authorize'
          + '?client_id=' + encodeURIComponent(cfg.clientId || DISCORD_CLIENT_ID)
          + '&response_type=code'
          + '&redirect_uri=' + encodeURIComponent(cfg.redirectUri || DISCORD_REDIRECT_URI)
          + '&scope=' + encodeURIComponent('identify')
          + '&state=' + csrfState;
        window.location.href = url;
      })
      .catch(function () { showGateError('Could not start sign-in. Please try again.'); });
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

      fetchJsonWithRetry(LITE_API_URL + '?action=adminAuth&code=' + encodeURIComponent(code), { cache: 'no-store' }, 2)
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
        showApp({ id: '', username: 'Owner', name: 'Owner', avatar: null });
      } else if (d && d.error === 'forbidden') {
        showGate('gateForbidden');
      } else {
        showGate('gateLogin');
      }
    }).catch(function () { showGate('gateLogin'); });
  })();
})();
