// ==========================================
// 那須ミッドシティホテル 競合調査・市場相場アプリ
// ==========================================

const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横イン那須塩原駅西口', category: 'direct', rakutenId: '186255' },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', category: 'direct', rakutenId: '27988' },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', category: 'direct', rakutenId: '143534' },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', category: 'direct', rakutenId: '181673' },
  { id: 'station_hotel', name: '那須塩原ステーションホテル', category: 'direct', rakutenId: '28612' },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', category: 'reference', rakutenId: '163533' },
  { id: 'nogi_onsen', name: '乃木温泉ホテル', category: 'reference', rakutenId: '14580' }
];

const METRICS = [
  { id: 'prices', label: '施設ごとの状況・価格', icon: '🏢' },
  { id: 'direct_avg', label: '直接比較の平均価格', icon: '📊' },
  { id: 'all_range', label: '市場全体の価格帯', icon: '🌐' },
  { id: 'stats', label: '分析サマリー', icon: '📋' }
];

const AppState = {
  selectedMarketDate: '2026-07-22',
  selectedMarketMetric: 'prices',
  marketResearchHistory: [], // v6のデータ構造（推移を保存）
  settings: {
    events: [
      { id: 1, date: '2026-04-25', name: '那須フラワーワールド開幕', coeff: 1.35 },
      { id: 2, date: '2026-05-03', name: 'GW前半',                   coeff: 1.45 },
      { id: 3, date: '2026-05-04', name: 'GW前半',                   coeff: 1.45 },
      { id: 4, date: '2026-05-05', name: 'こどもの日',               coeff: 1.40 },
      { id: 5, date: '2026-07-26', name: '那須夏祭り',               coeff: 1.25 },
      { id: 6, date: '2026-08-10', name: 'お盆前夜',                 coeff: 1.50 },
      { id: 7, date: '2026-08-11', name: 'お盆ピーク',               coeff: 1.55 },
      { id: 8, date: '2026-08-12', name: 'お盆ピーク',               coeff: 1.55 },
      { id: 9, date: '2026-08-13', name: 'お盆ピーク',               coeff: 1.50 },
      { id: 10, date: '2026-10-11', name: '那須紅葉シーズン開始',    coeff: 1.30 },
      { id: 11, date: '2026-11-01', name: '那須紅葉ピーク',          coeff: 1.40 },
    ]
  },
  chartInstance: null
};

// ==========================================
// ユーティリティ
// ==========================================
function formatCurrency(val) { return '¥' + Math.round(val).toLocaleString('ja-JP'); }

// ==========================================
// アプリケーション初期化
// ==========================================
window.onload = function() {
  const mr = localStorage.getItem('dp_market_research_v6');
  if (mr) {
    try {
      AppState.marketResearchHistory = JSON.parse(mr);
    } catch(e) { console.error("Cache parsing error", e); }
  }
  initUI();
  updateView();
};

function initUI() {
  const datePicker = document.getElementById('mr-date-picker');
  if (datePicker) {
    datePicker.value = AppState.selectedMarketDate;
    datePicker.onchange = (e) => {
      AppState.selectedMarketDate = e.target.value;
      updateView();
    };
  }
  renderMetricButtons();
}

function renderMetricButtons() {
  const container = document.getElementById('mr-metric-buttons');
  if (!container) return;
  container.innerHTML = METRICS.map(m => {
    const activeClass = AppState.selectedMarketMetric === m.id ? 'active' : '';
    return `<button class="mr-metric-btn ${activeClass}" onclick="changeMetric('${m.id}')">
      <span>${m.icon}</span> ${m.label}
    </button>`;
  }).join('');
}

function changeMetric(metricId) {
  AppState.selectedMarketMetric = metricId;
  renderMetricButtons();
  renderMarketMetricContent();
}

