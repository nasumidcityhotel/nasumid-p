/**
 * app.js
 * アプリケーション起動・初期化・イベントバインディング
 */

// ===== 起動処理 =====
document.addEventListener('DOMContentLoaded', async () => {
  // データ読み込み
  await loadAllData();

  // ハッシュ（戻るボタン）対応
  window.addEventListener('hashchange', () => {
    const pageId = location.hash.replace('#', '') || 'dashboard';
    switchPage(pageId, false);
  });

  // 初期ページ表示
  const startPage = location.hash.replace('#', '') || 'dashboard';
  switchPage(startPage, false);

  // データが空なら自動計算
  if (AppState.proposals.length === 0) {
    _executePricingEngine();
  }

  // 現在時刻の更新
  updateClock();
  setInterval(updateClock, 1000);

  // 最終計算時刻
  const now = new Date();
  document.getElementById('last-calc-time').textContent =
    `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  // ナビゲーションのイベント
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      if (pageId) {
        switchPage(pageId);
        // モバイル：メニュークリックで閉じる
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
        }
      }
    });
  });

  // サイドバートグル
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  });

  // モバイル：背景クリックで閉じる
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });

  // モーダル：背景クリックで閉じる
  document.getElementById('approval-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  // ドラッグ&ドロップ初期化
  initDragDrop();

  // 初期ページ描画
  renderDashboard();

  // Charts は少し遅らせて初期化（Chart.js ロード後）
  setTimeout(() => {
    initCharts();
  }, 100);

  // バッジ更新
  updateBadges();

  console.log('✅ ダイナミックプライシング管理システム 起動完了');
});

// ===== 現在時刻表示 =====
function updateClock() {
  const now = new Date();
  const wdays = ['日','月','火','水','木','金','土'];
  const el = document.getElementById('current-datetime');
  if (!el) return;

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    el.textContent = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  } else {
    el.textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${wdays[now.getDay()]}） ` +
      `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  }
}

// ===== キーボードショートカット =====
document.addEventListener('keydown', (e) => {
  // Escape でモーダルを閉じる
  if (e.key === 'Escape') closeModal();
});

// ===== デモ用：ダッシュボードKPIをリアルに =====
setInterval(() => {
  const occ = document.getElementById('kpi-occupancy');
  const revpar = document.getElementById('kpi-revpar');
  if (occ && revpar) {
    const occVal = 85 + Math.floor(Math.random() * 13);
    const adrVal = 8200 + Math.floor(Math.random() * 800);
    const revparVal = Math.round(occVal / 100 * adrVal);
    occ.innerHTML = `${occVal}<span class="kpi-unit">%</span>`;
    document.getElementById('kpi-adr-val').textContent = adrVal.toLocaleString();
    revpar.textContent = revparVal.toLocaleString();
  }
}, 8000);