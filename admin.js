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
      } else if (data && data.ok === false && data.error === 'insufficient_permission') {
        showToast("You don't have permission to do that.", 'error');
      }
      return data;
    });
  }
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
  const sidebar = document.getElementById('sidebar');
  const viewTitle = document.getElementById('viewTitle');
  const VIEW_TITLES = {
    overview: 'Overview', members: 'Members', leaderboard: 'Leaderboards', staff: 'Staff Team',
    staffApps: 'Staff Applications', partnerApps: 'Partner Applications', scams: 'Scam Database',
    logs: 'Action Logs', reviews: 'Reviews', drops: 'Publish Drop', giveaway: 'Publish Giveaway', tickets: 'Tickets',
    ticketArchive: 'Ticket Archive'
  };
  const VIEW_LOADERS = {
    overview: loadOverview, members: function () {}, leaderboard: loadLeaderboard, staff: loadStaff,
    staffApps: function () { loadStaffApps(currentStaffAppsFilter); },
    partnerApps: function () { loadPartnerApps(currentPartnerAppsFilter); },
    scams: function () { loadScams(currentScamsFilter); }, logs: loadLogs, reviews: loadReviews,
    drops: function () {}, giveaway: function () {}, tickets: loadTickets,
    ticketArchive: function () { loadTicketArchive(currentTicketArchiveFilter); }
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
  function applyRolePermissions() {
    document.querySelectorAll('[data-requires="highStaff"]').forEach(function (el) { el.style.display = canReviewApplications ? '' : 'none'; });
    document.querySelectorAll('[data-requires="management"]').forEach(function (el) { el.style.display = canPublishContent ? '' : 'none'; });
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
      if (!d || !d.ok) return;
      canReviewApplications = !!d.canReviewApplications;
      canPublishContent = !!d.canPublishContent;
      canKickStaff = !!d.canKickStaff;
      applyRolePermissions();
      document.getElementById('userTag').textContent = d.role === 'management' ? 'Management' : (d.myRank || 'Staff');

      if (d.role !== 'management') {
        document.getElementById('overviewManagement').style.display = 'none';
        document.getElementById('overviewStaff').style.display = '';
        renderStatGrid('myOverviewStats', [
          [d.myStats.solvedTickets, 'Solved tickets'],
          [d.myStats.totalClaims, 'Total claims'],
          [d.myStats.unclaimedTickets, 'Unclaimed'],
        ]);
        renderRankupPanel(d.myRankup ? [d.myRankup] : [], 'myRankupList');
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
        [d.partnerCount, 'Partners'],
        [d.totalPlayersSeen, 'Total players seen'],
        [d.openTickets, 'Open tickets'],
        [d.totalReviews, 'Reviews'],
        [d.pendingStaffApps, 'Pending staff apps'],
        [d.pendingPartnerApps, 'Pending partner apps'],
        [d.scamsToday, 'Scams today', d.scamsToday > 0 ? 'warn' : ''],
        [d.scamsTotal, 'Scams logged (all-time)']
      ]);
      setBadge('badgeStaffApps', d.pendingStaffApps);
      setBadge('badgePartnerApps', d.pendingPartnerApps);
      return Promise.all([
        loadGrowthChart(currentGrowthGranularity),
        callAdmin('staff.rankups').then(function (rd) { if (rd && rd.ok) renderRankupPanel(rd.rankups || []); })
      ]);
    });
  }

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
        '<div class="progress-row"><span class="progress-check ' + (r.tickets.ok ? 'ok' : 'no') + '">' + (r.tickets.ok ? '✅' : '⬜') + '</span>' +
          '<span class="progress-label">' + r.tickets.current + '/' + r.tickets.needed + ' tickets</span>' +
          '<div class="progress-bar"><div class="progress-bar-fill ' + (r.tickets.ok ? 'ok' : '') + '" style="width:' + ticketsPct + '%;"></div></div></div>'
      ];
      if (r.reps) {
        const repsPct = Math.min(100, Math.round((r.reps.current / r.reps.needed) * 100));
        rows.push(
          '<div class="progress-row"><span class="progress-check ' + (r.reps.ok ? 'ok' : 'no') + '">' + (r.reps.ok ? '✅' : '⬜') + '</span>' +
            '<span class="progress-label">' + r.reps.current + '/' + r.reps.needed + ' reputation</span>' +
            '<div class="progress-bar"><div class="progress-bar-fill ' + (r.reps.ok ? 'ok' : '') + '" style="width:' + repsPct + '%;"></div></div></div>'
        );
      }
      rows.push(
        '<div class="progress-row"><span class="progress-check ' + (r.activity.ok ? 'ok' : 'no') + '">' + (r.activity.ok ? '✅' : '⬜') + '</span>' +
          '<span class="progress-label" style="min-width:auto;">' + escapeHtml(r.activity.label) + '</span></div>'
      );
      return (
        '<div class="rankup-card">' +
          '<div class="rankup-head">' +
            '<img class="rankup-avatar" src="' + avatarUrl(r.id, r.avatar) + '"/>' +
            '<span class="rankup-name">' + userLink(r.id, r.username) + '</span>' +
            '<span class="rankup-path">' + escapeHtml(r.currentRank) + ' → ' + escapeHtml(r.nextRank) + (r.eligible ? ' · ✅ eligible' : '') + '</span>' +
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
      d.members.forEach(function (m) { wireMemberActions(m, document.getElementById('member-' + m.id)); });
    });
  }
  memberSearchBtn.addEventListener('click', runMemberSearch);
  memberSearchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runMemberSearch(); });

  function renderMemberCard(m, idPrefix) {
    idPrefix = idPrefix || 'member-';
    const roles = (m.roles || []).map(function (r) { return '<span class="pill" style="background:rgba(255,255,255,0.06);color:' + (r.color && r.color !== '#000000' ? r.color : 'var(--muted)') + ';">' + escapeHtml(r.name) + '</span>'; }).join(' ');
    return (
      '<div class="app-card" id="' + idPrefix + m.id + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' + escapeHtml(m.globalName || m.username) + ' <span class="app-card-meta">@' + escapeHtml(m.username) + ' · ' + m.id + '</span></div>' +
          '<div class="app-card-actions">' +
            (m.isStaff && canKickStaff ? '<button class="btn-small danger" data-action="kickStaff" data-id="' + m.id + '">Kick from staff</button>' : '') +
            (m.timedOutUntil ? '<button class="btn-small success" data-action="removeTimeout" data-id="' + m.id + '">Remove timeout</button>' : '<button class="btn-small" data-action="timeout" data-id="' + m.id + '">Timeout</button>') +
            '<button class="btn-small danger" data-action="kick" data-id="' + m.id + '">Kick</button>' +
            (canReviewApplications ? '<button class="btn-small danger" data-action="ban" data-id="' + m.id + '">Ban</button>' : '') +
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
  function wireMemberActions(m, card, onDone) {
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
            if (d && d.ok) { showToast('Done.', 'success'); (onDone || runMemberSearch)(); }
            else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
          });
        });
      });
    });
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
  function loadLeaderboard() {
    return callAdmin('leaderboard').then(function (d) {
      if (!d || !d.ok) return;
      const activeRows = d.mostActive.map(function (a, i) {
        return '<tr><td class="mono">#' + (i + 1) + '</td><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(a.userId, a.avatar) + '"/>' + userLink(a.userId, a.username || a.userId) + '</td><td class="mono">' + a.messageCount + '</td></tr>';
      }).join('') || emptyRow(3, 'No chat activity recorded this week yet.');
      document.getElementById('mostActiveTable').innerHTML =
        '<thead><tr><th>#</th><th>Member</th><th>Messages</th></tr></thead><tbody>' + activeRows + '</tbody>';

      const playtimeRows = d.monthly.map(function (p, i) {
        return '<tr><td class="mono">#' + (i + 1) + '</td><td>' + escapeHtml(p.username) + (p.isLite ? ' <span class="pill accepted" style="margin-left:6px;">LITE</span>' : '') + '</td><td class="mono">' + formatDuration(p.ms) + '</td></tr>';
      }).join('') || emptyRow(3, 'No playtime recorded yet this month.');
      document.getElementById('playtimeTable').innerHTML =
        '<thead><tr><th>#</th><th>Player</th><th>Playtime</th></tr></thead><tbody>' + playtimeRows + '</tbody>';

      const staffRows = d.staffLeaderboard.map(function (s, i) {
        return '<tr><td class="mono">#' + (i + 1) + '</td><td class="mono">' + userLink(s.userId, s.userId) + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + formatDuration(s.totalResolutionMs) + '</td></tr>';
      }).join('') || emptyRow(5, 'No staff activity recorded yet.');
      document.getElementById('staffLeaderboardTable').innerHTML =
        '<thead><tr><th>#</th><th>User ID</th><th>Solved</th><th>Claims</th><th>Avg. handling</th></tr></thead><tbody>' + staffRows + '</tbody>';
    });
  }
  function loadStaff() {
    return callAdmin('staff.list').then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.staff.map(function (s) {
        const color = s.rankColor || '#6b8fa8';
        const rankPill = s.rank ? '<span class="pill" style="background:' + color + '1a;color:' + color + ';">' + escapeHtml(s.rank) + '</span>' : '—';
        return '<tr><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.id, s.avatar) + '"/>' + userLink(s.id, s.tag) + '</td><td>' + rankPill + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + s.unclaimedTickets + '</td></tr>';
      }).join('') || emptyRow(5, 'No staff members found.');
      document.getElementById('staffTable').innerHTML =
        '<thead><tr><th>Member</th><th>Rank</th><th>Solved</th><th>Claims</th><th>Unclaimed</th></tr></thead><tbody>' + rows + '</tbody>';
    });
  }
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
          '<div class="app-card-user">' + userLink(a.discordId, a.username || a.discordId) + ' <span class="app-card-meta">' + a.discordId + '</span></div>' +
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
          '<div class="app-card-user">' + userLink(a.discordId, a.username || a.discordId) + ' <span class="app-card-meta">' + a.discordId + '</span></div>' +
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
  const REVIEWS_PAGE_SIZE = 10;
  function loadReviews() {
    return callAdmin('reviews.list').then(function (d) {
      if (!d || !d.ok) return;
      renderReviews(d.reviews, REVIEWS_PAGE_SIZE);
    });
  }
  function renderReviews(reviews, limit) {
    const shown = limit ? reviews.slice(0, limit) : reviews;
    const rows = shown.map(function (r) {
      return '<tr><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(r.discordId, r.avatar) + '"/>' + userLink(r.discordId, r.username) + '</td><td class="mono">' + escapeHtml(r.stars || '') + '</td><td style="max-width:340px;">' + escapeHtml((r.comment || '').slice(0, 140)) + '</td><td>' + '<button class="btn-small danger" data-remove="' + r.discordId + '">Remove</button></td></tr>';
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
  function loadTickets() {
    return callAdmin('tickets.overview').then(function (d) {
      if (!d || !d.ok) return;
      document.getElementById('ticketsStats').innerHTML =
        '<div class="stat-card"><div class="num">' + d.openCount + '</div><div class="label">Open tickets</div></div>' +
        '<div class="stat-card"><div class="num">' + d.closedCount + '</div><div class="label">Closed tickets</div></div>';
      const rows = d.open.map(function (t) {
        const name = (t.isPriority ? '<span class="priority-flag" title="Priority ticket">⚡</span>' : '') + escapeHtml(t.name);
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
        const name = (t.isPriority ? '<span class="priority-flag" title="Priority ticket">⚡</span>' : '') + escapeHtml(t.channelName || t.channelId);
        return '<tr class="clickable-row ' + (t.isPriority ? 'priority-row' : '') + '" data-channel="' + t.channelId + '">' +
          '<td>' + name + '</td>' +
          '<td class="mono">' + escapeHtml(t.category || '—') + '</td>' +
          '<td>' + created + '</td>' +
          '<td class="mono">' + formatRelative(t.createdAt) + '</td>' +
          '<td>' + claimed + '</td>' +
          '<td>' + closed + '</td>' +
          '<td><span class="pill ' + (TICKET_ARCHIVE_STATUS_PILL[t.status] || '') + '">' + escapeHtml(t.status) + '</span></td>' +
          '<td><button class="btn-small" data-transcript="' + t.channelId + '">View chat</button></td>' +
        '</tr>';
      }).join('') || emptyRow(8, 'No archived tickets yet.');
      const table = document.getElementById('ticketArchiveTable');
      table.innerHTML =
        '<thead><tr><th>Ticket</th><th>Category</th><th>Created by</th><th>Created</th><th>Claimed by</th><th>Closed by</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('button[data-transcript]').forEach(function (btn) {
        btn.addEventListener('click', function () { openTranscript(btn.dataset.transcript); });
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
        return '<a href="' + escapeHtml(a.url) + '" target="_blank" class="transcript-attachment">📎 ' + escapeHtml(a.name) + '</a>';
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
      transcriptTitle.textContent = (t.isPriority ? '⚡ ' : '') + (t.channelName || t.channelId);
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
  const liveTicketInput = document.getElementById('liveTicketInput');
  const liveTicketSendBtn = document.getElementById('liveTicketSendBtn');
  let currentLiveTicketChannelId = null;
  function openLiveTicket(channelId) {
    currentLiveTicketChannelId = channelId;
    liveTicketTitle.textContent = 'Loading ticket…';
    liveTicketMeta.innerHTML = '';
    liveTicketMessages.innerHTML = '';
    liveTicketInput.value = '';
    liveTicketModal.classList.add('active');
    callAdmin('tickets.get', { channelId: channelId }).then(function (d) {
      if (!d || !d.ok) { liveTicketTitle.textContent = 'Failed to load ticket'; return; }
      const t = d.ticket;
      liveTicketTitle.textContent = (t.isPriority ? '⚡ ' : '') + (t.channelName || t.channelId);
      liveTicketMeta.innerHTML =
        (t.isPriority ? '<span class="pill priority">Priority</span>' : '') +
        '<span>Category: <strong>' + escapeHtml(t.category || '—') + '</strong></span>' +
        '<span>Created by <strong>' + userLink(t.createdBy, t.createdBy || '—') + '</strong></span>' +
        (t.claimedBy ? '<span>Claimed by <strong>' + userLink(t.claimedBy, t.claimedBy) + '</strong></span>' : '<span>Unclaimed</span>');
      liveTicketMessages.innerHTML = renderTranscriptMessagesHtml(t.messages || []);
      liveTicketMessages.scrollTop = liveTicketMessages.scrollHeight;
    });
  }
  function sendLiveTicketMessage() {
    const content = liveTicketInput.value.trim();
    if (!content || !currentLiveTicketChannelId) return;
    liveTicketSendBtn.disabled = true;
    callAdmin('tickets.sendMessage', { channelId: currentLiveTicketChannelId, content: content }).then(function (d) {
      liveTicketSendBtn.disabled = false;
      if (d && d.ok) {
        liveTicketInput.value = '';
        showToast('Message sent.', 'success');
        openLiveTicket(currentLiveTicketChannelId);
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  }
  liveTicketSendBtn.addEventListener('click', sendLiveTicketMessage);
  liveTicketInput.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendLiveTicketMessage();
  });
  document.getElementById('liveTicketCloseBtn').addEventListener('click', function () { liveTicketModal.classList.remove('active'); });
  liveTicketModal.addEventListener('click', function (e) { if (e.target === liveTicketModal) liveTicketModal.classList.remove('active'); });
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
