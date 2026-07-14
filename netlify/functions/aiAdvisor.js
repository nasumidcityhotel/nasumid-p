exports.handler = async function(event, context) {
  // CORS プリフライト対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' })
    };
  }

  try {
    const { marketData } = JSON.parse(event.body);

    // 1. 口コミデータの簡易スクレイピング (東横インとルートインを対象)
    let reviewsText = "";
    const targetHotels = [
      { id: '186255', name: '東横イン那須塩原駅西口' },
      { id: '27988', name: 'ルートイン西那須野' }
    ];

    for (const h of targetHotels) {
      try {
        const revRes = await fetch(`https://travel.rakuten.co.jp/HOTEL/${h.id}/review.html`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (revRes.ok) {
          const html = await revRes.text();
          // コメント部分らしいテキストを簡易抽出（タグを除去し、長めの日本語文を抽出）
          const cleanText = html.replace(/<[^>]*>?/gm, ' ');
          const sentences = cleanText.split(' ').map(s => s.trim()).filter(s => s.length > 30 && s.length < 500);
          // 上位10件程度を採用
          const sampleReviews = sentences.slice(0, 10).join('\n- ');
          if (sampleReviews) {
            reviewsText += `\n【${h.name}の最近の口コミ（抜粋）】\n- ${sampleReviews}\n`;
          }
        }
      } catch (e) {
        console.warn(`Review fetch failed for ${h.name}:`, e);
      }
    }

    if (!reviewsText) {
      reviewsText = "（口コミデータの取得に失敗しました。市場データのみで推論してください。）";
    }

    // 2. プロンプトの構築
    const prompt = `
あなたは有能なホテルのレベニューマネージャー兼マーケターです。
以下の現在の市場データ（指定日の競合ホテルの価格・空室状況）と、競合ホテルの最近の口コミデータを分析し、那須ミッドシティホテルの担当者に向けて以下の2点を提案してください。

■ データ
【対象日と市場サマリー】
${JSON.stringify(marketData.summary, null, 2)}

【各ホテルの状況】
${JSON.stringify(marketData.hotels.map(h => ({ name: h.hotelName, status: h.status, price: h.lowestPrice, priceChange: h.priceDifference })), null, 2)}

【競合ホテルの口コミトレンド】
${reviewsText}

■ 指示
以下の見出し構成で、マークダウン形式で分かりやすく出力してください。

### 📊 価格戦略アドバイス
現在の市場ひっ迫度や競合の最安値、前回調査時からの価格変動を加味して、那須ミッドシティホテルの明日の最適な販売価格（具体的な金額）と、その明確な理由を提案してください。

### 💡 顧客トレンドとアピールポイント
抽出された口コミから、今の時期にお客様がエリアのホテルに何を求めているか（温泉、朝食の質、立地など）のトレンドを分析し、自社ホテルの強みをどうアピールすべきか、またはどんなプランが売れそうかを提案してください。
`;

    // 3. Gemini API 呼び出し
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Gemini API Error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const adviceText = aiData.candidates[0].content.parts[0].text;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ advice: adviceText })
    };

  } catch (error) {
    console.error('AI Advisor Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
}