// ==========================================
// 評価関数: 市場ひっ迫度からラベルと推奨アクションを取得
// ==========================================
function getMarketPressureLabel(score) {
  if (score >= 90) return { level: "very_high", label: "非常に高い", message: "競合ホテルの多くが予約不可となり、市場が非常にひっ迫しています。", priceAction: "10％以上の値上げや、安価なプランの販売停止を検討してください。" };
  if (score >= 75) return { level: "high", label: "高需要", message: "市場の空室が少なく、強い予約需要が発生しています。", priceAction: "5～10％程度の値上げを検討してください。" };
  if (score >= 60) return { level: "strong", label: "需要が強い", message: "競合ホテルの予約不可が増え、需要が強まっています。", priceAction: "3～5％程度の値上げを検討してください。" };
  if (score >= 40) return { level: "normal", label: "通常", message: "市場全体で一定の予約需要があります。", priceAction: "現在の料金を基本的に維持してください。" };
  if (score >= 20) return { level: "weak", label: "やや弱い", message: "一部で予約が入っていますが、空室にはまだ余裕があります。", priceAction: "基本料金を維持し、競合価格を確認してください。" };
  return { level: "very_weak", label: "空室が多い", message: "市場に空室が多く、需要は弱い状態です。", priceAction: "値下げ、特典追加、プラン改善を検討してください。" };
}

// ==========================================
// 楽天トラベルから特定ホテルの空室状況をフェッチする
// ==========================================
async function fetchIndividualHotelAvailability(rakutenId, year, month, day) {
  const checkinDate = new Date(year, month - 1, day);
  const checkoutDate = new Date(year, month - 1, day + 1);
  const y2 = checkoutDate.getFullYear();
  const m2 = checkoutDate.getMonth() + 1;
  const d2 = checkoutDate.getDate();
  
  const targetUrl = `https://search.travel.rakuten.co.jp/ds/vacant/searchVacant?f_hyoji=3&f_flg=vacant&f_otona_su=1&f_heya_su=1&f_nen1=${year}&f_tuki1=${month}&f_hi1=${day}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_no=${rakutenId}`;
  const proxyUrl = `https://nasumid-p.netlify.app/.netlify/functions/rakutenProxy`;
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl })
    });
    if (!response.ok) throw new Error('Proxy network error');
    const html = await response.text();
    
    let status = 'unknown';
    let vacantCount = 0;
    let actualLowestPrice = null;

    // 空室件数（totalResults）を取得
    const match = html.match(/"totalResults":\[(\d+)\]/);
    if (match && match[1]) {
      vacantCount = parseInt(match[1], 10);
      status = vacantCount === 0 ? 'unavailable' : 'available';
    } else if (html.includes('ご指定の条件に合うプランがありません') || html.includes('空室がありません')) {
      status = 'unavailable';
    } else {
      // 判定不能時はとりあえず available (フォールバック)
      status = 'available';
      vacantCount = 5;
    }

    if (status === 'available') {
      // 「料金」に関するクラス名（htlPrice, dp_price, price 等）を持つタグの中にある金額を狙って抽出
      const priceRegex = /class="[^"]*(?:price|charge)[^"]*"[^>]*>.*?([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{3,}).*?(?:円|<\/)/gi;
      // 予備として、JSONデータ内の価格を探す
      const jsonPriceRegex = /"(?:hotelMinCharge|price|roomPrice)"\s*:\s*(\d{4,6})/g;
      
      const prices = [];
      let m;
      // 1. HTMLタグからの抽出
      while ((m = priceRegex.exec(html)) !== null) {
        const val = parseInt(m[1].replace(/,/g, ''), 10);
        if (val >= 3500 && val < 100000) prices.push(val);
      }
      // 2. JSONデータからの抽出
      while ((m = jsonPriceRegex.exec(html)) !== null) {
        const val = parseInt(m[1], 10);
        if (val >= 3500 && val < 100000) prices.push(val);
      }
      // 3. フォールバック: 汎用的な「◯,◯◯◯円」を探す（セレクトボックスやクーポン等のノイズを除外したHTML上で）
      if (prices.length === 0) {
        const cleanHtml = html
          .replace(/<select[\s\S]*?<\/select>/gi, '')
          .replace(/クーポン/g, '');
        const fallbackRegex = /([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{3,})\s*円/g;
        let fm;
        while ((fm = fallbackRegex.exec(cleanHtml)) !== null) {
          const val = parseInt(fm[1].replace(/,/g, ''), 10);
          if (val >= 3500 && val < 100000) prices.push(val);
        }
      }
      
      if (prices.length > 0) {
        actualLowestPrice = Math.min(...prices);
      }
    }

    return { status, vacantCount, actualLowestPrice };
  } catch (e) {
    console.warn(`Failed to fetch availability for hotel ${rakutenId}:`, e);
    return { status: 'unknown', vacantCount: 0, actualLowestPrice: null };
  }
}

