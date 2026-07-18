// Node.js 18+ のグローバル fetch を使用するため node-fetch は不要です

// 対象競合ホテル定義
const COMPETITOR_HOTELS = [
  { id: 'toyoko_nasushiobara', name: '東横イン那須塩原駅西口', rakutenId: '186255', basePrice: 7200 },
  { id: 'routein_nishinasuno', name: 'ルートイン西那須野', rakutenId: '27988', basePrice: 7800 },
  { id: 'routein_2nd_nishinasuno', name: 'ルートイン第２西那須野', rakutenId: '143534', basePrice: 7400 },
  { id: 'north_in', name: 'ビジネスホテル那須高原ノースイン', rakutenId: '181673', basePrice: 6500 },
  { id: 'station_hotel', name: '那須塩原ステーションホテル', rakutenId: '28612', basePrice: 6800 },
  { id: 'nasu_marronnier', name: '那須マロニエホテル', rakutenId: '163533', basePrice: 8500 }
];

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

  // チェックアウト日の計算 (チェックイン日 + 1日)
  const checkinDate = new Date(checkinDateStr);
  const checkoutDate = new Date(checkinDate.getTime() + 24 * 60 * 60 * 1000);
  const checkoutDateStr = checkoutDate.toISOString().slice(0, 10);

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
        status,
        vacantCount,
        price: actualPrice
      });
    } else {
      // 楽天トラベル空室検索APIの呼び出し
      const apiEndpoint = `https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426`;
      const url = `${apiEndpoint}?applicationId=${appId}&format=json&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=1&roomNum=1&hotelNo=${hotel.rakutenId}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API error status: ${response.status}`);
        }
        const data = await response.json();

        if (data.error) {
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
          status: 'unknown',
          vacantCount: 0,
          price: null
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
