/**
 * charts.js
 * Chart.js を使ったグラフ描画
 */

let demandChartInstance = null;
let channelChartInstance = null;

// ===== 需要予測グラフ（30日間） =====
function renderDemandChart() {
  const canvas = document.getElementById('demandChart');
  if (!canvas) return;

  const forecast = get30DayForecast();

  // 既存チャートを破棄
  if (demandChartInstance) {
    demandChartInstance.destroy();
    demandChartInstance = null;
  }

  demandChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: forecast.dates,
      datasets: [
        {
          label: '推奨価格（円）',
          data: forecast.prices,
          backgroundColor: forecast.prices.map(p => {
            const room = AppState.settings.rooms[0];
            if (p >= room.base * 1.2) return 'rgba(220, 38, 38, 0.75)';
            if (p <= room.base * 0.9) return 'rgba(59, 130, 246, 0.75)';
            return 'rgba(37, 99, 235, 0.65)';
          }),
          borderColor: forecast.prices.map(p => {
            const room = AppState.settings.rooms[0];
            if (p >= room.base * 1.2) return '#dc2626';
            if (p <= room.base * 0.9) return '#3b82f6';
            return '#2563eb';
          }),
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y'
        },
        {
          label: '稼働率予測（%）',
          data: forecast.occs,
          type: 'line',
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.08)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.4,
          yAxisID: 'y1',
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: "'Noto Sans JP', sans-serif", size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return ` 推奨価格: ¥${ctx.raw.toLocaleString()}`;
              if (ctx.datasetIndex === 1) return ` 稼働率: ${ctx.raw}%`;
              return ctx.formattedValue;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10, family: "'Noto Sans JP', sans-serif" },
            maxTicksLimit: 15,
            maxRotation: 45
          },
          grid: { display: false }
        },
        y: {
          position: 'left',
          title: { display: true, text: '推奨価格（円）', font: { size: 11 } },
          ticks: {
            font: { size: 11 },
            callback: v => `¥${v.toLocaleString()}`
          },
          grid: { color: '#f1f5f9' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: '稼働率（%）', font: { size: 11 } },
          min: 0, max: 100,
          ticks: {
            font: { size: 11 },
            callback: v => v + '%'
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

// ===== チャネル別予約比率チャート =====
function renderChannelChart() {
  const canvas = document.getElementById('channelChart');
  if (!canvas) return;

  if (channelChartInstance) {
    channelChartInstance.destroy();
    channelChartInstance = null;
  }

  channelChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['楽天トラベル', 'じゃらん', '公式サイト', 'Booking.com', 'その他'],
      datasets: [{
        data: [35, 28, 18, 12, 7],
        backgroundColor: [
          '#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#94a3b8'
        ],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Noto Sans JP', sans-serif", size: 12 },
            padding: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}%`
          }
        }
      },
      cutout: '62%'
    }
  });
}

// ===== 年度別トレンド比較チャート =====
function renderTravelTrendChart() {
  const canvas = document.getElementById('travelTrendChart');
  if (!canvas) return;

  const months = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];
  
  // デモ用モックデータ
  const data2024 = [82, 85, 80, 84, 95, 82, 88, 90, 78, 75, 76, 82];
  const data2025 = [85, 88, 84, 88, 98, 86, 92, 94, 82, 78, 80, 85];
  const data2026 = [92, 94, 91, null, null, null, null, null, null, null, null, null]; // 予測を含む

  if (window.trendChartInstance) {
    window.trendChartInstance.destroy();
  }

  window.trendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: '2026年度 (予測含)',
          data: data2026,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb',
          tension: 0.3,
          fill: false,
          spanGaps: true
        },
        {
          label: '2025年度',
          data: data2025,
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [5, 5],
          tension: 0.3,
          fill: false
        },
        {
          label: '2024年度',
          data: data2024,
          borderColor: '#94a3b8',
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 60, max: 100,
          ticks: { callback: v => v + '%' },
          grid: { color: '#f1f5f9' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

// ===== 全グラフ初期化 =====
function initCharts() {
  renderDemandChart();
  renderChannelChart();
  renderTravelTrendChart();
}
