addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    // /redirect/ パス：対象のURLにリダイレクト
    if (url.pathname.startsWith('/redirect/')) {
      let targetUrl = url.pathname.slice(10);

      // クエリパラメータも残す
      if (url.search) {
        targetUrl += url.search;
      }

      return Response.redirect(targetUrl, 302);
    }

    // / にアクセスが来た場合：簡易説明
    if (url.pathname === '/') {
      return new Response(`Usage:\n  ${url.origin}/<url>`);
    }

    // CORS対応（プリフライト要求への応答）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Notion-Version',
        }
      });
    }

    // リクエストヘッダーを複製
    const headers = new Headers(request.headers);

    // 転送先のURLを構築
    const proxyTargetUrl = request.url.replace(`${url.origin}/`, '');
    const parsedTargetUrl = new URL(proxyTargetUrl);

    // Notion APIの場合は Notion-Version を必ず付与
    if (parsedTargetUrl.hostname === 'api.notion.com' && !headers.has('Notion-Version')) {
      headers.set('Notion-Version', '2022-06-28');
    }

    // body の書き換え対象か確認
    let modifiedBody = request.body;

    if (
      parsedTargetUrl.hostname === 'api.notion.com' &&
      parsedTargetUrl.pathname.match(/^\/v1\/databases\/[^/]+\/query$/) &&
      request.method === 'POST'
    ) {
      const rawBody = await request.text();
      let json;

      try {
        json = rawBody ? JSON.parse(rawBody) : {};
      } catch (e) {
        json = {};
      }

      // 強制的に page_size を 30 に設定
      json.page_size = 30;

      // start_cursor があれば残す（GPTs側が送ってきたもの）
      modifiedBody = JSON.stringify(json);
    }

    // Notion APIに転送
    let response = await fetch(proxyTargetUrl, {
      method: request.method,
      headers: headers,
      redirect: 'follow',
      body: modifiedBody
    });

    // CORSヘッダーを追加
    response = new Response(response.body, response);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Accept, Authorization, Content-Type, Notion-Version');

    return response;

  } catch (e) {
    return new Response(e.stack || e.toString(), { status: 500 });
  }
}
