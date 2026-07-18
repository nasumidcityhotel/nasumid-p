// Node.js 18+ のグローバル fetch を使用するため node-fetch は不要です

// 対象競合ホテル定義
const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横INN那須塩原駅西口', rakutenId: '189725', basePrice: 7200, url: 'https://travel.rakuten.co.jp/HOTEL/189725/189725.html' },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', rakutenId: '14768', basePrice: 7800, url: 'https://travel.rakuten.co.jp/HOTEL/14768/14768.html' },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', rakutenId: '147413', basePrice: 7400, url: 'https://travel.rakuten.co.jp/HOTEL/147413/147413.html' },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', rakutenId: '181673', basePrice: 6500, url: 'https://travel.rakuten.co.jp/HOTEL/181673/181673.html' },
  { id: 'station_hotel', name: '那須塩原ステーションホテル', rakutenId: '14352', basePrice: 6800, url: 'https://travel.rakuten.co.jp/HOTEL/14352/14352.html' },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', rakutenId: '140138', basePrice: 8500, url: 'https://travel.rakuten.co.jp/HOTEL/140138/140138.html' },
  { id: 'nogi_onsen', name: '乃木温泉ホテル', rakutenId: '161474', basePrice: 9500, url: 'https://travel.rakuten.co.jp/HOTEL/161474/161474.html' }
];

