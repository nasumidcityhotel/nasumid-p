/**
 * ui.js
 * UI描画・承認ワークフロー・各ページレンダリング
 */

// ===== ページ切替 =====
function switchPage(pageId, updateHash = true) {
  if (updateHash) {
    location.hash = pageId;
    return; // hashchangeイベント側で実際の切り替えを行う
  }
  const pageEl = document.getElementById('page-' + pageId);
  const navEl = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  
  if (!pageEl || !navEl) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  pageEl.classList.add('active');
  navEl.classList.add('active');
  const titles = {
    dashboard: 'ダッシュボード',
    proposals: '価格提案一覧',
    calendar:  '価格カレンダー',
    market:    '競合調査・市場相場',
    history:   '承認・却下履歴',
    settings:  '価格設定',
    csv:       'CSVインポート'
  };
  const titleContainer = document.getElementById('page-title');
  if (titleContainer) {
    const pageLabel = titleContainer.querySelector('.page-label');
    if (pageLabel) {
      pageLabel.textContent = ' | ' + (titles[pageId] || pageId);
    }
  }

  // ページ固有の描画
  if (pageId === 'proposals') renderProposals();
  if (pageId === 'calendar')  renderCalendar();
  if (pageId === 'market')    renderMarketResearch();
  if (pageId === 'history')   renderHistory();
  if (pageId === 'settings')  renderSettings();
  if (pageId === 'csv')       renderManualDataTable();
}

// ===== バッジ更新 =====
function updateBadges() {
  const pending = AppState.proposals.filter(p => p.status === 'pending').length;
  const badge = document.getElementById('badge-proposals');
  const kpiPending = document.getElementById('kpi-pending');
  if (pending > 0) {
    badge.textContent = pending;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
  if (kpiPending) kpiPending.textContent = pending;
  
  const urgentCount = AppState.proposals.filter(p => p.status === 'pending' && (p.confidence * 100) >= 80).length;
  const urgentEl = document.getElementById('dashboard-urgent-count');
  if (urgentEl) urgentEl.textContent = urgentCount;
}

function scrollToProposals() {
  const table = document.getElementById('dashboard-proposals-table');
  if (table) table.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== ダッシュボード描画 =====
function renderDashboard() {
  renderDashboardProposals();
  updateBadges();
}

function renderDashboardProposals() {
  const tbody = document.getElementById('dashboard-proposals-body');
  if (!tbody) return;
  const pending = AppState.proposals.filter(p => p.status === 'pending').slice(0, 8);
  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px;">
      承認待ちの提案はありません。「価格再計算」ボタンで提案を生成できます。
    </td></tr>`;
    return;
  }
  tbody.innerHTML = pending.map(p => {
    const diff = p.proposedPrice - p.currentPrice;
    const diffStr = diff > 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`;
    const diffClass = diff > 0 ? 'change-up' : 'change-down';
    const conf = Math.round(p.confidence * 100);
    
    // --- 運用フローに基づいた色分け ---
    let rowClass = '';
    let statusHint = '';
    if (conf >= 80) {
      rowClass = 'row-urgent'; // 赤
      statusHint = '<span class="status-badge approved" style="font-size:10px;">即決推奨</span>';
    } else if (conf >= 70) {
      rowClass = 'row-warning'; // 黄
      statusHint = '<span class="status-badge" style="font-size:10px;background:#fef3c7;color:#92400e;">要確認</span>';
    } else {
      rowClass = 'row-safe';    // 緑
      statusHint = '<span class="status-badge" style="font-size:10px;background:#f1f5f9;color:#64748b;">見送り可</span>';
    }

    const confClass = conf >= 80 ? '' : conf >= 65 ? 'medium' : 'low';
    const mainReason = p.reasons[0] ? p.reasons[0].label : '需要予測';

    return `<tr class="${rowClass}">
      <td>${formatDateShort(p.date)} ${statusHint}</td>
      <td><strong>${p.roomName}</strong></td>
      <td>${formatCurrency(p.currentPrice)}</td>
      <td><strong class="${diffClass}">${formatCurrency(p.proposedPrice)}</strong></td>
      <td class="${diffClass}">${diffStr}</td>
      <td><span class="reason-tag ${p.reasons[0]?.type || ''}">${mainReason}</span></td>
      <td>
        <div class="confidence-bar">
          <div class="conf-track"><div class="conf-fill ${confClass}" style="width:${conf}%"></div></div>
          <span>${conf}%</span>
        </div>
      </td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openApprovalModal('${p.id}')">判断</button>
      </td>
    </tr>`;
  }).join('');
}

