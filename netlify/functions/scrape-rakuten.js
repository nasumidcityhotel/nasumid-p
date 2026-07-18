// Node.js 18+ のグローバル fetch を使用するため node-fetch は不要です

const WORKING_APP_ID = process.env.RAKUTEN_APP_ID || process.env.RAKUTEN_APPLICATION_ID || '057c911b-bec4-48af-8981-a94fc4f83c01';
const WORKING_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || 'pk_ZLMBkyngWXsxZW7vyXskGPqKXis7RWMHjTY373SAuEv';
const affiliateId = process.env.RAKUTEN_AFFILIATE_ID || '55c8d52a.2cf28d81.55c8d52b.fd1c1360';
const apiEndpoint = 'https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426';

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

  let body = {};
  try {
    if (event.body) {
      body = JSON.parse(event.body);
    }
  } catch (e) {}

  const rakutenId = body.rakutenId || event.queryStringParameters?.rakutenId;
  const year = body.year || event.queryStringParameters?.year;
  const month = body.month || event.queryStringParameters?.month;
  const day = body.day || event.queryStringParameters?.day;

  if (!rakutenId || !year || !month || !day) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing parameters: rakutenId, year, month, day are required' })
    };
  }

  const checkinDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  const coDate = new Date(year, month - 1, parseInt(day) + 1);
  const checkoutDateStr = `${coDate.getFullYear()}-${String(coDate.getMonth() + 1).padStart(2, '0')}-${String(coDate.getDate()).padStart(2, '0')}`;

  const adultNum = 2; // デフォルト2名1室設定

  const url = `${apiEndpoint}?applicationId=${WORKING_APP_ID}&accessKey=${WORKING_ACCESS_KEY}&format=json&hotelNo=${rakutenId}&checkinDate=${checkinDateStr}&checkoutDate=${checkoutDateStr}&adultNum=${adultNum}&searchPattern=1&hits=30&affiliateId=${affiliateId}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Referer': 'https://nasumid-p.netlify.app/',
        'Origin': 'https://nasumid-p.netlify.app'
      }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Rakuten API Error', details: errText })
      };
    }

    const data = await resp.json();
    let status = 'unavailable';
    let vacantCount = 0;
    let actualLowestPrice = null;

    if (data.hotels && data.hotels.length > 0) {
      const hotelData = data.hotels[0].hotel;
      
      const prices = [];
      hotelData.forEach(el => {
        if (el.roomInfo) {
          const dc = el.roomInfo.find(innerEl => innerEl.dailyCharge);
          const price = dc && dc.dailyCharge
            ? (dc.dailyCharge.total || dc.dailyCharge.rakutenCharge || 0)
            : 0;
          if (price > 0) prices.push(price);
        }
      });

      vacantCount = prices.length;
      if (vacantCount > 0) {
        status = 'available';
        actualLowestPrice = Math.min(...prices);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status,
        vacantCount,
        actualLowestPrice
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server Error', details: error.toString() })
    };
  }
};
