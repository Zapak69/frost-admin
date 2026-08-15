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
    overview: 'Overview', members: 'Members', leaderboard: 'Leaderboards', staff: 'Staff Team',
    staffApps: 'Staff Applications', partnerApps: 'Partner Applications', scams: 'Scam Database',
    logs: 'Action Logs', excuses: 'Excuses', reviews: 'Reviews', drops: 'Publish Drop', giveaway: 'Publish Giveaway', tickets: 'Tickets',
    ticketArchive: 'Ticket Archive'
  };
  const VIEW_LOADERS = {
    overview: loadOverview, members: function () {}, leaderboard: loadLeaderboard, staff: loadStaff,
    staffApps: function () { loadStaffApps(currentStaffAppsFilter); },
    partnerApps: function () { loadPartnerApps(currentPartnerAppsFilter); },
    scams: function () { loadScams(currentScamsFilter); }, logs: loadLogs, excuses: loadExcuses, reviews: loadReviews,
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
      if (!d || !d.ok) {
        if (d && d.error && d.error !== 'forbidden') showToast('Could not load overview: ' + d.error, 'error');
        return;
      }
      canReviewApplications = !!d.canReviewApplications;
      canPublishContent = !!d.canPublishContent;
      canKickStaff = !!d.canKickStaff;
      applyRolePermissions();
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

  const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function monthLabelHtml(dateObj) {
    return '<div class="activity-cal-month-label">' + MONTH_NAMES[dateObj.getMonth()] + ' ' + dateObj.getFullYear() + '</div>';
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
    const weekdayHtml = WEEKDAY_LABELS.map(function (w) { return '<div class="activity-cal-weekday">' + w + '</div>'; }).join('');
    let bodyHtml = '';
    if (days.length) {
      const parts = days[0].date.split('-');
      const firstDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      bodyHtml += monthLabelHtml(firstDate) + monthPadHtml(firstDate);
    }
    days.forEach(function (d, i) {
      const dayNum = Number(d.date.slice(8, 10));
      if (i > 0 && dayNum === 1) {
        const parts = d.date.split('-');
        const monthStart = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
        bodyHtml += monthLabelHtml(monthStart) + monthPadHtml(monthStart);
      }
      const isToday = d.date === todayStr;
      const excuse = excuseDays[d.date];
      const inStreak = streakDates.has(d.date);
      const cls = 'activity-day' + (d.active ? ' active' : '') + (isToday && !d.active ? ' inactive-today' : '') + (excuse ? ' has-excuse' : '') + (inStreak ? ' in-streak' : '');
      bodyHtml += '<div class="' + cls + '" data-date="' + d.date + '">' + (inStreak ? '🔥' : dayNum) + '</div>';
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

  function renderExcuseCalendar() {
    const year = excuseCalMonth.getFullYear(), month = excuseCalMonth.getMonth();
    excuseCalLabel.textContent = MONTH_NAMES[month] + ' ' + year;
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < startOffset; i++) html += '<div class="lite-cal-day empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const key = localDateKey(new Date(year, month, day));
      const isSelected = excuseSelectedDays.has(key);
      html += '<div class="lite-cal-day' + (isSelected ? ' selected' : '') + '" data-date="' + key + '">' + day + '</div>';
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
    callAdmin('staff.submitExcuse', { reason: reason, days: Array.from(excuseSelectedDays) }).then(function (d) {
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
          askConfirm('Delete excuse?', "Permanently removes " + (e.username || e.userId) + "'s excuse.", {}).then(function (res) {
            if (!res.ok) return;
            callAdmin('staff.excuses.delete', { id: e.id }).then(function (d) {
              if (d && d.ok) { showToast('Excuse deleted.', 'success'); loadExcuses(); }
              else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
            });
          });
          return;
        }
        askConfirm(action === 'approve' ? 'Approve excuse?' : 'Reject excuse?', (e.username || e.userId) + "'s excuse.", {}).then(function (res) {
          if (!res.ok) return;
          callAdmin('staff.excuses.decide', { id: e.id, decision: action }).then(function (d) {
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
    const liteBtn = (canPublishContent && !m.isBot) ? '<button class="btn-small" data-lite-id="' + m.id + '" data-lite-name="' + escapeHtml(m.globalName || m.username) + '">Grant Lite</button>' : '';
    const liteStatus = (m.lite && m.lite.gifted)
      ? '<span>Lite until <strong style="color:var(--success);">' + formatDateTime(Date.parse(m.lite.expiresAt)) + '</strong> (gifted)</span>'
      : (m.hasLiteRole ? '<span>Lite: <strong style="color:var(--success);">purchased</strong></span>' : '');
    return (
      '<div class="app-card" id="' + idPrefix + m.id + '">' +
        '<div class="app-card-head">' +
          '<div class="app-card-user"><img class="app-card-avatar" src="' + avatarUrl(m.id, m.avatar) + '"/>' + escapeHtml(m.globalName || m.username) + ' <span class="app-card-meta">@' + escapeHtml(m.username) + ' · ' + m.id + '</span></div>' +
          '<div class="app-card-actions">' + modActions + liteBtn + '</div>' +
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
    const liteBtn = card.querySelector('button[data-lite-id]');
    if (liteBtn) liteBtn.addEventListener('click', function () { openLiteModal(liteBtn.dataset.liteId, liteBtn.dataset.liteName, onDone); });
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
    callAdmin('members.grantLite', { targetId: liteTargetId, days: days, source: 'gift' }).then(function (d) {
      if (d && d.ok) {
        showToast('Lite granted for ' + days + ' day(s).', 'success');
        liteModal.classList.remove('active');
        if (liteOnDone) liteOnDone();
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });
  const LB_PAGE_SIZE = 10;
  const lbData = { mostActive: [], playtime: [], staffLeaderboard: [] };
  const lbExpanded = { mostActive: false, playtime: false, staffLeaderboard: false };

  function renderMostActiveTable() {
    const rows = lbData.mostActive.slice(0, lbExpanded.mostActive ? undefined : LB_PAGE_SIZE).map(function (a, i) {
      return '<tr><td class="mono">#' + (i + 1) + '</td><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(a.userId, a.avatar) + '"/>' + userLink(a.userId, a.username || a.userId) + '</td><td class="mono">' + a.messageCount + '</td></tr>';
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
      return '<tr><td class="mono">#' + (i + 1) + '</td><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.userId, s.avatar) + '"/>' + userLink(s.userId, s.username || s.userId) + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + formatDuration(s.totalResolutionMs) + '</td></tr>';
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
  function loadStaff() {
    return callAdmin('staff.list').then(function (d) {
      if (!d || !d.ok) return;
      const rows = d.staff.map(function (s) {
        const color = s.rankColor || '#6b8fa8';
        const rankPill = s.rank ? '<span class="pill" style="background:' + color + '1a;color:' + color + ';">' + escapeHtml(s.rank) + '</span>' : '—';
        const actions = canReviewApplications
          ? '<button class="btn-small" data-calendar-id="' + s.id + '" data-calendar-name="' + escapeHtml(s.tag) + '">Active days</button> ' +
            '<button class="btn-small danger" data-warn-id="' + s.id + '" data-warn-name="' + escapeHtml(s.tag) + '">Warn</button> ' +
            '<button class="btn-small" data-promote-id="' + s.id + '" data-promote-name="' + escapeHtml(s.tag) + '" data-promote-rank="' + escapeHtml(s.rank || 'Unranked') + '">Promote</button>'
          : '';
        const streak = (s.currentStreak || 0) > 0 ? '🔥 ' + s.currentStreak : '—';
        return '<tr><td class="cell-user"><img class="cell-avatar" src="' + avatarUrl(s.id, s.avatar) + '"/>' + userLink(s.id, s.tag) + '</td><td>' + rankPill + '</td><td class="mono">' + s.solvedTickets + '</td><td class="mono">' + s.totalClaims + '</td><td class="mono">' + s.unclaimedTickets + '</td><td class="mono">' + streak + '</td><td class="mono">' + (s.reviewCount || 0) + '</td><td>' + actions + '</td></tr>';
      }).join('') || emptyRow(8, 'No staff members found.');
      const table = document.getElementById('staffTable');
      table.innerHTML =
        '<thead><tr><th>Member</th><th>Rank</th><th>Solved</th><th>Claims</th><th>Unclaimed</th><th>Streak</th><th>Reviews</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('button[data-calendar-id]').forEach(function (btn) {
        btn.addEventListener('click', function () { openStaffCalendar(btn.dataset.calendarId, btn.dataset.calendarName); });
      });
      table.querySelectorAll('button[data-promote-id]').forEach(function (btn) {
        btn.addEventListener('click', function () { openPromoteModal(btn.dataset.promoteId, btn.dataset.promoteName, btn.dataset.promoteRank); });
      });
      table.querySelectorAll('button[data-warn-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const targetId = btn.dataset.warnId, name = btn.dataset.warnName;
          askConfirm('Warn ' + name + '?', 'This posts to the staff warn log channel and DMs them the reason.', { reason: true }).then(function (res) {
            if (!res.ok) return;
            if (!res.reason) { showToast('Please write a reason.', 'error'); return; }
            callAdmin('staff.warn', { targetId: targetId, reason: res.reason }).then(function (d) {
              if (d && d.ok) { showToast('Warning issued.', 'success'); loadStaff(); }
              else showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
            });
          });
        });
      });
    });
  }

  const calendarModal = document.getElementById('calendarModal');
  function openStaffCalendar(userId, name) {
    document.getElementById('calendarModalName').textContent = name;
    document.getElementById('calendarModalGrid').innerHTML = '';
    document.getElementById('calendarModalWarnings').innerHTML = '';
    document.getElementById('calendarModalStats').innerHTML = '';
    document.getElementById('calendarModalExcuseDetail').style.display = 'none';
    calendarModal.classList.add('active');
    callAdmin('staff.calendar', { targetId: userId }).then(function (d) {
      if (!d || !d.ok) return;
      if (d.stats) {
        renderStatGrid('calendarModalStats', [
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
        onExcuseClick: function (excuse) {
          const box = document.getElementById('calendarModalExcuseDetail');
          box.style.display = '';
          box.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><strong>Excuse</strong><span class="pill ' + excusePillClass(excuse.status) + '">' + escapeHtml(excuse.status) + '</span><span class="app-card-meta" style="margin-left:auto;">' + formatRelative(excuse.submittedAt) + '</span></div>' +
            '<div style="font-size:13px;color:var(--text);">' + escapeHtml(excuse.reason) + '</div>';
        }
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
    callAdmin('staff.promote', { targetId: currentPromoteTargetId, reason: reason }).then(function (d) {
      if (d && d.ok) {
        showToast('Promoted to ' + d.newRank + '.', 'success');
        promoteModal.classList.remove('active');
        loadStaff();
      } else {
        showToast('Failed: ' + (d && d.error || 'unknown error'), 'error');
      }
    });
  });
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
        return '<tr class="clickable-row" data-scam-index="' + i + '"><td class="mono" style="white-space:nowrap;">' + formatRelative(e.timestamp) + '</td><td><span class="pill ' + e.type + '">' + e.type + '</span></td><td>' + target + '</td><td>' + content + '</td><td>' + actionedBy + '</td><td class="mono">' + (attachCount || '—') + '</td></tr>';
      }).join('') || emptyRow(6, 'No scam entries logged yet.');
      const table = document.getElementById('scamsTable');
      table.innerHTML =
        '<thead><tr><th>When</th><th>Type</th><th>Target</th><th>Content</th><th>Actioned by</th><th>Files</th></tr></thead><tbody>' + rows + '</tbody>';
      table.querySelectorAll('tr[data-scam-index]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.user-link')) return;
          openScamDetail(loadedScamEntries[Number(row.dataset.scamIndex)]);
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
        ? '<a href="' + escapeHtml(a.url) + '" target="_blank" class="transcript-attachment">📎 ' + escapeHtml(a.name) + '</a>'
        : '<span class="transcript-attachment" style="color:var(--muted-dim);cursor:default;">📎 ' + escapeHtml(a.name) + ' (expired)</span>';
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
  function loadReviews() {
    return callAdmin('reviews.list').then(function (d) {
      if (!d || !d.ok) return;
      renderReviews(d.reviews, REVIEWS_PAGE_SIZE);
    });
  }
  function renderReviews(reviews, limit) {
    const shown = limit ? reviews.slice(0, limit) : reviews;
    const rows = shown.map(function (r) {
      const removeBtn = (r.discordId && canPublishContent) ? '<button class="btn-small danger" data-remove="' + r.discordId + '">Remove</button>' : '';
      return '<tr><td class="cell-user"><img class="cell-avatar" src="' + reviewAvatarUrl(r) + '"/>' + userLink(r.discordId, r.username) + '</td><td class="mono">' + escapeHtml(r.stars || '') + '</td><td style="max-width:340px;">' + escapeHtml((r.comment || '').slice(0, 140)) + '</td><td>' + removeBtn + '</td></tr>';
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
  function openLiveTicket(channelId) {
    liveTicketTitle.textContent = 'Loading ticket…';
    liveTicketMeta.innerHTML = '';
    liveTicketMessages.innerHTML = '';
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