// ===== 価格提案ページ描画 =====
function renderProposals() {
  const container = document.getElementById('proposals-container');
  if (!container) return;

  const filter = document.getElementById('proposal-filter')?.value || 'all';
  const roomFilter = document.getElementById('room-filter')?.value || 'all';

  let proposals = [...AppState.proposals];
  if (filter !== 'all') proposals = proposals.filter(p => p.status === filter);
  if (roomFilter !== 'all') proposals = proposals.filter(p => p.roomName === roomFilter);

  if (proposals.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <i class="fas fa-lightbulb"></i>
      <p>表示する価格提案がありません<br><small>「価格再計算」ボタンで新しい提案を生成できます</small></p>
    </div>`;
    return;
  }

  const html = `<div class="proposals-grid">${proposals.map(p => renderProposalCard(p)).join('')}</div>`;
  container.innerHTML = html;
}

function renderProposalCard(p) {
  const diff = p.proposedPrice - p.currentPrice;
  const diffStr = diff > 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`;
  const diffClass = diff > 0 ? 'up' : 'down';
  const conf = Math.round(p.confidence * 100);
  const confFillClass = conf >= 80 ? '' : conf >= 65 ? 'medium' : 'low';

  const reasonTagsHtml = p.reasons.slice(0, 4).map(r =>
    `<span class="reason-tag ${r.type || ''}"><i class="fas ${r.icon}"></i> ${r.label}</span>`
  ).join('');

  const statusLabel = {
    pending: '承認待ち',
    approved: '承認済み',
    rejected: '却下済み'
  }[p.status];

  const footerHtml = p.status === 'pending'
    ? `<button class="btn btn-sm btn-success" onclick="openApprovalModal('${p.id}')">
        <i class="fas fa-check"></i> 承認
      </button>
      <button class="btn btn-sm btn-danger" onclick="quickReject('${p.id}')">
        <i class="fas fa-times"></i> 却下
      </button>`
    : `<span class="status-badge ${p.status}">${statusLabel}</span>
       <span class="text-muted" style="font-size:12px;">${p.approvedBy ? p.approvedBy + ' /' : ''} ${p.approvedAt ? formatDateShort(p.approvedAt.split('T')[0]) : ''}</span>`;

  return `
  <div class="proposal-card ${p.status}" id="proposal-${p.id}">
    <div class="proposal-header">
      <div>
        <div class="proposal-date">${formatDate(p.date)}</div>
        <div class="proposal-room">${p.roomName} | 稼働率予測: ${Math.round(p.occupancy*100)}%</div>
      </div>
      <span class="status-badge ${p.status}">${statusLabel}</span>
    </div>
    <div class="proposal-body">
      <div class="proposal-prices">
        <div class="price-now">
          <div class="price-label">現在価格</div>
          <div class="price-val">${formatCurrency(p.currentPrice)}</div>
        </div>
        <div class="price-arrow"><i class="fas fa-arrow-right"></i></div>
        <div class="price-proposed">
          <div class="price-label">提案価格</div>
          <div class="price-val">${formatCurrency(p.proposedPrice)}</div>
        </div>
        <span class="price-change-badge ${diffClass}">${diffStr}</span>
      </div>
      <div class="proposal-reasons">
        <h4><i class="fas fa-info-circle"></i> 変更理由</h4>
        <div class="reason-tags">${reasonTagsHtml}</div>
      </div>
      <div class="confidence-bar" style="margin-bottom:8px;">
        <span style="font-size:12px;color:var(--text-muted);min-width:60px;">信頼度</span>
        <div class="conf-track" style="flex:1;max-width:none;">
          <div class="conf-fill ${confFillClass}" style="width:${conf}%"></div>
        </div>
        <span style="font-size:12px;font-weight:700;">${conf}%</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);">
        上限: ${formatCurrency(p.maxPrice)} / 下限: ${formatCurrency(p.minPrice)}
      </div>
    </div>
    <div class="proposal-footer">${footerHtml}</div>
  </div>`;
}

// ===== 提案フィルター =====
function filterProposals() {
  renderProposals();
}

// ===== クイック却下 =====
function quickReject(proposalId) {
  if (!confirm('この提案を却下しますか？')) return;
  rejectProposalById(proposalId, '', '担当者A');
  showToast('提案を却下しました', 'warning');
  updateBadges();
  renderProposals();
  renderDashboard();
}

// ===== 承認モーダル =====
function openApprovalModal(proposalId) {
  const p = AppState.proposals.find(pr => pr.id === proposalId);
  if (!p) return;
  AppState.currentProposalId = proposalId;

  const diff = p.proposedPrice - p.currentPrice;
  const diffStr = diff > 0 ? `+¥${diff.toLocaleString()}（値上げ）` : `-¥${Math.abs(diff).toLocaleString()}（値下げ）`;
  const diffColor = diff > 0 ? '#dc2626' : '#0891b2';

  document.getElementById('modal-title').textContent =
    `価格変更の確認 ー ${p.roomName}（${formatDateShort(p.date)}）`;

  const reasonList = p.reasons.map(r =>
    `<div class="modal-reason-item"><i class="fas ${r.icon}"></i>${r.label}</div>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-detail-grid">
      <div class="modal-detail-item">
        <div class="modal-detail-label">対象日</div>
        <div class="modal-detail-val">${formatDate(p.date)}</div>
      </div>
      <div class="modal-detail-item">
        <div class="modal-detail-label">部屋タイプ</div>
        <div class="modal-detail-val">${p.roomName}</div>
      </div>
      <div class="modal-detail-item">
        <div class="modal-detail-label">現在価格</div>
        <div class="modal-detail-val big">${formatCurrency(p.currentPrice)}</div>
      </div>
      <div class="modal-detail-item">
        <div class="modal-detail-label">AI提案価格</div>
        <div class="modal-detail-val big proposed">${formatCurrency(p.proposedPrice)}</div>
      </div>
      <div class="modal-detail-item">
        <div class="modal-detail-label">変動額</div>
        <div class="modal-detail-val" style="color:${diffColor};">${diffStr}</div>
      </div>
      <div class="modal-detail-item">
        <div class="modal-detail-label">稼働率予測</div>
        <div class="modal-detail-val">${Math.round(p.occupancy*100)}%</div>
      </div>
    </div>
    <div class="modal-reasons">
      <h4><i class="fas fa-lightbulb"></i> 価格変更の根拠</h4>
      <div class="modal-reason-list">${reasonList}</div>
    </div>
  `;

  const finalPriceInput = document.getElementById('modal-final-price');
  finalPriceInput.value = p.proposedPrice;
  finalPriceInput.min = p.minPrice;
  finalPriceInput.max = p.maxPrice;
  document.getElementById('modal-price-range-hint').textContent =
    `（下限: ${formatCurrency(p.minPrice)} ／ 上限: ${formatCurrency(p.maxPrice)}）`;

  document.getElementById('approval-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('approval-modal').style.display = 'none';
  AppState.currentProposalId = null;
}

function approveProposal() {
  const id = AppState.currentProposalId;
  if (!id) return;
  let finalPrice = parseInt(document.getElementById('modal-final-price').value);
  const p = AppState.proposals.find(pr => pr.id === id);
  if (!p) return;

  // バリデーション
  if (isNaN(finalPrice) || finalPrice < p.minPrice || finalPrice > p.maxPrice) {
    showToast(`価格は ${formatCurrency(p.minPrice)} 〜 ${formatCurrency(p.maxPrice)} の範囲で設定してください`, 'error');
    return;
  }

  finalPrice = Math.round(finalPrice / 1000) * 1000; // 千円単位
  approveProposalById(id, finalPrice, '担当者A');
  closeModal();
  showToast(`${p.roomName}（${formatDateShort(p.date)}）の価格変更を承認しました: ${formatCurrency(finalPrice)}`, 'success');
  updateBadges();
  renderProposals();
  renderDashboard();
}

function rejectProposal() {
  const id = AppState.currentProposalId;
  if (!id) return;
  rejectProposalById(id, '', '担当者A');
  closeModal();
  const p = AppState.proposals.find(pr => pr.id === id);
  showToast(`提案を却下しました`, 'warning');
  updateBadges();
  renderProposals();
  renderDashboard();
}

// ===== カレンダー描画 =====
function renderCalendar() {
  const container = document.getElementById('price-calendar');
  if (!container) return;

  const year = AppState.calendarMonth.getFullYear();
  const month = AppState.calendarMonth.getMonth();
  document.getElementById('cal-month-label').textContent = `${year}年${month+1}月`;

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = getTodayString();

  // ヘッダー
  const dows = ['日','月','火','水','木','金','土'];
  const dowClasses = ['text-danger','','','','','text-primary','text-danger'];
  const headerHtml = dows.map((d, i) =>
    `<div class="cal-dow" style="color:${i===0||i===6?'#ef4444':'var(--text-muted)'}">${d}</div>`
  ).join('');

  // 空白セル
  const blankCells = Array(firstDay).fill(`<div class="cal-cell other-month"></div>`).join('');

  // 日付セル
  const dayCells = Array.from({length: daysInMonth}, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = dateStr === today;

    // 提案を取得
    const proposal = AppState.proposals.find(
      p => p.date === dateStr && p.roomId === 'standard'
    );

    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const isWeekend = dow === 0 || dow === 6;
    const ev = AppState.settings.events.find(e => e.date === dateStr);

    let cellClass = 'cal-cell';
    if (isToday) cellClass += ' today';
    if (proposal?.status === 'approved') cellClass += ' cal-approved';
    else if (proposal?.status === 'pending') cellClass += ' cal-pending';

    const occ = proposal ? Math.round(proposal.occupancy * 100) : null;
    if (occ !== null) {
      if (occ >= 80) cellClass += ' cal-high';
      else if (occ < 50) cellClass += ' cal-low';
    }

    const price = proposal?.status === 'approved'
      ? (proposal.finalPrice || proposal.proposedPrice)
      : proposal?.proposedPrice;

    const dayLabel = `<div class="cal-day" style="color:${isWeekend?'#ef4444':'inherit'}">${day}</div>`;
    const priceHtml = price ? `<div class="cal-price">${formatCurrency(price)}</div>` : `<div class="cal-price" style="color:var(--text-light);font-size:11px;">基準価格</div>`;
    const occHtml = occ !== null ? `<div class="cal-occ">稼働 ${occ}%</div>` : '';
    const evHtml = ev ? `<div class="cal-status" style="color:#92400e;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${ev.name}">🎉 ${ev.name}</div>` : '';
    const statusHtml = proposal ? `<div class="cal-status">
      <span class="status-badge ${proposal.status}" style="font-size:10px;padding:1px 5px;">
        ${proposal.status === 'approved' ? '承認' : proposal.status === 'pending' ? '提案中' : '却下'}
      </span></div>` : '';

    return `<div class="${cellClass}" onclick="showCalDetail('${dateStr}')">
      ${dayLabel}${priceHtml}${occHtml}${evHtml}${statusHtml}
    </div>`;
  }).join('');

  container.innerHTML = headerHtml + blankCells + dayCells;
}

function prevMonth() {
  AppState.calendarMonth = new Date(
    AppState.calendarMonth.getFullYear(),
    AppState.calendarMonth.getMonth() - 1, 1
  );
  renderCalendar();
}
function nextMonth() {
  AppState.calendarMonth = new Date(
    AppState.calendarMonth.getFullYear(),
    AppState.calendarMonth.getMonth() + 1, 1
  );
  renderCalendar();
}

function showCalDetail(dateStr) {
  const card = document.getElementById('cal-detail-card');
  const title = document.getElementById('cal-detail-title');
  const body = document.getElementById('cal-detail-body');

  title.textContent = `${formatDate(dateStr)} の詳細`;

  const proposals = AppState.proposals.filter(p => p.date === dateStr);
  const ev = AppState.settings.events.find(e => e.date === dateStr);

  if (proposals.length === 0 && !ev) {
    body.innerHTML = `<p class="text-muted">この日の提案データはありません。</p>`;
    card.style.display = '';
    return;
  }

  const evHtml = ev ? `<div class="alert-bar" style="margin-bottom:12px;">
    <i class="fas fa-flag"></i> <strong>イベント:</strong> ${ev.name}（係数: ×${ev.coeff}）
  </div>` : '';

  const proposalRows = proposals.map(p => `
    <tr>
      <td><strong>${p.roomName}</strong></td>
      <td>${formatCurrency(p.currentPrice)}</td>
      <td><strong style="color:var(--primary)">${formatCurrency(p.proposedPrice)}</strong></td>
      <td>${Math.round(p.occupancy*100)}%</td>
      <td><span class="status-badge ${p.status}">${{pending:'提案中',approved:'承認済',rejected:'却下'}[p.status]}</span></td>
      <td>
        ${p.status === 'pending'
          ? `<button class="btn btn-sm btn-success" onclick="openApprovalModal('${p.id}')">承認</button>`
          : `<span class="text-muted">-</span>`}
      </td>
    </tr>`).join('');

  body.innerHTML = `
    ${evHtml}
    <div class="table-container">
      <table class="data-table">
        <thead><tr><th>部屋タイプ</th><th>現在価格</th><th>提案価格</th><th>稼働率</th><th>状態</th><th>操作</th></tr></thead>
        <tbody>${proposalRows}</tbody>
      </table>
    </div>
`;

  card.style.display = '';
  card.scrollIntoView({ behavior: 'smooth' });
}

// ===== 履歴描画 =====
function renderHistory() {
  const tbody = document.getElementById('history-body');
  const emptyDiv = document.getElementById('history-empty');
  if (!tbody) return;

  const search = document.getElementById('history-search')?.value?.toLowerCase() || '';
  let history = [...AppState.history];
  if (search) {
    history = history.filter(h =>
      h.date.includes(search) ||
      h.roomName.toLowerCase().includes(search) ||
      (h.operator || '').includes(search)
    );
  }

  if (history.length === 0) {
    tbody.innerHTML = '';
    emptyDiv.style.display = '';
    return;
  }
  emptyDiv.style.display = 'none';

  tbody.innerHTML = history.map(h => {
    const diff = h.newPrice - h.oldPrice;
    const diffStr = diff > 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`;
    const diffClass = diff > 0 ? 'change-up' : diff < 0 ? 'change-down' : 'change-neutral';
    const dt = new Date(h.actionAt);
    const dtStr = `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
    const mainReason = h.reasons?.[0]?.label || '-';
    return `<tr>
      <td style="white-space:nowrap;">${dtStr}</td>
      <td>${formatDateShort(h.date)}</td>
      <td>${h.roomName}</td>
      <td>${formatCurrency(h.oldPrice)}</td>
      <td><strong>${formatCurrency(h.newPrice)}</strong></td>
      <td class="${diffClass}">${diffStr}</td>
      <td><span class="reason-tag">${mainReason}</span></td>
      <td><span class="status-badge ${h.status}">${h.status === 'approved' ? '承認' : '却下'}</span></td>
      <td>${h.operator || '担当者A'}</td>
    </tr>`;
  }).join('');
}

function filterHistory() {
  renderHistory();
}

function exportHistoryCSV() {
  const history = AppState.history;
  if (history.length === 0) {
    showToast('エクスポートするデータがありません', 'info');
    return;
  }
  const header = '操作日時,対象日,部屋タイプ,旧価格,新価格,変動額,理由,ステータス,担当者\n';
  const rows = history.map(h => {
    const diff = h.newPrice - h.oldPrice;
    const dt = new Date(h.actionAt);
    const dtStr = `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${dt.getMinutes().toString().padStart(2,'0')}`;
    return [dtStr, h.date, h.roomName, h.oldPrice, h.newPrice, diff, h.reasons?.[0]?.label||'', h.status, h.operator||'担当者A'].join(',');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `価格変更履歴_${getTodayString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVをダウンロードしました', 'success');
}

// ===== 設定画面描画 =====
function renderSettings() {
  renderRoomSettings();
  renderWeekdayCoeffs();
  renderEventList();
  renderOccupancySettings();
}

function renderRoomSettings() {
  const tbody = document.getElementById('room-settings-body');
  if (!tbody) return;
  tbody.innerHTML = AppState.settings.rooms.map(room => `
    <tr>
      <td><strong>${room.name}</strong></td>
      <td>
        <input type="number" value="${room.base}" step="1000" min="1000" max="200000"
          onchange="updateRoomSetting('${room.id}', 'base', this.value)" style="width:100px;">
      </td>
      <td>
        <input type="number" value="${room.min}" step="1000" min="1000" max="200000"
          onchange="updateRoomSetting('${room.id}', 'min', this.value)" style="width:70px;">
      </td>
      <td>
        <input type="number" value="${room.max}" step="1000" min="1000" max="500000"
          onchange="updateRoomSetting('${room.id}', 'max', this.value)" style="width:70px;">
      </td>
      <td>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">1名:</div>
        <input type="number" value="${room.maxChangeUp1 || 1000}" step="100" min="0" max="50000"
          onchange="updateRoomSetting('${room.id}', 'maxChangeUp1', this.value)" style="width:70px;margin-bottom:4px;"><br>
        ${room.id !== 'moderate' ? `
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">2名:</div>
          <input type="number" value="${room.maxChangeUp2 || 3000}" step="100" min="0" max="50000"
            onchange="updateRoomSetting('${room.id}', 'maxChangeUp2', this.value)" style="width:70px;">
        ` : ''}
      </td>
      <td>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">1名:</div>
        <input type="number" value="${room.maxChangeDown1 || 1000}" step="100" min="0" max="50000"
          onchange="updateRoomSetting('${room.id}', 'maxChangeDown1', this.value)" style="width:70px;margin-bottom:4px;"><br>
        ${room.id !== 'moderate' ? `
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">2名:</div>
          <input type="number" value="${room.maxChangeDown2 || 3000}" step="100" min="0" max="50000"
            onchange="updateRoomSetting('${room.id}', 'maxChangeDown2', this.value)" style="width:70px;">
        ` : ''}
      </td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${room.autoApprove ? 'checked' : ''}
            onchange="updateRoomSetting('${room.id}', 'autoApprove', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="previewRoomPrice('${room.id}')">
          <i class="fas fa-eye"></i> プレビュー
        </button>
      </td>
    </tr>
  `).join('');
}

function renderWeekdayCoeffs() {
  const container = document.getElementById('weekday-coeffs');
  if (!container) return;
  const dows = ['月','火','水','木','金','土','日'];
  container.innerHTML = dows.map(dow => `
    <div class="coeff-item">
      <label>${dow}</label>
      <input type="number" step="0.01" min="0.5" max="3.0"
        value="${AppState.settings.weekdayCoeff[dow] || 1.0}"
        onchange="updateWeekdayCoeff('${dow}', this.value)"
        style="${dow === '土' || dow === '日' ? 'color:#ef4444;font-weight:700;border-color:#ef4444;' : ''}">
    </div>
  `).join('');
}

function renderEventList() {
  const container = document.getElementById('event-list');
  if (!container) return;
  container.innerHTML = `<div class="event-list" id="event-rows">` +
    AppState.settings.events.map(ev => `
      <div class="event-row" id="event-row-${ev.id}">
        <input type="date" value="${ev.date}" onchange="updateEvent(${ev.id}, 'date', this.value)">
        <input type="text" value="${ev.name}" placeholder="イベント名" style="flex:1;"
          onchange="updateEvent(${ev.id}, 'name', this.value)">
        <label>係数:</label>
        <input type="number" value="${ev.coeff}" step="0.05" min="0.5" max="3.0"
          onchange="updateEvent(${ev.id}, 'coeff', this.value)" style="width:70px;">
        <button class="btn btn-sm btn-danger" onclick="removeEvent(${ev.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('') + `</div>`;
}

function renderOccupancySettings() {
  const rules = AppState.settings.occupancyRules;
  ['occ-90','occ-70','occ-50','occ-low'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = Object.values(rules)[i];
  });
  const el1 = document.getElementById('max-change-up');
  const el2 = document.getElementById('max-change-down');
  if (el1) el1.value = AppState.settings.maxChangeUp;
  if (el2) el2.value = AppState.settings.maxChangeDown;
}

// ===== 設定更新 =====
function updateRoomSetting(roomId, field, value) {
  const room = AppState.settings.rooms.find(r => r.id === roomId);
  if (!room) return;
  if (field === 'autoApprove') room.autoApprove = value;
  else room[field] = parseInt(value);
}

function updateWeekdayCoeff(dow, value) {
  AppState.settings.weekdayCoeff[dow] = parseFloat(value);
}

function updateEvent(id, field, value) {
  const ev = AppState.settings.events.find(e => e.id === id);
  if (!ev) return;
  if (field === 'coeff') ev.coeff = parseFloat(value);
  else ev[field] = value;
}

function removeEvent(id) {
  AppState.settings.events = AppState.settings.events.filter(e => e.id !== id);
  renderEventList();
}

function addEvent() {
  const today = getTodayString();
  const newEv = { id: AppState.nextEventId++, date: today, name: '新しいイベント', coeff: 1.20 };
  AppState.settings.events.push(newEv);
  renderEventList();
}

function saveSettings() {
  // 稼働率ルール
  AppState.settings.occupancyRules.occ90 = parseInt(document.getElementById('occ-90')?.value) || 25;
  AppState.settings.occupancyRules.occ70 = parseInt(document.getElementById('occ-70')?.value) || 10;
  AppState.settings.occupancyRules.occ50 = parseInt(document.getElementById('occ-50')?.value) || 0;
  AppState.settings.occupancyRules.occLow = parseInt(document.getElementById('occ-low')?.value) || -10;
  AppState.settings.maxChangeUp = parseInt(document.getElementById('max-change-up')?.value) || 5000;
  AppState.settings.maxChangeDown = parseInt(document.getElementById('max-change-down')?.value) || 3000;

  saveSettingsToStorage();
  showToast('設定を保存しました', 'success');
}

function previewRoomPrice(roomId) {
  const room = AppState.settings.rooms.find(r => r.id === roomId);
  if (!room) return;
  const today = getTodayString();
  const occ = 0.75;
  const price = calcProposedPrice(room, today, occ);
  showToast(`${room.name} 本日の推奨価格: ${formatCurrency(price)}（稼働率75%想定）`, 'info');
}

// ===== CSV関連 =====
let csvData = null;

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    parseCSV(text);
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    showToast('CSVファイルが空です', 'error');
    return;
  }
  const headers = lines[0].split(',').map(h => h.trim());
  csvData = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(row => Object.values(row).some(v => v));

  showCSVPreview(csvData.slice(0, 5), headers);
}

function showCSVPreview(rows, headers) {
  const container = document.getElementById('csv-preview');
  const tableContainer = document.getElementById('csv-preview-table');
  if (!container || !tableContainer) return;

  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = rows.map(row =>
    `<tr>${headers.map(h => `<td>${row[h]||''}</td>`).join('')}</tr>`
  ).join('');

  tableContainer.innerHTML = `
    <table class="data-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
    <p class="text-muted" style="margin-top:8px;font-size:12px;">全 ${csvData.length} 行を検出</p>`;
  container.style.display = '';
}

function importCSV() {
  if (!csvData) return;
  
  // CSVデータのマッピング（ヘッダー名に柔軟に対応）
  const importedCount = csvData.length;
  
  csvData.forEach(row => {
    // 日付、部屋、稼働率、ADRを抽出
    const date = row['日付'] || row['date'];
    const room = row['部屋タイプ'] || row['room'] || row['部屋'];
    const occStr = row['稼働率'] || row['occupancy'] || '0';
    const adrStr = row['ADR'] || row['price'] || row['単価'] || '0';
    const channel = row['チャネル'] || row['channel'] || '不明';
    
    if (date && room) {
      const occ = parseInt(occStr.toString().replace('%', ''));
      const adr = parseInt(adrStr.toString().replace(/[¥,]/g, ''));
      
      AppState.manualData.push({
        id: generateId(),
        date,
        room,
        occ: isNaN(occ) ? 0 : occ,
        adr: isNaN(adr) ? 0 : adr,
        channel,
        createdAt: new Date().toISOString()
      });
    }
  });

  saveManualData();
  showToast(`${importedCount}件のデータをインポートしました`, 'success');
  
  csvData = null;
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('csv-file-input').value = '';
  renderManualDataTable();
}

function cancelCSV() {
  csvData = null;
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('csv-file-input').value = '';
}

function clearAllManualData() {
  if (!confirm('全ての手動入力・インポートデータを削除してもよろしいですか？')) return;
  AppState.manualData = [];
  saveManualData();
  renderManualDataTable();
  showToast('全てのデータを削除しました', 'warning');
}

function downloadSampleCSV() {
  const content = '日付,部屋タイプ,販売室数,稼働率,ADR,チャネル,リードタイム,キャンセル数\n' +
    '2025-04-01,スタンダード,25,83%,16500,楽天トラベル,14,2\n' +
    '2025-04-01,デラックス,12,75%,22000,じゃらん,7,1\n' +
    '2025-04-02,スタンダード,20,67%,15000,公式サイト,21,0\n' +
    '2025-04-02,スイート,3,60%,38000,Booking.com,10,1\n';
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sample_data.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ===== 手動データ入力 =====
function addManualData() {
  const date = document.getElementById('manual-date')?.value;
  const room = document.getElementById('manual-room')?.value;
  const occ = parseInt(document.getElementById('manual-occ')?.value);
  const adr = parseInt(document.getElementById('manual-adr')?.value);
  const channel = document.getElementById('manual-channel')?.value;

  if (!date || !room || isNaN(occ) || isNaN(adr)) {
    showToast('全ての項目を入力してください', 'error');
    return;
  }

  AppState.manualData.push({ id: generateId(), date, room, occ, adr, channel, createdAt: new Date().toISOString() });
  saveManualData();
  showToast('データを追加しました', 'success');
  renderManualDataTable();

  // フォームリセット
  document.getElementById('manual-occ').value = '';
  document.getElementById('manual-adr').value = '';
}

function renderManualDataTable() {
  const container = document.getElementById('manual-data-table-container');
  if (!container) return;
  if (AppState.manualData.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:13px;">手動入力データはありません</p>';
    return;
  }
  const rows = [...AppState.manualData].reverse().slice(0, 20).map(d => `
    <tr>
      <td>${d.date}</td>
      <td>${d.room}</td>
      <td>${d.occ}%</td>
      <td>¥${d.adr.toLocaleString()}</td>
      <td>${d.channel}</td>
      <td><button class="btn btn-sm btn-danger" onclick="removeManualData('${d.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('');
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>日付</th><th>部屋タイプ</th><th>稼働率</th><th>ADR</th><th>チャネル</th><th>削除</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function removeManualData(id) {
  AppState.manualData = AppState.manualData.filter(d => d.id !== id);
  saveManualData();
  renderManualDataTable();
}

// ===== トースト =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== CSV ドラッグ&ドロップ =====
function initDragDrop() {
  const zone = document.getElementById('csv-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = ev => parseCSV(ev.target.result);
      reader.readAsText(file, 'UTF-8');
    } else {
      showToast('CSVファイルをドロップしてください', 'error');
    }
  });
}

// ===== 競合調査・市場相場インサイト =====

function renderMarketResearch() {
  const datePicker = document.getElementById('mr-date-picker');
  if (!datePicker) return;

  // 初期日付の設定
  if (!datePicker.value) {
    datePicker.value = AppState.selectedMarketDate;
  } else {
    AppState.selectedMarketDate = datePicker.value;
  }

  // 日付選択変更イベント
  datePicker.onchange = (e) => {
    AppState.selectedMarketDate = e.target.value;
    updateMarketResearchView();
  };

  // 指標ボタンのレンダリング
  renderMarketMetricButtons();

  // ビューの更新
  updateMarketResearchView();
}

function renderMarketMetricButtons() {
  const container = document.getElementById('mr-metric-buttons');
  if (!container) return;

  const METRICS = [
    { id: 'prices', label: '施設ごとの価格', icon: '🏢' },
    { id: 'direct_avg', label: '直接比較の平均価格', icon: '📊' },
    { id: 'direct_median', label: '直接比較の中央値', icon: '⚖️' },
    { id: 'direct_min', label: '直接比較の最安値', icon: '📉' },
    { id: 'direct_max', label: '直接比較の最高値', icon: '📈' },
    { id: 'all_range', label: '市場全体の価格帯', icon: '🌐' },
    { id: 'full_count', label: '満室施設数', icon: '🈵' },
    { id: 'coupon_count', label: 'クーポン実施数', icon: '🎫' },
    { id: 'stats', label: '分析サマリー', icon: '📋' }
  ];

  container.innerHTML = METRICS.map(m => {
    const activeClass = AppState.selectedMarketMetric === m.id ? 'active' : '';
    return `<button class="mr-metric-btn ${activeClass}" onclick="changeMarketMetric('${m.id}')">
      <span>${m.icon}</span> ${m.label}
    </button>`;
  }).join('');
}

function changeMarketMetric(metricId) {
  AppState.selectedMarketMetric = metricId;
  renderMarketMetricButtons();
  updateMarketResearchView();
}

// 楽天トラベルから那須塩原エリア全体の宿泊率をフェッチする
let isFetchingMarketOcc = false;
async function fetchMarketOccupancyRate(dateStr) {
  if (isFetchingMarketOcc) return;
  isFetchingMarketOcc = true;

  const statusEl = document.getElementById('mr-scraping-status');
  const occValEl = document.getElementById('mr-area-occ-val');
  const occLabelEl = document.getElementById('mr-area-occ-label');

  if (statusEl) {
    statusEl.className = 'mr-status-badge';
    statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> 楽天トラベル同期中...';
  }

  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  // 栃木・那須エリア・大人1名1室
  const targetUrl = `https://search.travel.rakuten.co.jp/ds/vacant/searchVacant?f_dai=japan&f_chu=tochigi&f_sho=nasu&f_otona_su=1&f_heya_su=1&f_nen1=${year}&f_tuki1=${month}&f_hi1=${day}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒タイムアウト
    const response = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Proxy error');
    const json = await response.json();
    const html = json.contents;
    const match = html.match(/"totalResults":\[(\d+)\]/);

    if (match && match[1]) {
      const vacantCount = parseInt(match[1], 10);
      const TOTAL_HOTELS = 100; // 那須塩原エリアの想定ホテル数
      let occ = Math.round(((TOTAL_HOTELS - vacantCount) / TOTAL_HOTELS) * 100);
      occ = Math.max(0, Math.min(100, occ));

      if (occValEl) occValEl.textContent = `${occ}%`;
      if (occLabelEl) {
        occLabelEl.textContent = occ >= 85 ? '満室直前' : occ >= 60 ? '高需要' : '通常';
        occValEl.style.color = occ >= 85 ? '#ef4444' : occ >= 60 ? '#f59e0b' : '#3b82f6';
      }
      if (statusEl) {
        statusEl.className = 'mr-status-badge green';
        statusEl.innerHTML = '🟢 楽天トラベルと同期済';
      }
      isFetchingMarketOcc = false;
      return;
    }
    throw new Error('Parse error');
  } catch (error) {
    console.warn('Scraping failed, using fallback calculation:', error);
    // フォールバック計算
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const isHolidaySeason = d.getMonth() === 7 || d.getMonth() === 4 || d.getMonth() === 3;
    const hasEv = AppState.settings.events.some(e => e.date === dateStr);

    let occ = isWeekend ? 78 : 42;
    if (isHolidaySeason) occ += 15;
    if (hasEv) occ += 12;
    occ = Math.min(98, occ + (d.getDate() % 10));

    if (occValEl) occValEl.textContent = `${occ}%`;
    if (occLabelEl) {
      occLabelEl.textContent = occ >= 85 ? '満室直前' : occ >= 60 ? '高需要' : '通常';
      occValEl.style.color = occ >= 85 ? '#ef4444' : occ >= 60 ? '#f59e0b' : '#3b82f6';
    }
    if (statusEl) {
      statusEl.className = 'mr-status-badge orange';
      statusEl.innerHTML = '🟡 推定値（通信制限回避）';
    }
  } finally {
    isFetchingMarketOcc = false;
  }
}

// 指定日の競合価格データを取得（無ければシミュレーション生成）
function getMarketResearchData(dateStr) {
  // すでに保存されているデータを検索
  let dateData = AppState.marketResearchData.filter(d => d.dateKey === dateStr);
  if (dateData.length > 0) return dateData;

  // 無い場合は生成する
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  const isHolidaySeason = d.getMonth() === 7 || d.getMonth() === 4 || d.getMonth() === 3;
  const ev = AppState.settings.events.find(e => e.date === dateStr);

  const seed = (d.getDate() * 17 + d.getMonth() * 9) % 100;
  const baseMarkup = (isWeekend ? 2000 : 0) + (isHolidaySeason ? 3500 : 0) + (ev ? ev.coeff * 3000 - 3000 : 0) + (seed * 10);

  // 6つの競合ホテルを生成
  const basePrices = {
    toyoko_nasushiobara: 6500,
    routein_nishinasuno: 7200,
    routein_2nd_nishinasuno: 7000,
    north_in: 5800,
    nasu_marronnier: 8500,
    nogi_onsen: 9500
  };

  const planNames = {
    toyoko_nasushiobara: '【公式HP限定】ビジネス出張・観光シングル無料朝食付',
    routein_nishinasuno: 'ビジネスシングル【大浴場完備・和洋バイキング朝食付】',
    routein_2nd_nishinasuno: 'スタンダードシングル【バイキング朝食＆大浴場利用可】',
    north_in: '素泊まりシンプルプラン（駅徒歩圏）',
    nasu_marronnier: '那須観光＆ビジネスステイ【源泉大浴場完備・朝食付】',
    nogi_onsen: '乃木温泉美肌の湯堪能プラン【朝食バイキング付】'
  };

  const roomTypes = {
    toyoko_nasushiobara: '禁煙シングルルーム(12㎡)',
    routein_nishinasuno: 'コンフォートシングル(13㎡)',
    routein_2nd_nishinasuno: 'スタンダードシングル(13㎡)',
    north_in: '洋室シングル',
    nasu_marronnier: 'モデレートシングル(15㎡)',
    nogi_onsen: '和洋室またはシングル'
  };

  const generated = COMPETITOR_HOTELS.map((hotel, idx) => {
    let base = basePrices[hotel.id] || 6000;
    // 週末・イベント・繁忙期での倍率調整
    let markup = baseMarkup;
    if (hotel.type === 'market') {
      markup = baseMarkup * 1.3; // 付加価値ホテルは値上がり幅も大きめ
    }
    
    // 満室の確率計算
    const fullChance = (isWeekend ? 0.35 : 0.08) + (isHolidaySeason ? 0.4 : 0) + (ev ? 0.3 : 0);
    const isFull = ((seed + idx * 13) % 100) < (fullChance * 100);
    
    // クーポン有無の計算
    const hasCoupon = ((seed + idx * 19) % 100) < 30; // 30%の確率でクーポン

    return {
      id: `${dateStr}-${hotel.id}`,
      dateKey: dateStr,
      hotelId: hotel.id,
      hotelName: hotel.name,
      type: hotel.type,
      status: isFull ? 'full' : 'available',
      price: Math.floor((base + markup) / 100) * 100, // 100円丸め
      planName: planNames[hotel.id],
      roomType: roomTypes[hotel.id],
      meals: '朝食付',
      hasCoupon: hasCoupon,
      updatedAt: new Date().toISOString()
    };
  });

  // 保存してメモリにもマージ
  const currentAll = [...AppState.marketResearchData];
  generated.forEach(item => currentAll.push(item));
  saveMarketResearchData(currentAll);

  return generated;
}

// 画面の再描画
function updateMarketResearchView() {
  const dateStr = AppState.selectedMarketDate;
  const metricId = AppState.selectedMarketMetric;

  // 日付ラベルの更新
  const dateLabel = document.getElementById('mr-result-date');
  if (dateLabel) {
    const d = new Date(dateStr + 'T00:00:00');
    const wdays = ['日','月','火','水','木','金','土'];
    dateLabel.textContent = `対象日: ${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}（${wdays[d.getDay()]}）`;
  }

  // リアルタイム宿泊率の非同期フェッチ実行
  fetchMarketOccupancyRate(dateStr);

  // 個別ホテルデータのロード
  const data = getMarketResearchData(dateStr);

  // 指標別結果のレンダリング
  renderMarketMetricContent(dateStr, metricId, data);
}

function renderMarketMetricContent(dateStr, metricId, data) {
  const container = document.getElementById('mr-result-content');
  if (!container) return;

  const headerTitle = document.getElementById('mr-result-title');
  const metricLabels = {
    prices: '🏢 施設ごとの価格',
    direct_avg: '📊 直接比較の平均価格',
    direct_median: '⚖️ 直接比較の中央値',
    direct_min: '📉 直接比較の最安値',
    direct_max: '📈 直接比較の最高値',
    all_range: '🌐 市場全体の価格帯',
    full_count: '🈵 満室施設数',
    coupon_count: '🎫 クーポン実施数',
    stats: '📋 分析サマリー'
  };
  if (headerTitle) {
    headerTitle.textContent = metricLabels[metricId] || '価格指標';
  }

  // 直接比較（direct）の有効な価格リスト（満室・売り切れ以外）
  const directPrices = data
    .filter(d => d.type === 'direct' && d.status !== 'full')
    .map(d => d.price)
    .sort((a, b) => a - b);

  // 全ホテルの有効な価格リスト
  const allPrices = data
    .filter(d => d.status !== 'full')
    .map(d => d.price)
    .sort((a, b) => a - b);

  const directAvg = directPrices.length > 0 ? Math.round(directPrices.reduce((a, b) => a + b, 0) / directPrices.length) : null;
  const directMin = directPrices.length > 0 ? directPrices[0] : null;
  const directMax = directPrices.length > 0 ? directPrices[directPrices.length - 1] : null;
  
  // 中央値の計算
  let directMedian = null;
  if (directPrices.length > 0) {
    const mid = Math.floor(directPrices.length / 2);
    directMedian = directPrices.length % 2 !== 0 ? directPrices[mid] : Math.round((directPrices[mid - 1] + directPrices[mid]) / 2);
  }

  const fullHotels = data.filter(d => d.status === 'full');
  const couponHotels = data.filter(d => d.hasCoupon);

  // 各自ホテルの稼働率の平均値を計算 (カード表示用)
  const targetOccRates = data.map(hotel => {
    if (hotel.status === 'full') return 100;
    const dObj = new Date(dateStr + 'T00:00:00');
    // 固定計算でシミュレート
    return Math.min(95, 45 + ((dObj.getDate() * 7 + hotel.hotelId.charCodeAt(0)) % 45));
  });
  const competitorAvgOcc = Math.round(targetOccRates.reduce((a, b) => a + b, 0) / data.length);
  
  const compOccVal = document.getElementById('mr-competitor-occ-val');
  const compOccLabel = document.getElementById('mr-competitor-occ-label');
  if (compOccVal) compOccVal.textContent = `${competitorAvgOcc}%`;
  if (compOccLabel) compOccLabel.textContent = `6軒中 ${fullHotels.length} 軒が満室`;

  switch (metricId) {
    case 'prices':
      container.innerHTML = `<div class="mr-grid">
        ${data.map(h => {
          const typeBadge = h.type === 'direct' ? '<span class="mr-hotel-type-badge blue">🔵 直接比較</span>' : '<span class="mr-hotel-type-badge orange">🔘 相場参考</span>';
          const priceStr = h.status === 'full' 
            ? '<span class="price-full">満室御礼</span>' 
            : `<span class="price-num">¥${h.price.toLocaleString()}</span>`;
          const couponBadge = h.hasCoupon ? '<span class="mr-badge coupon">🎫 クーポン</span>' : '';
          
          return `<div class="mr-hotel-card ${h.status === 'full' ? 'full' : ''}">
            <div class="mr-hotel-card-header">
              ${typeBadge}
              <h4 class="mr-hotel-name">${h.hotelName}</h4>
            </div>
            <div class="mr-hotel-card-body">
              <div class="mr-hotel-price-row">
                ${priceStr}
              </div>
              <div class="mr-hotel-details">
                <p><strong>プラン:</strong> ${h.planName || '素泊まりシンプル'}</p>
                <p><strong>部屋:</strong> ${h.roomType || 'シングルルーム'}</p>
                <div class="mr-hotel-badges">
                  ${couponBadge}
                  <span class="mr-badge">🛌 朝食込</span>
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
      break;

    case 'direct_avg':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">直接比較 4施設の平均価格</span>
        <div class="mr-kpi-value gradient">
          ${directAvg ? `¥${directAvg.toLocaleString()}` : '満室・データなし'}
        </div>
        <p class="mr-kpi-desc">
          競合ビジネスホテルの平均値です。当ホテルの販売価格がこの平均価格と大きく乖離していないかを確認し、基準単価の調整にご活用ください。
        </p>
      </div>`;
      break;

    case 'direct_median':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">直接比較の中央値</span>
        <div class="mr-kpi-value">
          ${directMedian ? `¥${directMedian.toLocaleString()}` : '満室・データなし'}
        </div>
        <p class="mr-kpi-desc">
          極端な安値や高値（アウトライヤー）を除外した実質的な市場中心価格です。安定した価格戦略の目安となります。
        </p>
      </div>`;
      break;

    case 'direct_min':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">直接比較の最安値（競合下限値）</span>
        <div class="mr-kpi-value text-danger">
          ${directMin ? `¥${directMin.toLocaleString()}` : '満室・データなし'}
        </div>
        <p class="mr-kpi-desc">
          競合が設定している一番安いシングル料金です。当ホテルがこれより下回る必要はほぼなく、安売り防止のデッドラインとなります。
        </p>
      </div>`;
      break;

    case 'direct_max':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">直接比較の最高値（競合上限値）</span>
        <div class="mr-kpi-value text-success">
          ${directMax ? `¥${directMax.toLocaleString()}` : '満室・データなし'}
        </div>
        <p class="mr-kpi-desc">
          競合が強気で設定している最も高いシングル料金です。この価格でも売れている場合、エリア全体の宿泊需要が非常に強いことを示します。
        </p>
      </div>`;
      break;

    case 'all_range':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">エリア全体の販売価格帯（最安値 〜 最高値）</span>
        <div class="mr-kpi-value text-dark" style="font-size: 3rem;">
          ${allPrices.length > 0 ? `¥${allPrices[0].toLocaleString()} 〜 ¥${allPrices[allPrices.length - 1].toLocaleString()}` : '全施設満室'}
        </div>
        <p class="mr-kpi-desc">
          相場参考（那須マロニエホテルや乃木温泉ホテル等）を含めた全体の価格差です。高価格帯ホテルが値を上げている日は、観光目的などの付加価値需要が強いと判断できます。
        </p>
      </div>`;
      break;

    case 'full_count':
      const fullListHtml = fullHotels.length > 0 
        ? fullHotels.map(h => `<div class="mr-list-item danger"><i class="fas fa-hotel"></i> <strong>${h.hotelName}</strong> (満室)</div>`).join('')
        : '<p class="text-muted">現在、満室になっている競合はありません。</p>';

      container.innerHTML = `<div class="mr-analysis-view">
        <div class="mr-summary-card danger">
          <div class="card-icon">🈵</div>
          <div class="card-text">
            <h3>満室施設数</h3>
            <div class="card-value">${fullHotels.length} / 6 施設</div>
          </div>
        </div>
        <div class="mr-analysis-details" style="margin-top:20px;">
          <h4>満室宿リスト</h4>
          <div class="mr-list-container">${fullListHtml}</div>
          <p class="mr-analysis-tip" style="margin-top: 16px;">
            💡 <strong>価格調整のアドバイス:</strong><br/>
            競合ビジネスホテルが売り切れている場合、行き場を失った予約客が流れてきます。当ホテルの強気の値上げ（上限価格付近への変更）が成功しやすい好機です。
          </p>
        </div>
      </div>`;
      break;

    case 'coupon_count':
      const couponListHtml = couponHotels.length > 0 
        ? couponHotels.map(h => `<div class="mr-list-item warning"><i class="fas fa-tag"></i> <strong>${h.hotelName}</strong> (割引実施中)</div>`).join('')
        : '<p class="text-muted">現在、クーポンや割引を実施している競合はありません。</p>';

      container.innerHTML = `<div class="mr-analysis-view">
        <div class="mr-summary-card warning">
          <div class="card-icon">🎫</div>
          <div class="card-text">
            <h3>クーポン実施状況</h3>
            <div class="card-value">${couponHotels.length} / 6 施設</div>
          </div>
        </div>
        <div class="mr-analysis-details" style="margin-top:20px;">
          <h4>クーポン・割引実施宿リスト</h4>
          <div class="mr-list-container">${couponListHtml}</div>
          <p class="mr-analysis-tip" style="margin-top: 16px;">
            💡 <strong>価格調整のアドバイス:</strong><br/>
            クーポンを配布しているホテルは、表示価格より実質支払額が安くなっています。当ホテルの価格がそれより高すぎないか、または実質価格で対抗すべきかの指標になります。
          </p>
        </div>
      </div>`;
      break;

    case 'stats':
      const tips = [];
      if (fullHotels.length >= 2) {
        tips.push(`<li class="mr-tip-item danger">
          <i class="fas fa-exclamation-triangle"></i>
          <div>
            <strong>競合ホテルの売り切れが始まっています（${fullHotels.length}施設が満室）。</strong><br/>
            需要が急増している証拠です。当ホテルもすぐに空室価格の上昇（1,000円〜2,000円値上げ）を検討してください。
          </div>
        </li>`);
      }
      if (couponHotels.length >= 3) {
        tips.push(`<li class="mr-tip-item warning">
          <i class="fas fa-percent"></i>
          <div>
            <strong>多くの競合（${couponHotels.length}施設）がクーポンによる割引を実施しています。</strong><br/>
            エリア全体の平日の集客が鈍い可能性があります。当ホテルも素泊まり基準価格を下限値付近まで下げるか、直前割キャンペーンの実施を推奨します。
          </div>
        </li>`);
      }
      if (directAvg && directAvg > 7500) {
        tips.push(`<li class="mr-tip-item success">
          <i class="fas fa-chart-line"></i>
          <div>
            <strong>競合の平均価格が強気の推移（¥${directAvg.toLocaleString()}）を見せています。</strong><br/>
            週末または周辺イベントによる需要高騰です。当ホテルの推奨価格も引き上げ方向での調整が効果的です。
          </div>
        </li>`);
      }
      if (tips.length === 0) {
        tips.push(`<li class="mr-tip-item info">
          <i class="fas fa-info-circle"></i>
          <div>
            <strong>市況は極めて安定しています。</strong><br/>
            競合の価格帯は平均 ¥${(directAvg || 7000).toLocaleString()} 前後で推移しています。基本価格通りの設定、または標準的なダイナミックプライシング推奨値での運用が適切です。
          </div>
        </li>`);
      }

      container.innerHTML = `<div class="mr-stats-view">
        <h3 style="font-size: 1.1rem; margin-bottom: 16px; font-weight: 700;">📊 那須エリア市場サマリー</h3>
        <div class="mr-stats-summary-grid">
          <div class="mr-summary-item-box">
            <span class="label">直接比較 平均価格</span>
            <span class="value">${directAvg ? `¥${directAvg.toLocaleString()}` : '満室・データなし'}</span>
          </div>
          <div class="mr-summary-item-box">
            <span class="label">直接比較 最安値</span>
            <span class="value" style="color:#ef4444;">${directMin ? `¥${directMin.toLocaleString()}` : '満室・データなし'}</span>
          </div>
          <div class="mr-summary-item-box">
            <span class="label">直接比較 最高値</span>
            <span class="value" style="color:#10b981;">${directMax ? `¥${directMax.toLocaleString()}` : '満室・データなし'}</span>
          </div>
        </div>

        <div style="margin-top: 24px;">
          <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 12px; color: var(--primary);">💡 AIによる意思決定サポートインサイト</h4>
          <ul class="mr-tips-list" style="list-style: none; padding: 0; display:flex; flex-direction:column; gap:12px;">
            ${tips.join('')}
          </ul>
        </div>
      </div>`;
      break;

    default:
      container.innerHTML = '<p class="text-muted">指標を選択してください。</p>';
  }
}