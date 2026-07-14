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

  let targetUrl = '';
  try {
    if (event.body) {
      targetUrl = JSON.parse(event.body).targetUrl;
    }
  } catch(e) {}
  if (!targetUrl && event.queryStringParameters) {
    targetUrl = event.queryStringParameters.url;
  }

  if (!targetUrl) {
    return { 
      statusCode: 400, 
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Missing URL parameter' 
    };
  }
  
  try {
    // 楽天トラベルへのアクセス。User-Agentを偽装してブロックを防ぐ
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });
    
    if (!response.ok) {
      return { 
        statusCode: response.status, 
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'Target fetch failed: ' + response.statusText 
      };
    }
    
    const data = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: data
    };
  } catch (error) {
    return { 
      statusCode: 500, 
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Server Error: ' + error.toString() 
    };
  }
}
