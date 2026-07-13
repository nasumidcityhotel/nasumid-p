/**
 * engine.js
 * 価格提案エンジン
 * 需要係数・曜日・イベント・稼働率などを考慮した半自動価格計算
 */

// ===== 需要シミュレーション（デモ用仮想稼働率） =====
function simulateOccupancy(dateStr, roomId) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun, 6=Sat
  let base = 0.82 + Math.random() * 0.12;

  // 曜日ベース調整
  if (dow === 0 || dow === 6) base += 0.12; // 土日
  if (dow === 5) base += 0.08;              // 金曜

  // 祝日
  if (isHoliday(dateStr)) base += 0.15;

  // イベント
  const ev = AppState.settings.events.find(e => e.date === dateStr);
  if (ev) base += (ev.coeff - 1) * 0.5;

  // 季節性（夏・紅葉）
  const month = d.getMonth();
  if (month === 7 || month === 8) base += 0.1;   // 8-9月
  if (month === 9 || month === 10) base += 0.08;  // 10-11月
  if (month === 0 || month === 1) base -= 0.08;   // 冬オフ

  // 部屋タイプ別（微調整のみ、80%は下回らない）
  if (roomId === 'suite') base -= 0.02;
  if (roomId === 'deluxe') base -= 0.01;

  return Math.max(0.80, Math.min(0.99, base));
}

// ===== 需要シグナル生成 =====
function getDemandSignals(dateStr) {
  const signals = [];
  const dow = getDayOfWeek(dateStr);
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth();

  if (dow === '土' || dow === '日') signals.push({ type: 'weekend', label: '週末需要', icon: 'fa-calendar-week', coeff: AppState.settings.weekdayCoeff[dow] });
  if (dow === '金') signals.push({ type: 'weekend', label: '金曜需要増', icon: 'fa-calendar-week', coeff: AppState.settings.weekdayCoeff[dow] });
  if (isHoliday(dateStr)) signals.push({ type: 'holiday', label: '祝日', icon: 'fa-star', coeff: 1.20 });

  const ev = AppState.settings.events.find(e => e.date === dateStr);
  if (ev) signals.push({ type: 'event', label: ev.name, icon: 'fa-flag', coeff: ev.coeff });

  if (month === 7 || month === 8) signals.push({ type: 'season', label: '夏季ハイシーズン', icon: 'fa-sun', coeff: 1.15 });
  if (month === 9 || month === 10) signals.push({ type: 'season', label: '紅葉シーズン', icon: 'fa-leaf', coeff: 1.12 });
  if (month === 4) signals.push({ type: 'season', label: '春の行楽シーズン', icon: 'fa-tree', coeff: 1.08 });
  if (month === 0 || month === 1) signals.push({ type: 'season', label: '閑散期', icon: 'fa-snowflake', coeff: 0.92 });

  return signals;
}

// ===== 稼働率係数 =====
function getOccupancyCoeff(occ) {
  const rules = AppState.settings.occupancyRules;
  if (occ >= 0.90) return 1 + rules.occ90 / 100;
  if (occ >= 0.70) return 1 + rules.occ70 / 100;
  if (occ >= 0.50) return 1 + rules.occ50 / 100;
  return 1 + rules.occLow / 100;
}

// ===== 信頼度計算 =====
function calcConfidence(signals, occ) {
  let score = 0.6;
  if (signals.length > 0) score += 0.08 * Math.min(signals.length, 3);
  if (occ > 0.8) score += 0.1;
  if (occ < 0.4) score -= 0.1;
  // ランダムノイズ（リアル感）
  score += (Math.random() - 0.5) * 0.1;
  return Math.max(0.45, Math.min(0.97, score));
}

