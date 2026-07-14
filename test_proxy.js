const fs = require('fs');

async function testFetch() {
  const targetUrl = 'https://search.travel.rakuten.co.jp/ds/vacant/searchVacant?f_hyoji=3&f_flg=vacant&f_otona_su=1&f_heya_su=1&f_nen1=2026&f_tuki1=07&f_hi1=15&f_no=186255';
  console.log("Fetching:", targetUrl);
  
  const res = await fetch('https://nasumid-p.netlify.app/.netlify/functions/rakutenProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl })
  });
  
  const html = await res.text();
  console.log("HTML Length:", html.length);
  
  // 抽出テスト
  const cleanHtml = html.replace(/<select[\s\S]*?<\/select>/gi, '');
  const priceRegex = /([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{3,})\s*円/g;
  const prices = [];
  let m;
  while ((m = priceRegex.exec(cleanHtml)) !== null) {
    const val = parseInt(m[1].replace(/,/g, ''), 10);
    if (val >= 3500 && val < 100000) {
      prices.push(val);
    }
  }
  console.log("Extracted prices:", prices);
  if (prices.length > 0) {
    console.log("Min price:", Math.min(...prices));
  } else {
    console.log("No prices found.");
    
    // totalResultsの確認
    const match = html.match(/"totalResults":\[(\d+)\]/);
    console.log("totalResults match:", match ? match[1] : "Not found");
  }
}

testFetch();
