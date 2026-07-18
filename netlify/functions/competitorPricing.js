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

  for (const hotel of COMPETITOR_HOTELS) {
    if (isDemoMode) {
      // APIキーがない場合のデモ用フォールバック
      // 曜日や日付のハッシュ値から決定論的に揺らぎをもたせた価格を生成する
      const dayOfWeek = checkinDate.getDay(); // 0: 日, 6: 土
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // 金土は高価格
      const dayFactor = (checkinDate.getDate() % 5) * 300 - 600;
      
      let price = hotel.basePrice + dayFactor;
      if (isWeekend) {
        price = Math.round(price * 1.25);
      }
      
      // 一定確率で「空室なし」をシミュレート
      const hash = (checkinDate.getDate() + hotel.rakutenId.charCodeAt(0)) % 10;
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
    } else {
      // 楽天APIの過剰リクエストによる429エラーを回避するためにディレイを延長（1.1秒）
      await sleep(1100);

      const accessKey = process.env.RAKUTEN_ACCESS_KEY || '';
      const affiliateId = process.env.RAKUTEN_AFFILIATE_ID || '';

      // 楽天トラベル空室検索APIの呼び出し（2026年以降の新仕様）
      const apiEndpoint = `https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426`;
      let url = `${apiEndpoint}?applicationId=${appId}&accessKey=${accessKey}&format=json&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=1&roomNum=1&hotelNo=${hotel.rakutenId}`;
      if (affiliateId) {
        url += `&affiliateId=${affiliateId}`;
      }

      console.log(`[Rakuten API Request] Calling for ${hotel.name}`);
      console.log(`- appId: ${appId ? appId.substring(0, 8) + '...' : 'MISSING'}`);
      console.log(`- accessKey: ${accessKey ? accessKey.substring(0, 8) + '...' : 'MISSING'}`);
      console.log(`- affiliateId: ${affiliateId ? affiliateId.substring(0, 8) + '...' : 'MISSING'}`);

      try {
        const response = await fetch(url, {
          headers: {
            'Referer': 'https://nasumid-p.netlify.app/',
            'Origin': 'https://nasumid-p.netlify.app'
          }
        });
        if (!response.ok) {
          let errDetail = '';
          try {
            const errData = await response.json();
            errDetail = errData.error_description || errData.error || '';
          } catch (e) {}

          // 楽天API新仕様で「空室がない」場合は 404 (Data Not Found) が返るため、空室なしとして扱う
          if (response.status === 404 || errDetail === 'Data Not Found' || errDetail === 'NotFound') {
            results.push({
              id: hotel.id,
              name: hotel.name,
              rakutenId: hotel.rakutenId,
              url: hotel.url,
              status: 'unavailable',
              vacantCount: 0,
              price: null
            });
            continue;
          }

          throw new Error(`API error status: ${response.status}${errDetail ? ' (' + errDetail + ')' : ''}`);
        }
        const data = await response.json();

        if (data.error) {
          // 旧仕様またはその他のエラーレスポンスにおける空室なし判定
          if (data.error === 'not_found' || data.error_description === 'NotFound' || data.error === 'NotFound' || data.error === 'Data Not Found') {
            results.push({
              id: hotel.id,
              name: hotel.name,
              rakutenId: hotel.rakutenId,
              url: hotel.url,
              status: 'unavailable',
              vacantCount: 0,
              price: null
            });
            continue;
          }
          throw new Error(`API returned error: ${data.error_description || data.error}`);
        }

        // レスポンスのパース
        // 空室検索APIでヒットした場合、指定ホテルが配列で入る
        const hotelInfo = data.hotels && data.hotels.length > 0 ? data.hotels[0] : null;
        
        if (hotelInfo) {
          // 最低料金を取得
          let minCharge = null;
          const basicInfo = hotelInfo.hotel[0].hotelBasicInfo;
          
          // 空室検索APIでは通常、プランごとの料金情報が入る
          // 簡易的にbasicInfoから取得するか、または部屋情報配列から取得する
          const roomInfoArray = hotelInfo.hotel.slice(1);
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

          results.push({
            id: hotel.id,
            name: hotel.name,
            rakutenId: hotel.rakutenId,
            url: hotel.url,
            status: 'available',
            vacantCount: prices.length || 3,
            price: minCharge
          });
        } else {
          // ヒットしない場合は空室なし
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
      } catch (err) {
        console.warn(`Error searching hotel ${hotel.name} via Rakuten API:`, err.message);
        // APIエラー時の緩やかなフォールバック
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