// ==========================================
// 指定日の調査データを取得・計算し履歴に保存する
// ==========================================
async function getMarketResearchData(dateStr) {
  // --- 緊急リセット処理（データ崩壊を治すため、一度履歴をクリア） ---
  if (!window.hasClearedBadData) {
    localStorage.removeItem('marketResearchHistory');
    AppState.marketResearchHistory = [];
    window.hasClearedBadData = true;
  }
  // ------------------------------------------------------------------
  // 指定日の過去の調査履歴を取得（時系列順）
  const historyForDate = AppState.marketResearchHistory.filter(d => d.summary.stayDate === dateStr);
  
  // スロットリング：直近1時間以内に調査していれば再調査せずキャッシュを返す
  // ※今回はバグ解消のため一時的にキャッシュを無効化し、常に最新を取りに行くようにする
  if (historyForDate.length > 0) {
    const latest = historyForDate[historyForDate.length - 1];
    const checkedDate = new Date(latest.summary.checkedAt);
    const now = new Date();
    // if ((now - checkedDate) < 60 * 60 * 1000) { return latest; }
  }

  // 前回データの取得（差分比較用）
  const previousData = historyForDate.length > 0 ? historyForDate[historyForDate.length - 1] : null;

  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  const isHolidaySeason = d.getMonth() === 7 || d.getMonth() === 4 || d.getMonth() === 3;
  const ev = AppState.settings.events.find(e => e.date === dateStr);
  const seed = (d.getDate() * 17 + d.getMonth() * 9) % 100;

  // 価格推測用ベース
  const baseMarkup = (isWeekend ? 2000 : 0) + (isHolidaySeason ? 3500 : 0) + (ev ? ev.coeff * 3000 - 3000 : 0) + (seed * 10);
  const basePrices = { toyoko_nasushiobara: 6500, routein_nishinasuno: 7200, routein_2nd_nishinasuno: 7000, north_in: 5800, station_hotel: 6800, nasu_marronnier: 8500, nogi_onsen: 9500 };

  // 並列フェッチ
  let scrapingResults = {};
  try {
    const promises = COMPETITOR_HOTELS.map(async (hotel) => {
      const res = await fetchIndividualHotelAvailability(hotel.rakutenId, year, month, day);
      scrapingResults[hotel.id] = res;
    });
    // 10秒タイムアウトに変更（スクレイピングのため少し長め）
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 10000));
    await Promise.race([Promise.all(promises), timeout]);
  } catch (error) {
    console.warn('Real-time scraping warning:', error);
  }

  const nowIso = new Date().toISOString();
  
  // 各ホテルのデータ生成
  const hotels = COMPETITOR_HOTELS.map((hotel, idx) => {

    // 予約可否ステータス判定と実価格の取得
    let resStatus = 'unknown';
    let lowestPrice = null;

    if (scrapingResults[hotel.id] && scrapingResults[hotel.id].status !== 'unknown') {
      resStatus = scrapingResults[hotel.id].status;
      if (scrapingResults[hotel.id].actualLowestPrice !== undefined && scrapingResults[hotel.id].actualLowestPrice !== null) {
        lowestPrice = scrapingResults[hotel.id].actualLowestPrice;
      }
    }

    // 前回データとの比較計算
    let previousPrice = null;
    let previousStatus = null;
    if (previousData) {
      const prevHotel = previousData.hotels.find(h => h.hotelId === hotel.id);
      if (prevHotel) {
        previousPrice = prevHotel.lowestPrice;
        previousStatus = prevHotel.status;
      }
    }

    let priceDifference = null;
    let priceChangeRate = null;
    if (lowestPrice !== null && previousPrice !== null) {
      priceDifference = lowestPrice - previousPrice;
      priceChangeRate = previousPrice > 0 ? (priceDifference / previousPrice) * 100 : 0;
    }

    let statusChange = 'no_change';
    if (previousStatus === 'available' && resStatus === 'unavailable') statusChange = 'newly_unavailable';
    if (previousStatus === 'unavailable' && resStatus === 'available') statusChange = 'reopened';

    return {
      id: `${dateStr}-${hotel.id}-${nowIso}`,
      hotelId: hotel.id,
      hotelName: hotel.name,
      category: hotel.category,
      stayDate: dateStr,
      guests: 1,
      rooms: 1,
      status: resStatus,
      lowestPrice: lowestPrice,
      previousPrice: previousPrice,
      priceDifference: priceDifference,
      priceChangeRate: priceChangeRate,
      previousStatus: previousStatus,
      statusChange: statusChange,
      otaName: '楽天トラベル',
      checkedAt: nowIso
    };
  });

  // ==========================================
  // 集計処理（市場ひっ迫度などの算出）
  // ==========================================
  const confirmedHotels = hotels.filter(h => h.status !== 'unknown');
  const unavailableHotels = confirmedHotels.filter(h => h.status === 'unavailable');
  const competitorSoldOutRate = confirmedHotels.length > 0 ? (unavailableHotels.length / confirmedHotels.length) * 100 : 0;

  const confirmedDirect = confirmedHotels.filter(h => h.category === 'direct');
  const unavailableDirect = confirmedDirect.filter(h => h.status === 'unavailable');
  const directUnavailableRate = confirmedDirect.length > 0 ? (unavailableDirect.length / confirmedDirect.length) * 100 : 0;

  const confirmedRef = confirmedHotels.filter(h => h.category === 'reference');
  const unavailableRef = confirmedRef.filter(h => h.status === 'unavailable');
  const refUnavailableRate = confirmedRef.length > 0 ? (unavailableRef.length / confirmedRef.length) * 100 : 0;

  // 市場ひっ迫度の計算 (直接70%, 参考30%)
  let marketPressureScore = 0;
  if (confirmedDirect.length > 0 && confirmedRef.length > 0) {
    marketPressureScore = Math.round(directUnavailableRate * 0.7 + refUnavailableRate * 0.3);
  } else if (confirmedDirect.length > 0) {
    marketPressureScore = Math.round(directUnavailableRate);
  } else if (confirmedRef.length > 0) {
    marketPressureScore = Math.round(refUnavailableRate);
  } else {
    marketPressureScore = -1; // -1 denotes 'データ不足'
  }

  // 前回比の計算
  let previousMarketPressureScore = null;
  let marketPressureDifference = null;
  if (previousData && previousData.summary.marketPressureScore >= 0) {
    previousMarketPressureScore = previousData.summary.marketPressureScore;
    if (marketPressureScore >= 0) {
      marketPressureDifference = marketPressureScore - previousMarketPressureScore;
    }
  }

  // 価格情報
  const directPrices = confirmedDirect.filter(h => h.lowestPrice !== null).map(h => h.lowestPrice);
  const lowestCompetitorPrice = directPrices.length > 0 ? Math.min(...directPrices) : null;
  const averageCompetitorPrice = directPrices.length > 0 ? Math.round(directPrices.reduce((a,b)=>a+b,0)/directPrices.length) : null;

  const summary = {
    stayDate: dateStr,
    guests: 1,
    rooms: 1,
    totalHotels: hotels.length,
    availableHotels: confirmedHotels.filter(h=>h.status==='available').length,
    unavailableHotels: unavailableHotels.length,
    unknownHotels: hotels.filter(h=>h.status==='unknown').length,
    directCompetitorUnavailableRate: directUnavailableRate,
    referenceHotelUnavailableRate: refUnavailableRate,
    competitorSoldOutRate: competitorSoldOutRate,
    marketPressureScore: marketPressureScore,
    previousMarketPressureScore: previousMarketPressureScore,
    marketPressureDifference: marketPressureDifference,
    lowestCompetitorPrice: lowestCompetitorPrice,
    averageCompetitorPrice: averageCompetitorPrice,
    checkedAt: nowIso
  };

  const resultData = { summary, hotels };
  
  // 履歴に追加して保存
  AppState.marketResearchHistory.push(resultData);
  localStorage.setItem('dp_market_research_v6', JSON.stringify(AppState.marketResearchHistory));

  return resultData;
}