// ===== 価格計算コア =====
function calcProposedPrice(room, dateStr, occ, guestCount = 2) {
  const s = AppState.settings;
  const basePrice = room.base;
  const dow = getDayOfWeek(dateStr);

  let price = basePrice;

  // 曜日係数
  const weekCoeff = s.weekdayCoeff[dow] || 1.0;
  price *= weekCoeff;

  // 稼働率係数
  const occCoeff = getOccupancyCoeff(occ);
  price *= occCoeff;

  // イベント係数
  const ev = s.events.find(e => e.date === dateStr);
  if (ev) price *= ev.coeff;

  // 祝日係数
  if (isHoliday(dateStr)) price *= 1.18;

  // 季節性
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth();
  if (month === 7 || month === 8) price *= 1.12;
  if (month === 9 || month === 10) price *= 1.10;
  if (month === 0 || month === 1) price *= 0.92;

  // 小数を1,000円単位に丸める
  price = Math.round(price / 1000) * 1000;

  // 変更幅制限（宿泊人数を考慮）
  let maxUp, maxDown;
  if (guestCount === 1) {
    maxUp = room.maxChangeUp1 !== undefined ? room.maxChangeUp1 : (room.maxChangeUp || s.maxChangeUp);
    maxDown = room.maxChangeDown1 !== undefined ? room.maxChangeDown1 : (room.maxChangeDown || s.maxChangeDown);
  } else {
    maxUp = room.maxChangeUp2 !== undefined ? room.maxChangeUp2 : (room.maxChangeUp || s.maxChangeUp);
    maxDown = room.maxChangeDown2 !== undefined ? room.maxChangeDown2 : (room.maxChangeDown || s.maxChangeDown);
  }
  
  const diff = price - basePrice;
  if (diff > maxUp) price = basePrice + maxUp;
  if (diff < -maxDown) price = basePrice - maxDown;

  // 上下限クランプ
  price = Math.max(room.min, Math.min(room.max, price));

  return price;
}

