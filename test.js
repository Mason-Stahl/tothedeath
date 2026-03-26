const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname; // /api/kv/:key  or  /api/list

    // LIST  GET /api/list?prefix=game:
    if (path === '/api/list' && request.method === 'GET') {
      const prefix = url.searchParams.get('prefix') || '';
      const result = await env.STORE.list({ prefix });
      const keys = result.keys.map(k => k.name);
      return new Response(JSON.stringify({ keys }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // GET  /api/kv/:key
    if (path.startsWith('/api/kv/') && request.method === 'GET') {
      const key = decodeURIComponent(path.slice('/api/kv/'.length));
      const value = await env.STORE.get(key);
      return new Response(JSON.stringify({ value }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // PUT  /api/kv/:key
    if (path.startsWith('/api/kv/') && request.method === 'PUT') {
      const key = decodeURIComponent(path.slice('/api/kv/'.length));
      const { value } = await request.json();
      await env.STORE.put(key, value);
      return new Response('ok', { headers: CORS });
    }

    // DELETE  /api/kv/:key
    if (path.startsWith('/api/kv/') && request.method === 'DELETE') {
      const key = decodeURIComponent(path.slice('/api/kv/'.length));
      await env.STORE.delete(key);
      return new Response('ok', { headers: CORS });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