// ==========================================
// ビューの更新・描画
// ==========================================
async function updateView() {
  const dateStr = AppState.selectedMarketDate;
  
  // 日付ラベル更新
  const dateLabel = document.getElementById('mr-result-date');
  if (dateLabel) {
    const d = new Date(dateStr + 'T00:00:00');
    const wdays = ['日','月','火','水','木','金','土'];
    dateLabel.textContent = `対象日: ${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}（${wdays[d.getDay()]}）`;
  }

  // ローディング
  const container = document.getElementById('mr-result-content');
  if (container) {
    container.innerHTML = `<div class="mr-kpi-view" style="min-height: 250px;">
      <i class="fas fa-sync fa-spin" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 15px;"></i>
      <p class="mr-kpi-label">楽天トラベルから競合各ホテルの最新の予約状況を調査中...</p>
    </div>`;
  }

  // 調査実行（またはキャッシュ取得）
  const data = await getMarketResearchData(dateStr);
  AppState.currentViewData = data; 

  renderTopSummaryCards(data);
  renderChart(dateStr);
  renderMarketMetricContent();
}

function renderTopSummaryCards(data) {
  const container = document.getElementById('mr-summary-top-cards');
  if (!container) return;

  const summary = data.summary;
  
  // 市場ひっ迫度
  let scoreText = summary.marketPressureScore >= 0 ? summary.marketPressureScore.toString() : '不足';
  let scoreClass = 'primary';
  let labelObj = summary.marketPressureScore >= 0 ? getMarketPressureLabel(summary.marketPressureScore) : { label: 'データ不足' };
  
  if (summary.marketPressureScore >= 75) scoreClass = 'danger';
  if (summary.marketPressureScore <= 39) scoreClass = 'success';

  // 満室率
  const soldOutRateText = summary.marketPressureScore >= 0 ? Math.round(summary.competitorSoldOutRate) + '％' : '-';
  const soldOutDesc = `${summary.totalHotels - summary.unknownHotels}施設中 ${summary.unavailableHotels}施設が予約不可`;

  // 前回比
  let diffText = '-';
  let diffDesc = '前回データなし';
  let diffClass = '';
  if (summary.marketPressureDifference !== null) {
    diffText = (summary.marketPressureDifference > 0 ? '＋' : '') + summary.marketPressureDifference;
    if (summary.marketPressureDifference > 0) { diffDesc = '需要が強まっています'; diffClass = 'danger'; }
    else if (summary.marketPressureDifference < 0) { diffDesc = '空室が増えています'; diffClass = 'success'; }
    else { diffDesc = '変化なし'; diffText = '±0'; }
  }

  // 最安値
  let lowestText = summary.lowestCompetitorPrice ? summary.lowestCompetitorPrice.toLocaleString() + '円' : '全室満室';
  let lowestDesc = '-';
  
  if (summary.lowestCompetitorPrice && data.hotels) {
    const prevData = AppState.marketResearchHistory.filter(d => d.summary.stayDate === summary.stayDate && d.summary.checkedAt < summary.checkedAt).pop();
    if (prevData && prevData.summary.lowestCompetitorPrice) {
      const pDiff = summary.lowestCompetitorPrice - prevData.summary.lowestCompetitorPrice;
      if (pDiff > 0) lowestDesc = `前回比 ＋${pDiff.toLocaleString()}円`;
      else if (pDiff < 0) lowestDesc = `前回比 ${pDiff.toLocaleString()}円`;
      else lowestDesc = '前回と同額';
    }
  }

  // 料金判断
  const actionText = labelObj.priceAction ? labelObj.priceAction.split('を検討')[0] : '-';

  container.innerHTML = `
    <div class="mr-top-card">
      <div class="mr-top-card-title">市場ひっ迫度</div>
      <div class="mr-top-card-value ${scoreClass}">${scoreText}</div>
      <div class="mr-top-card-desc">${labelObj.label}</div>
    </div>
    <div class="mr-top-card">
      <div class="mr-top-card-title">競合満室率</div>
      <div class="mr-top-card-value">${soldOutRateText}</div>
      <div class="mr-top-card-desc">${soldOutDesc}</div>
    </div>
    <div class="mr-top-card">
      <div class="mr-top-card-title">前回比</div>
      <div class="mr-top-card-value ${diffClass}">${diffText}</div>
      <div class="mr-top-card-desc">${diffDesc}</div>
    </div>
    <div class="mr-top-card">
      <div class="mr-top-card-title">競合最安値</div>
      <div class="mr-top-card-value">${lowestText}</div>
      <div class="mr-top-card-desc">${lowestDesc}</div>
    </div>
    <div class="mr-top-card">
      <div class="mr-top-card-title">料金判断</div>
      <div class="mr-top-card-value" style="font-size: 14px; font-weight:700;">${actionText}</div>
      <div class="mr-top-card-desc" style="font-size: 9px;">※推奨アクション</div>
    </div>
  `;
}

