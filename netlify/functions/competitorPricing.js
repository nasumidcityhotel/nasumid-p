// Node.js 18+ のグローバル fetch を使用するため node-fetch は不要です

// 対象競合ホテル定義
const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横イン那須塩原駅西口', rakutenId: '186255', basePrice: 7200, url: 'https://travel.rakuten.co.jp/HOTEL/186255/186255.html' },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', rakutenId: '27988', basePrice: 7800, url: 'https://travel.rakuten.co.jp/HOTEL/27988/27988.html' },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', rakutenId: '143534', basePrice: 7400, url: 'https://travel.rakuten.co.jp/HOTEL/143534/143534.html' },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', rakutenId: '181673', basePrice: 6500, url: 'https://travel.rakuten.co.jp/HOTEL/181673/181673.html' },
  { id: 'station_hotel', name: '那須塩原ステーションホテル', rakutenId: '28612', basePrice: 6800, url: 'https://travel.rakuten.co.jp/HOTEL/28612/28612.html' },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', rakutenId: '163533', basePrice: 8500, url: 'https://travel.rakuten.co.jp/HOTEL/163533/163533.html' },
  { id: 'nogi_onsen', name: '乃木温泉ホテル', rakutenId: '27906', basePrice: 9500, url: 'https://travel.rakuten.co.jp/HOTEL/27906/27906.html' }
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
  // 赤沢温泉と完全に同じAPI呼び出しパターン
  // ページネーション付き一括検索
  // ===================================================================
  const fetchAllPages = async (adultNum) => {
    let allHotels = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && page <= 8) {
      const url = `${apiEndpoint}?applicationId=${WORKING_APP_ID}&accessKey=${WORKING_ACCESS_KEY}&format=json&hotelNo=${hotelNos}&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=${adultNum}&searchPattern=1&hits=30&page=${page}&affiliateId=${affiliateId}`;

      try {
        const resp = await fetch(url, {
          headers: {
            'Referer': 'https://nasumid-p.netlify.app/',
            'Origin': 'https://nasumid-p.netlify.app'
          }
        });

        if (resp.ok) {
          const json = await resp.json();
          if (json && json.hotels) {
            allHotels = allHotels.concat(json.hotels);
            const pagingInfo = json.pagingInfo;
            if (pagingInfo && page < pagingInfo.pageCount) {
              page++;
              await sleep(1100);
            } else {
              hasNextPage = false;
            }
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      } catch (e) {
        console.warn(`[fetchAllPages] page ${page} error:`, e.message);
        hasNextPage = false;
      }
    }

    return allHotels;
  };

  const results = [];

  try {
    // ステップ1: 大人1名で一括検索（ページネーション付き）
    const hotels1 = await fetchAllPages(1);
    console.log(`[competitorPricing] adultNum=1 found ${hotels1.length} hotel entries`);

    // ステップ2: 見つかったホテルが少なければ大人2名でも検索
    let hotels2 = [];
    const found1Ids = new Set();
    hotels1.forEach(h => {
      const no = String(h.hotel[0].hotelBasicInfo.hotelNo);
      found1Ids.add(no);
    });

    if (found1Ids.size < COMPETITOR_HOTELS.length) {
      await sleep(1100);
      hotels2 = await fetchAllPages(2);
      console.log(`[competitorPricing] adultNum=2 found ${hotels2.length} hotel entries`);
    }

    // ステップ3: 結果をマージして各ホテルの最安値を決定
    for (const hotel of COMPETITOR_HOTELS) {
      // 1名検索の結果からこのホテルのプランを集める
      const plans1 = [];
      hotels1.forEach(h => {
        const info = h.hotel[0].hotelBasicInfo;
        if (String(info.hotelNo) === String(hotel.rakutenId)) {
          h.hotel.forEach(el => {
            if (el.roomInfo) {
              const dailyChargeContainer = el.roomInfo.find(innerEl => innerEl.dailyCharge);
              // 赤沢温泉と同じく dailyCharge.total を使う
              const price = dailyChargeContainer && dailyChargeContainer.dailyCharge
                ? (dailyChargeContainer.dailyCharge.total || dailyChargeContainer.dailyCharge.rakutenCharge || 0)
                : 0;
              if (price > 0) {
                plans1.push(price);
              }
            }
          });
        }
      });

      // 2名検索の結果からこのホテルのプランを集める
      const plans2 = [];
      hotels2.forEach(h => {
        const info = h.hotel[0].hotelBasicInfo;
        if (String(info.hotelNo) === String(hotel.rakutenId)) {
          h.hotel.forEach(el => {
            if (el.roomInfo) {
              const dailyChargeContainer = el.roomInfo.find(innerEl => innerEl.dailyCharge);
              const price = dailyChargeContainer && dailyChargeContainer.dailyCharge
                ? (dailyChargeContainer.dailyCharge.total || dailyChargeContainer.dailyCharge.rakutenCharge || 0)
                : 0;
              if (price > 0) {
                plans2.push(price);
              }
            }
          });
        }
      });

      if (plans1.length > 0) {
        // 1名利用で空室あり → そのまま最安値を表示
        results.push({
          id: hotel.id,
          name: hotel.name,
          rakutenId: hotel.rakutenId,
          url: hotel.url,
          status: 'available',
          vacantCount: plans1.length,
          price: Math.min(...plans1)
        });
      } else if (plans2.length > 0) {
        // 2名利用で空室あり → 合計金額の半額を1人あたり料金として表示
        results.push({
          id: hotel.id,
          name: hotel.name,
          rakutenId: hotel.rakutenId,
          url: hotel.url,
          status: 'available',
          vacantCount: plans2.length,
          price: Math.round(Math.min(...plans2) / 2)
        });
      } else {
        // どちらでも見つからない → 本当に満室
        results.push({
          id: hotel.id,
          name: hotel.name,
          rakutenId: hotel.rakutenId,
          url: hotel.url,
          status: 'unavailable',
          vacantCount: 0,
          price: null
        });
      }
    }
  } catch (err) {
    console.error('[competitorPricing] Fatal error:', err.message);
    for (const hotel of COMPETITOR_HOTELS) {
      results.push({
        id: hotel.id,
        name: hotel.name,
        rakutenId: hotel.rakutenId,
        url: hotel.url,
        status: 'unknown',
        vacantCount: 0,
        price: null,
        errorMessage: err.message
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
      results
    })
  };
}
