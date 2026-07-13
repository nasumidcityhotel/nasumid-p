/**
 * data.js
 * ダイナミックプライシング管理システム
 * マスターデータ・設定・状態管理 (ローカルモード)
 */

// ===== 初期設定データ =====
const DEFAULT_SETTINGS = {
  rooms: [
    { id: 'moderate',  name: 'モデレートルーム', base: 7800,  min: 6800,  max: 9800,  maxChangeUp1: 1000, maxChangeDown1: 1000, autoApprove: false },
    { id: 'comfort',   name: 'コンフォートルーム', base: 8200,  min: 7200,  max: 10200, maxChangeUp1: 1000, maxChangeDown1: 1000, maxChangeUp2: 3000, maxChangeDown2: 3000, autoApprove: false },
    { id: 'corner',    name: 'コーナールーム',     base: 10200, min: 8200,  max: 12200, maxChangeUp1: 1000, maxChangeDown1: 1000, maxChangeUp2: 3000, maxChangeDown2: 3000, autoApprove: false },
    { id: 'twin',      name: 'ツインルーム',       base: 12200, min: 10200, max: 14200, maxChangeUp1: 1000, maxChangeDown1: 1000, maxChangeUp2: 3000, maxChangeDown2: 3000, autoApprove: false },
    { id: 'universal', name: 'ユニバーサルルーム', base: 9700,  min: 7700,  max: 11700, maxChangeUp1: 1000, maxChangeDown1: 1000, maxChangeUp2: 3000, maxChangeDown2: 3000, autoApprove: false },
    { id: 'deluxe',    name: 'デラックスツイン',   base: 15000, min: 13000, max: 17000, maxChangeUp1: 1000, maxChangeDown1: 1000, maxChangeUp2: 3000, maxChangeDown2: 3000, autoApprove: false },
  ],
  weekdayCoeff: {
    '月': 1.0, '火': 1.0, '水': 1.0, '木': 1.05, '金': 1.18, '土': 1.30, '日': 1.20
  },
  occupancyRules: {
    occ90: 25, occ70: 10, occ50: 0, occLow: -10
  },
  maxChangeUp: 2000,
  maxChangeDown: 2000,
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
};

// 競合調査対象ホテル
const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横イン那須塩原駅西口', type: 'direct' },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', type: 'direct' },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', type: 'direct' },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', type: 'direct' },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', type: 'market' },
  { id: 'nogi_onsen', name: '乃木温泉ホテル', type: 'market' }
];

// ===== アプリケーション状態 =====
const AppState = {
  settings: null,
  proposals: [],
  history: [],
  manualData: [],
  marketResearchData: [],
  selectedMarketDate: '2026-07-22',
  selectedMarketMetric: 'prices',
  currentProposalId: null,
  calendarMonth: new Date(),
  nextEventId: 12,
};

// ===== 全データ読み込み (LocalStorage版) =====
async function loadAllData() {
  console.log("💾 ローカル保存からデータを読み込み中...");
  
  // 設定
  const s = localStorage.getItem('dp_settings');
  AppState.settings = s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  // 提案
  const p = localStorage.getItem('dp_proposals');
  AppState.proposals = p ? JSON.parse(p) : [];

  // 履歴
  const h = localStorage.getItem('dp_history');
  AppState.history = h ? JSON.parse(h) : [];

  // 手動データ
  const m = localStorage.getItem('dp_manual_data');
  AppState.manualData = m ? JSON.parse(m) : [];

  // 市場調査データ
  const mr = localStorage.getItem('dp_market_research');
  AppState.marketResearchData = mr ? JSON.parse(mr) : [];

  console.log("✅ ローカルデータの読み込みが完了しました");
}

// ===== 保存用関数 (各機能から呼び出される) =====

async function saveSettingsToStorage() {
  localStorage.setItem('dp_settings', JSON.stringify(AppState.settings));
}

async function saveProposals() {
  localStorage.setItem('dp_proposals', JSON.stringify(AppState.proposals));
}

async function saveHistoryEntry(entry) {
  // 既存の履歴に追加
  AppState.history.unshift(entry);
  localStorage.setItem('dp_history', JSON.stringify(AppState.history));
}

async function saveManualData() {
  localStorage.setItem('dp_manual_data', JSON.stringify(AppState.manualData));
}

async function saveMarketResearchData(data) {
  AppState.marketResearchData = data;
  localStorage.setItem('dp_market_research', JSON.stringify(data));
}

// ===== ユーティリティ =====
function formatCurrency(val) { return '¥' + Math.round(val).toLocaleString('ja-JP'); }
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const wdays = ['日','月','火','水','木','金','土'];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${wdays[d.getDay()]}）`;
}
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const wdays = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}/${d.getDate()}（${wdays[d.getDay()]}）`;
}
function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['日','月','火','水','木','金','土'][d.getDay()];
}
function isHoliday(dateStr) {
  const holidays = [
    '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-03-20','2025-04-29','2025-05-03','2025-05-04',
    '2025-05-05','2025-05-06','2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13','2025-11-03',
    '2025-11-23','2025-12-23'
  ];
  return holidays.includes(dateStr);
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function getTodayString() { return new Date().toISOString().split('T')[0]; }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
