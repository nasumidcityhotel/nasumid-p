// Node.js 18+ のグローバル fetch を使用するため node-fetch は不要です

// 対象競合ホテル定義
const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横イン那須塩原駅西口', rakutenId: '186255', basePrice: 7200, url: 'https://travel.rakuten.co.jp/HOTEL/186255/' },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', rakutenId: '27988', basePrice: 7800, url: 'https://travel.rakuten.co.jp/HOTEL/27988/' },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', rakutenId: '143534', basePrice: 7400, url: 'https://travel.rakuten.co.jp/HOTEL/143534/' },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', rakutenId: '181673', basePrice: 6500, url: 'https://travel.rakuten.co.jp/HOTEL/181673/' },
  { id: 'station_hotel', name: '那須塩原ステーションホテル', rakutenId: '28612', basePrice: 6800, url: 'https://travel.rakuten.co.jp/HOTEL/28612/' },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', rakutenId: '163533', basePrice: 8500, url: 'https://travel.rakuten.co.jp/HOTEL/163533/' },
  { id: 'nogi_onsen', name: '乃木温泉ホテル', rakutenId: '27906', basePrice: 9500, url: 'https://travel.rakuten.co.jp/HOTEL/27906/' }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseHotelPrice(hotelData) {
  let minCharge = null;
  const basicInfo = hotelData.hotel[0].hotelBasicInfo;
  const roomInfoArray = hotelData.hotel.slice(1);
  const prices = [];

  roomInfoArray.forEach(room => {
    const charge = room.roomInfo[0].dailyCharge;
    if (charge && charge.rakutenCharge) {
      const val = parseInt(charge.rakutenCharge, 10);
      if (val > 0) prices.push(val);
    }
  });

  if (prices.length > 0) {
    minCharge = Math.min(...prices);
  } else if (basicInfo && basicInfo.hotelMinCharge) {
    minCharge = parseInt(basicInfo.hotelMinCharge, 10);
  }
  
  return { price: minCharge, vacantCount: prices.length || 3 };
}

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

  // クエリまたはボディから日付を取得 (デフォルトは翌週の水曜日)
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
    checkinDateStr = defaultDate.toISOString().slice(0, 10);
  }

  const appId = process.env.RAKUTEN_APP_ID || process.env.RAKUTEN_APPLICATION_ID;
  const isDemoMode = !appId;

  console.log(`Researching date: ${checkinDateStr}, DemoMode: ${isDemoMode}`);

  // チェックアウト日の計算 (タイムゾーンのズレを防ぐため、文字列をパースして日付を加算)
  const parts = checkinDateStr.split('-');
  const checkinYear = parseInt(parts[0], 10);
  const checkinMonth = parseInt(parts[1], 10) - 1;
  const checkinDay = parseInt(parts[2], 10);
  const checkoutDate = new Date(checkinYear, checkinMonth, checkinDay + 1);
  const checkoutDateStr = `${checkoutDate.getFullYear()}-${String(checkoutDate.getMonth() + 1).padStart(2, '0')}-${String(checkoutDate.getDate()).padStart(2, '0')}`;

  const results = [];

  if (isDemoMode) {
    // APIキーがない場合のデモ用フォールバック
    // 曜日や日付のハッシュ値から決定論的に揺らぎをもたせた価格を生成する
    for (const hotel of COMPETITOR_HOTELS) {
      const checkinDateObj = new Date(checkinYear, checkinMonth, checkinDay);
      const dayOfWeek = checkinDateObj.getDay(); // 0: 日, 6: 土
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // 金土は高価格
      const dayFactor = (checkinDateObj.getDate() % 5) * 300 - 600;
      
      let price = hotel.basePrice + dayFactor;
      if (isWeekend) {
        price = Math.round(price * 1.25);
      }
      
      // 一定確率で「空室なし」をシミュレート
      const hash = (checkinDateObj.getDate() + hotel.rakutenId.charCodeAt(0)) % 10;
      const status = hash === 0 ? 'unavailable' : 'available';
      const actualPrice = status === 'available' ? price : null;
      const vacantCount = status === 'available' ? (hash % 8) + 1 : 0;

      results.push({
        id: hotel.id,
        name: hotel.name,
        rakutenId: hotel.rakutenId,
        url: hotel.url,
        status,
        vacantCount,
        price: actualPrice
      });
    }
  } else {
    // 楽天API接続処理（一括検索方式）
    const accessKey = process.env.RAKUTEN_ACCESS_KEY || '';
    const affiliateId = process.env.RAKUTEN_AFFILIATE_ID || '';
    const apiEndpoint = `https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426`;
    const hotelNos = COMPETITOR_HOTELS.map(h => h.rakutenId).join(',');

    const fetchFromRakuten = async (adultNum) => {
      let url = `${apiEndpoint}?applicationId=${appId}&accessKey=${accessKey}&format=json&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=${adultNum}&searchPattern=1&hits=30&hotelNo=${hotelNos}`;
      if (affiliateId) {
        url += `&affiliateId=${affiliateId}`;
      }
      
      console.log(`[Rakuten API Request] Batch call for ${adultNum} guest(s)`);
      const response = await fetch(url, {
        headers: {
          'Referer': 'https://nasumid-p.netlify.app/',
          'Origin': 'https://nasumid-p.netlify.app'
        }
      });
      return response;
    };

    try {
      // 1. まず大人1名で一括検索を試みる
      let response1 = await fetchFromRakuten(1);
      let data1 = null;
      let availableCount1 = 0;

      if (response1.ok) {
        data1 = await response1.json();
        availableCount1 = data1.hotels ? data1.hotels.length : 0;
      } else if (response1.status !== 404) {
        let errText = '';
        try { errText = await response1.text(); } catch(e) {}
        throw new Error(`API error status ${response1.status}: ${errText}`);
      }

      // 2. 1名検索で引っかかったホテルが極めて少ない（または0）の場合、大人2名でフォールバック検索を行う
      // ※特に旅館や土曜日などでは1名利用プランが全くない場合が多いため
      let data2 = null;
      if (availableCount1 === 0 || (availableCount1 < COMPETITOR_HOTELS.length / 2)) {
        await sleep(1100); // 429回避用のウェイト
        try {
          let response2 = await fetchFromRakuten(2);
          if (response2.ok) {
            data2 = await response2.json();
            console.log(`[Rakuten API] Fallback to 2 guests search found ${data2.hotels ? data2.hotels.length : 0} hotels`);
          }
        } catch (err2) {
          console.warn("Fallback 2-guest search failed:", err2.message);
        }
      }

      // 3. 両方の結果をマージして各ホテルのステータスと価格を決定する
      for (const hotel of COMPETITOR_HOTELS) {
        const found1 = data1 && data1.hotels ? data1.hotels.find(h => String(h.hotel[0].hotelBasicInfo.hotelNo) === String(hotel.rakutenId)) : null;
        const found2 = data2 && data2.hotels ? data2.hotels.find(h => String(h.hotel[0].hotelBasicInfo.hotelNo) === String(hotel.rakutenId)) : null;

        if (found1) {
          const { price, vacantCount } = parseHotelPrice(found1);
          results.push({
            id: hotel.id,
            name: hotel.name,
            rakutenId: hotel.rakutenId,
            url: hotel.url,
            status: 'available',
            vacantCount,
            price
          });
        } else if (found2) {
          const { price, vacantCount } = parseHotelPrice(found2);
          results.push({
            id: hotel.id,
            name: hotel.name,
            rakutenId: hotel.rakutenId,
            url: hotel.url,
            status: 'available',
            vacantCount,
            price: price ? Math.round(price / 2) : null // 2名合計の半額
          });
        } else {
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
      console.error("Rakuten API batch process failed:", err.message);
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
  }

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      date: checkinDateStr,
      isDemoMode,
      results
    })
  };
}