// 環境変数が読み込めなかった場合のハードコードフォールバック（赤沢温泉と同じ方式）
const WORKING_APP_ID = process.env.RAKUTEN_APP_ID || process.env.RAKUTEN_APPLICATION_ID || '057c911b-bec4-48af-8981-a94fc4f83c01';
const WORKING_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || 'pk_ZLMBkyngWXsxZW7vyXskGPqKXis7RWMHjTY373SAuEv';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // クエリまたはボディから日付を取得
  let checkinDateStr = '';
  try {
    if (event.body) {
      checkinDateStr = JSON.parse(event.body).date;
    }
  } catch(e) {}
  if (!checkinDateStr && event.queryStringParameters) {
    checkinDateStr = event.queryStringParameters.date;
  }

  if (!checkinDateStr) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    const y = defaultDate.getFullYear();
    const m = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const d = String(defaultDate.getDate()).padStart(2, '0');
    checkinDateStr = `${y}-${m}-${d}`;
  }

  // チェックアウト日の計算（タイムゾーンのズレを防ぐため文字列パース）
  const parts = checkinDateStr.split('-');
  const checkinYear = parseInt(parts[0], 10);
  const checkinMonth = parseInt(parts[1], 10) - 1;
  const checkinDay = parseInt(parts[2], 10);
  const coDate = new Date(checkinYear, checkinMonth, checkinDay + 1);
  const checkoutDateStr = `${coDate.getFullYear()}-${String(coDate.getMonth() + 1).padStart(2, '0')}-${String(coDate.getDate()).padStart(2, '0')}`;

  console.log(`[competitorPricing] checkin=${checkinDateStr}, checkout=${checkoutDateStr}`);

  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID || '55c8d52a.2cf28d81.55c8d52b.fd1c1360';
  const apiEndpoint = 'https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426';
  const hotelNos = COMPETITOR_HOTELS.map(h => h.rakutenId).join(',');

  // ===================================================================
  // 診断情報付きAPI呼び出し
  // ===================================================================
  const diagnostics = { steps: [] };

  const fetchAllPages = async (adultNum, label) => {
    let allHotels = [];
    let page = 1;
    let hasNextPage = true;
    const stepLog = { label, adultNum, pages: [], totalEntries: 0, foundHotelNos: [], rawStatuses: [] };

    while (hasNextPage && page <= 8) {
      const url = `${apiEndpoint}?applicationId=${WORKING_APP_ID}&accessKey=${WORKING_ACCESS_KEY}&format=json&hotelNo=${hotelNos}&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=${adultNum}&searchPattern=1&hits=30&page=${page}&affiliateId=${affiliateId}`;

      try {
        const resp = await fetch(url, {
          headers: {
            'Referer': 'https://nasumid-p.netlify.app/',
            'Origin': 'https://nasumid-p.netlify.app'
          }
        });

        stepLog.rawStatuses.push({ page, status: resp.status });

        if (resp.ok) {
          const json = await resp.json();
          if (json && json.hotels) {
            allHotels = allHotels.concat(json.hotels);
            stepLog.pages.push({ page, hotelEntries: json.hotels.length, pageCount: json.pagingInfo ? json.pagingInfo.pageCount : 'N/A' });
            const pagingInfo = json.pagingInfo;
            if (pagingInfo && page < pagingInfo.pageCount) {
              page++;
              await sleep(1100);
            } else {
              hasNextPage = false;
            }
          } else {
            stepLog.pages.push({ page, hotelEntries: 0, note: 'no hotels in response', rawKeys: json ? Object.keys(json) : [] });
            hasNextPage = false;
          }
        } else {
          let errBody = '';
          try { errBody = await resp.text(); } catch(e) {}
          stepLog.pages.push({ page, status: resp.status, error: errBody.substring(0, 200) });
          hasNextPage = false;
        }
      } catch (e) {
        stepLog.pages.push({ page, error: e.message });
        hasNextPage = false;
      }
    }

    // 見つかったホテルNoを集計
    const foundNos = new Set();
    allHotels.forEach(h => {
      try { foundNos.add(String(h.hotel[0].hotelBasicInfo.hotelNo)); } catch(e) {}
    });
    stepLog.totalEntries = allHotels.length;
    stepLog.foundHotelNos = Array.from(foundNos);

    diagnostics.steps.push(stepLog);
    return allHotels;
  };

  // 個別ホテル検索（バッチで見つからなかったホテルを1件ずつ検索）
  const fetchSingleHotel = async (rakutenId, adultNum) => {
    const url = `${apiEndpoint}?applicationId=${WORKING_APP_ID}&accessKey=${WORKING_ACCESS_KEY}&format=json&hotelNo=${rakutenId}&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=${adultNum}&searchPattern=1&hits=30&affiliateId=${affiliateId}`;
    try {
      const resp = await fetch(url, {
        headers: {
          'Referer': 'https://nasumid-p.netlify.app/',
          'Origin': 'https://nasumid-p.netlify.app'
        }
      });
      return { status: resp.status, ok: resp.ok, data: resp.ok ? await resp.json() : null };
    } catch (e) {
      return { status: 0, ok: false, error: e.message };
    }
  };

  const results = [];

  try {
    // ステップ1: 大人1名で一括検索（ページネーション付き）
    const hotels1 = await fetchAllPages(1, 'batch_adult1');

    // ステップ2: 大人2名で一括検索（ページネーション付き）
    await sleep(1100);
    const hotels2 = await fetchAllPages(2, 'batch_adult2');

    // バッチ検索で見つかったホテルNoを集計
    const batchFoundNos = new Set();
    hotels1.forEach(h => { try { batchFoundNos.add(String(h.hotel[0].hotelBasicInfo.hotelNo)); } catch(e) {} });
    hotels2.forEach(h => { try { batchFoundNos.add(String(h.hotel[0].hotelBasicInfo.hotelNo)); } catch(e) {} });

    // ステップ3: バッチで見つからなかったホテルを1件ずつ個別検索
    const individualResults = {};
    for (const hotel of COMPETITOR_HOTELS) {
      if (!batchFoundNos.has(hotel.rakutenId)) {
        await sleep(1100);
        const res1 = await fetchSingleHotel(hotel.rakutenId, 1);
        diagnostics.steps.push({ label: `individual_${hotel.rakutenId}_adult1`, status: res1.status, ok: res1.ok, hasHotels: !!(res1.data && res1.data.hotels), hotelCount: res1.data && res1.data.hotels ? res1.data.hotels.length : 0 });
        
        if (res1.ok && res1.data && res1.data.hotels) {
          individualResults[hotel.rakutenId] = { source: 'individual_1', hotels: res1.data.hotels };
        } else {
          await sleep(1100);
          const res2 = await fetchSingleHotel(hotel.rakutenId, 2);
          diagnostics.steps.push({ label: `individual_${hotel.rakutenId}_adult2`, status: res2.status, ok: res2.ok, hasHotels: !!(res2.data && res2.data.hotels), hotelCount: res2.data && res2.data.hotels ? res2.data.hotels.length : 0 });
          if (res2.ok && res2.data && res2.data.hotels) {
            individualResults[hotel.rakutenId] = { source: 'individual_2', hotels: res2.data.hotels };
          }
        }
      }
    }

    // ステップ4: すべての結果をマージして各ホテルの最安値を決定
    const extractPrices = (hotelEntries, targetRakutenId) => {
      const prices = [];
      hotelEntries.forEach(h => {
        const info = h.hotel[0].hotelBasicInfo;
        if (String(info.hotelNo) === String(targetRakutenId)) {
          h.hotel.forEach(el => {
            if (el.roomInfo) {
              const dc = el.roomInfo.find(innerEl => innerEl.dailyCharge);
              const price = dc && dc.dailyCharge
                ? (dc.dailyCharge.total || dc.dailyCharge.rakutenCharge || 0)
                : 0;
              if (price > 0) prices.push(price);
            }
          });
        }
      });
      return prices;
    };

    for (const hotel of COMPETITOR_HOTELS) {
      const plans1 = extractPrices(hotels1, hotel.rakutenId);
      const plans2 = extractPrices(hotels2, hotel.rakutenId);
      
      // 個別検索の結果もチェック
      const indiv = individualResults[hotel.rakutenId];
      let plansIndiv = [];
      let indivDivide = 1;
      if (indiv) {
        plansIndiv = extractPrices(indiv.hotels, hotel.rakutenId);
        indivDivide = indiv.source === 'individual_2' ? 2 : 1;
      }

      if (plans1.length > 0) {
        results.push({
          id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
          status: 'available', vacantCount: plans1.length, price: Math.min(...plans1)
        });
      } else if (plansIndiv.length > 0 && indivDivide === 1) {
        results.push({
          id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
          status: 'available', vacantCount: plansIndiv.length, price: Math.min(...plansIndiv)
        });
      } else if (plans2.length > 0) {
        results.push({
          id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
          status: 'available', vacantCount: plans2.length, price: Math.round(Math.min(...plans2) / 2)
        });
      } else if (plansIndiv.length > 0) {
        results.push({
          id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
          status: 'available', vacantCount: plansIndiv.length, price: Math.round(Math.min(...plansIndiv) / 2)
        });
      } else {
        results.push({
          id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
          status: 'unavailable', vacantCount: 0, price: null
        });
      }
    }
  } catch (err) {
    diagnostics.fatalError = err.message;
    for (const hotel of COMPETITOR_HOTELS) {
      results.push({
        id: hotel.id, name: hotel.name, rakutenId: hotel.rakutenId, url: hotel.url,
        status: 'unknown', vacantCount: 0, price: null, errorMessage: err.message
      });
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      date: checkinDateStr,
      isDemoMode: false,
      results,
      _diagnostics: diagnostics
    })
  };
}