// ===== メイン価格計算実行 =====
function runPricingEngine() {
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  overlay.style.display = 'flex';
  loadingText.textContent = '価格エンジン計算中...';

  // 非同期的に実行（UIブロック回避）
  setTimeout(() => {
    loadingText.textContent = 'データ分析中...';
  }, 300);

  setTimeout(() => {
    loadingText.textContent = '価格最適化中...';
  }, 700);

  setTimeout(() => {
    try {
      _executePricingEngine();
      overlay.style.display = 'none';
      showToast('価格計算が完了しました。承認待ちの提案を確認してください。', 'success');
      // 最終計算時刻を更新
      const now = new Date();
      document.getElementById('last-calc-time').textContent =
        `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      updateBadges();
      renderDashboard();
    } catch(e) {
      console.error(e);
      overlay.style.display = 'none';
      showToast('計算中にエラーが発生しました', 'error');
    }
  }, 1200);
}

function _executePricingEngine() {
  const today = getTodayString();
  const rooms = AppState.settings.rooms;
  const newProposals = [];

  // 今日から30日分を計算
  for (let i = 0; i < 30; i++) {
    const dateStr = addDays(today, i);

    for (const room of rooms) {
      // 人数パターンを定義（モデレート以外は1名・2名両方）
      const guestPatterns = (room.id === 'moderate') ? [1] : [1, 2];

      for (const guestCount of guestPatterns) {
        // 既存の承認済み/却下済みをスキップ
        const existing = AppState.proposals.find(
          p => p.date === dateStr && p.roomId === room.id && p.guestCount === guestCount && (p.status === 'approved' || p.status === 'rejected')
        );
        if (existing) continue;

        const occ = simulateOccupancy(dateStr, room.id);
        const proposedPrice = calcProposedPrice(room, dateStr, occ, guestCount);
        const currentPrice = getCurrentPrice(dateStr, room.id, guestCount) || room.base;
        const diff = proposedPrice - currentPrice;

        // 差が小さい場合はスキップ（±500円未満）
        if (Math.abs(diff) < 500) continue;

        const signals = getDemandSignals(dateStr);
        const confidence = calcConfidence(signals, occ);

        // --- 理由を「考えさせない」短い一言に凝縮 ---
        let mainReason = '';
        let secondaryReason = '';
        
        const ev = AppState.settings.events.find(e => e.date === dateStr);
        if (ev) mainReason = 'イベント';
        else if (occ >= 0.90) mainReason = '高需要予測';
        else if (occ <= 0.50) mainReason = '需要低下';
        else mainReason = '通常需要';

        if (occ >= 0.85) secondaryReason = '＋高稼働';
        else if (occ <= 0.60) secondaryReason = '＋低稼働';
        
        const impactLabel = mainReason + secondaryReason;
        const reasons = [
          { type: ev ? 'event' : 'occ', label: impactLabel, icon: ev ? 'fa-flag' : 'fa-chart-line' }
        ];

        const proposal = {
          id: generateId(),
          date: dateStr,
          roomId: room.id,
          roomName: `${room.name} (${guestCount}名利用)`,
          guestCount: guestCount,
          currentPrice: currentPrice,
          proposedPrice: proposedPrice,
          minPrice: room.min,
          maxPrice: room.max,
          diff: diff,
          occupancy: occ,
          reasons: reasons,
          confidence: confidence,
          status: 'pending',
          createdAt: new Date().toISOString(),
          approvedAt: null,
          approvedBy: null,
          finalPrice: null
        };

        // 自動承認設定
        if (room.autoApprove) {
          proposal.status = 'approved';
          proposal.approvedAt = new Date().toISOString();
          proposal.approvedBy = '自動承認';
          proposal.finalPrice = proposedPrice;
          addToHistory(proposal, true);
        }

        newProposals.push(proposal);
      }
    }
  }

  // 既存提案を更新（pending のみ置き換え）
  AppState.proposals = AppState.proposals.filter(
    p => p.status === 'approved' || p.status === 'rejected'
  );
  AppState.proposals = [...AppState.proposals, ...newProposals];
  AppState.proposals.sort((a, b) => a.date.localeCompare(b.date));
  saveProposals();
}

// ===== 現在の承認済み価格を取得 =====
function getCurrentPrice(dateStr, roomId, guestCount = 2) {
  const approved = AppState.proposals.find(
    p => p.date === dateStr && p.roomId === roomId && p.guestCount === guestCount && p.status === 'approved'
  );
  if (approved) return approved.finalPrice || approved.proposedPrice;

  const room = AppState.settings.rooms.find(r => r.id === roomId);
  return room ? room.base : null;
}

// ===== 承認処理 =====
function approveProposalById(proposalId, finalPrice, approvedBy) {
  const proposal = AppState.proposals.find(p => p.id === proposalId);
  if (!proposal) return false;

  proposal.status = 'approved';
  proposal.approvedAt = new Date().toISOString();
  proposal.approvedBy = approvedBy || '担当者A';
  proposal.finalPrice = finalPrice || proposal.proposedPrice;

  saveProposals();
  addToHistory(proposal, false);
  return true;
}

// ===== 却下処理 =====
function rejectProposalById(proposalId, reason, rejectedBy) {
  const proposal = AppState.proposals.find(p => p.id === proposalId);
  if (!proposal) return false;

  proposal.status = 'rejected';
  proposal.approvedAt = new Date().toISOString();
  proposal.approvedBy = rejectedBy || '担当者A';
  proposal.rejectReason = reason;

  saveProposals();
  addToHistory(proposal, false);
  return true;
}

// ===== 履歴追加 =====
function addToHistory(proposal, isAuto) {
  const entry = {
    id: generateId(),
    actionAt: new Date().toISOString(),
    date: proposal.date,
    roomName: proposal.roomName,
    oldPrice: proposal.currentPrice,
    newPrice: proposal.finalPrice || proposal.proposedPrice,
    diff: (proposal.finalPrice || proposal.proposedPrice) - proposal.currentPrice,
    reasons: proposal.reasons,
    status: proposal.status,
    operator: isAuto ? '自動承認' : (proposal.approvedBy || '担当者A'),
    proposalId: proposal.id
  };
  AppState.history.unshift(entry);
  saveHistory();
}

// ===== 全承認 =====
function approveAll() {
  const pending = AppState.proposals.filter(p => p.status === 'pending');
  if (pending.length === 0) {
    showToast('承認待ちの提案はありません', 'info');
    return;
  }

  if (!confirm(`${pending.length}件の提案を全て承認します。よろしいですか？`)) return;

  pending.forEach(p => {
    approveProposalById(p.id, p.proposedPrice, '担当者A（一括承認）');
  });

  showToast(`${pending.length}件の価格提案を承認しました`, 'success');
  updateBadges();
  renderProposals();
  renderDashboard();
}

// ===== 30日間の需要予測データ（グラフ用） =====
function get30DayForecast() {
  const today = getTodayString();
  const dates = [], occs = [], prices = [];

  for (let i = 0; i < 30; i++) {
    const dateStr = addDays(today, i);
    const occ = simulateOccupancy(dateStr, 'standard');
    const room = AppState.settings.rooms[0];
    const price = calcProposedPrice(room, dateStr, occ);
    dates.push(formatDateShort(dateStr));
    occs.push(Math.round(occ * 100));
    prices.push(price);
  }
  return { dates, occs, prices };
}