function renderChart(dateStr) {
  const container = document.getElementById('mr-chart-container');
  if (!container) return;
  
  const history = AppState.marketResearchHistory.filter(d => d.summary.stayDate === dateStr);
  if (history.length <= 1) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  const labels = history.map(h => {
    const d = new Date(h.summary.checkedAt);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const dataPoints = history.map(h => Math.max(0, h.summary.marketPressureScore));

  const ctx = document.getElementById('pressureChart').getContext('2d');
  if (AppState.chartInstance) {
    AppState.chartInstance.destroy();
  }

  AppState.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '市場ひっ迫度',
        data: dataPoints,
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        borderWidth: 2,
        tension: 0.1,
        fill: true,
        pointBackgroundColor: '#dc2626'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderMarketMetricContent() {
  const container = document.getElementById('mr-result-content');
  if (!container || !AppState.currentViewData) return;

  const metricId = AppState.selectedMarketMetric;
  const data = AppState.currentViewData;
  const summary = data.summary;

  const headerTitle = document.getElementById('mr-result-title');
  const metricLabels = {
    prices: '🏢 施設ごとの状況・価格',
    direct_avg: '📊 直接比較の平均価格',
    all_range: '🌐 市場全体の価格帯',
    stats: '📋 分析サマリー'
  };
  if (headerTitle) headerTitle.textContent = metricLabels[metricId] || '指標';

  switch (metricId) {
    case 'prices':
      container.innerHTML = `<div class="mr-grid">
        ${data.hotels.map(h => {
          const catLabel = h.category === 'direct' ? '🔵 直接競合' : '🔘 参考ホテル';
          let statusBadge = '';
          if (h.status === 'available') statusBadge = '<span style="color:#16a34a; font-weight:bold;">予約可能</span>';
          else if (h.status === 'unavailable') statusBadge = '<span style="color:#dc2626; font-weight:bold;">予約不可</span>';
          else statusBadge = '<span style="color:#64748b;">未確認</span>';

          let priceStr = '予約不可';
          let diffBadge = '';
          if (h.status === 'available') {
            if (h.lowestPrice !== null) {
              priceStr = `¥${h.lowestPrice.toLocaleString()}`;
              if (h.priceDifference > 0) diffBadge = `<span style="color:#dc2626; font-size:11px;">(前回比 +¥${h.priceDifference.toLocaleString()})</span>`;
              if (h.priceDifference < 0) diffBadge = `<span style="color:#16a34a; font-size:11px;">(前回比 ¥${h.priceDifference.toLocaleString()})</span>`;
            } else {
              priceStr = '<span style="font-size:12px; color:#64748b;">価格不明(取得不可)</span>';
            }
          } else if (h.status === 'unknown') {
            priceStr = '-';
          }

          let prevStr = h.previousStatus ? (h.previousStatus === 'available' ? '予約可能' : '予約不可') : '履歴なし';
          
          let changeMsg = '';
          if (h.statusChange === 'newly_unavailable') changeMsg = '<div style="color:#dc2626; font-weight:bold; font-size:11px; margin-top:4px;">新たに予約不可となりました</div>';
          if (h.statusChange === 'reopened') changeMsg = '<div style="color:#16a34a; font-weight:bold; font-size:11px; margin-top:4px;">空室が再販売されました</div>';

          const checkedDate = new Date(h.checkedAt);
          const checkedStr = `${checkedDate.getFullYear()}/${checkedDate.getMonth()+1}/${checkedDate.getDate()} ${checkedDate.getHours()}:${String(checkedDate.getMinutes()).padStart(2,'0')}`;

          return `<div class="mr-hotel-card ${h.status === 'unavailable' ? 'full' : ''}">
            <div class="mr-hotel-card-header" style="margin-bottom:8px;">
              <span class="mr-hotel-type-badge ${h.category==='direct'?'blue':'orange'}">${catLabel}</span>
              <h4 class="mr-hotel-name">${h.hotelName}</h4>
            </div>
            <div style="font-size:14px; margin-bottom:8px;">
              状況: ${statusBadge}
              ${changeMsg}
            </div>
            <div style="font-size:12px; margin-bottom:12px; min-height: 20px;">
              現在最安値: <span style="font-size:16px; font-weight:bold; color:var(--primary);">${priceStr}</span> ${diffBadge}
            </div>
            <div class="mr-hotel-details" style="background:#f1f5f9; padding:10px; border-radius:6px; font-size: 11px;">
              <p style="margin:0 0 4px 0;">前回状況: ${prevStr} ${h.previousPrice ? `(¥${h.previousPrice.toLocaleString()})` : ''}</p>
              <p style="margin:0 0 4px 0;">最終確認: ${checkedStr}</p>
              <p style="margin:0;">OTA: ${h.otaName}</p>
            </div>
          </div>`;
        }).join('')}
      </div>`;
      break;

    case 'direct_avg':
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">直接競合 施設の平均価格</span>
        <div class="mr-kpi-value gradient">
          ${summary.averageCompetitorPrice ? `¥${summary.averageCompetitorPrice.toLocaleString()}` : '予約不可・データなし'}
        </div>
        <p class="mr-kpi-desc">
          競合ビジネスホテルの平均値です。当ホテルの販売価格がこの平均価格と大きく乖離していないかを確認し、基準単価の調整にご活用ください。
        </p>
      </div>`;
      break;

    case 'all_range':
      const allPrices = data.hotels.filter(h => h.lowestPrice !== null).map(h => h.lowestPrice).sort((a,b)=>a-b);
      container.innerHTML = `<div class="mr-kpi-view">
        <span class="mr-kpi-label">エリア全体の販売価格帯（最安値 〜 最高値）</span>
        <div class="mr-kpi-value text-dark" style="font-size: 3rem;">
          ${allPrices.length > 0 ? `¥${allPrices[0].toLocaleString()} 〜 ¥${allPrices[allPrices.length - 1].toLocaleString()}` : '全施設予約不可'}
        </div>
        <p class="mr-kpi-desc">
          相場参考ホテルを含めた全体の価格差です。高価格帯ホテルが値を上げている日は、需要が強いと判断できます。
        </p>
      </div>`;
      break;

    case 'stats':
      const labelObj = summary.marketPressureScore >= 0 ? getMarketPressureLabel(summary.marketPressureScore) : null;
      container.innerHTML = `<div class="mr-stats-view">
        <h3 style="font-size: 1.1rem; margin-bottom: 16px; font-weight: 700;">📊 分析サマリー</h3>
        
        <div style="background: #fff; padding: 20px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); margin-bottom: 20px;">
          <h4 style="color: var(--primary); margin-top: 0; margin-bottom: 12px; font-size: 14px;">市場の状況</h4>
          <p style="font-size: 14px; line-height: 1.6; margin:0;">${labelObj ? labelObj.message : 'データが不足しています。'}</p>
        </div>

        <div style="background: #fff; padding: 20px; border-radius: var(--radius-sm); border: 1.5px solid var(--border);">
          <h4 style="color: #dc2626; margin-top: 0; margin-bottom: 12px; font-size: 14px;">推奨アクション</h4>
          <p style="font-size: 14px; line-height: 1.6; font-weight: bold; margin:0;">${labelObj ? labelObj.priceAction : 'データが不足しています。'}</p>
          <p style="font-size: 11px; color: #64748b; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            この料金提案は、市場の予約可能状況を基にした参考値です。自ホテルの残室数、予約進捗、曜日、イベント、競合料金を確認したうえで最終判断してください。
          </p>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <button class="mr-ai-btn" onclick="fetchAIAdvice()">🤖 AIに戦略を相談する (口コミトレンド分析付)</button>
        </div>
        
        <div id="mr-ai-result-box" style="display: none; margin-top: 20px; padding: 20px; background: linear-gradient(145deg, #f0fdf4, #f8fafc); border: 1.5px solid #22c55e; border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); text-align: left;">
          <h4 style="color: #15803d; margin-top: 0; margin-bottom: 16px; font-size: 15px;"><i class="fas fa-robot"></i> AI戦略アドバイザー</h4>
          <div id="mr-ai-loading" style="text-align: center; color: #16a34a; font-size: 14px; padding: 20px 0;">
            <i class="fas fa-circle-notch fa-spin fa-2x" style="margin-bottom:10px;"></i><br>
            市場データと競合の最新口コミを分析しています...（約10〜15秒）
          </div>
          <div id="mr-ai-content" style="font-size: 13.5px; line-height: 1.7; color: #334155; display: none;"></div>
        </div>
      </div>`;
      break;

    default:
      container.innerHTML = '<p class="text-muted">指標を選択してください。</p>';
  }
}

// ==========================================
// モーダル操作
// ==========================================
function openSpecModal() {
  const modal = document.getElementById('mr-spec-modal');
  if (modal) modal.classList.add('active');
}

function closeSpecModal() {
  const modal = document.getElementById('mr-spec-modal');
  if (modal) modal.classList.remove('active');
}

// モーダルの外側をクリックしたら閉じる
window.addEventListener('click', (e) => {
  const modal = document.getElementById('mr-spec-modal');
  if (e.target === modal) {
    closeSpecModal();
  }
});

// ==========================================
// AIアドバイザー呼び出し
// ==========================================
async function fetchAIAdvice() {
  const resultBox = document.getElementById('mr-ai-result-box');
  const loading = document.getElementById('mr-ai-loading');
  const content = document.getElementById('mr-ai-content');
  const btn = document.querySelector('.mr-ai-btn');

  if (!AppState.currentViewData || !resultBox) return;

  resultBox.style.display = 'block';
  loading.style.display = 'block';
  content.style.display = 'none';
  if (btn) btn.disabled = true;

  try {
    const response = await fetch('https://nasumid-p.netlify.app/.netlify/functions/aiAdvisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketData: AppState.currentViewData })
    });

    if (!response.ok) {
      throw new Error(`エラーが発生しました: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    let htmlContent = data.advice
      .replace(/### (.*)/g, '<h5 style="color:#16a34a; font-size:15px; margin: 16px 0 8px 0; border-bottom:1px solid #dcfce7; padding-bottom:4px;">$1</h5>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a;">$1</strong>')
      .replace(/\n\n/g, '</p><p style="margin-bottom:12px;">')
      .replace(/\n- (.*)/g, '<li style="margin-left: 16px; margin-bottom: 4px;">$1</li>');
    
    htmlContent = `<p style="margin-top:0;">${htmlContent}</p>`;
    
    content.innerHTML = htmlContent;
    loading.style.display = 'none';
    content.style.display = 'block';

  } catch (error) {
    loading.style.display = 'none';
    content.style.display = 'block';
    content.innerHTML = `<p style="color: #dc2626;"><strong>取得失敗:</strong><br>${error.message}<br>※Netlifyの環境変数（GEMINI_API_KEY）が正しく設定されているか確認してください。</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}
