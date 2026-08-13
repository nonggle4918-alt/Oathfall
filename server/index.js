// Worker 진입점 — 라우팅 + CORS만 담당한다. 실제 게임 로직/저장은 전부 GameRoom
// Durable Object(gameRoom.js)에 있다. 룸 코드가 곧 DO 인스턴스의 이름이라
// 별도의 룸 조회 테이블이 필요 없다 (env.GAME_ROOM.idFromName(roomCode)).

import { GameRoom } from './gameRoom.js';

export { GameRoom };

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O/1/I/L 제외
const ROOM_CODE_LEN = 6;
const MAX_CODE_RETRIES = 5;

function randomRoomCode() {
  const buf = new Uint32Array(ROOM_CODE_LEN);
  crypto.getRandomValues(buf);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) code += ROOM_CODE_CHARS[buf[i] % ROOM_CODE_CHARS.length];
  return code;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN;
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (allowed === '*' || (origin && origin === allowed)) {
    headers['Access-Control-Allow-Origin'] = origin || allowed;
  }
  return headers;
}

function withCors(response, env, request) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env, request))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), env, request);
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // POST /rooms — 새 방 생성 (P1으로 참가)
      if (request.method === 'POST' && parts.length === 1 && parts[0] === 'rooms') {
        const body = await request.json().catch(() => ({}));
        let lastResp = null;
        for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
          const roomCode = randomRoomCode();
          const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
          const resp = await stub.fetch('https://do/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ race: body.race, roomCode }),
          });
          if (resp.status !== 409) return withCors(resp, env, request);
          lastResp = resp;
        }
        return withCors(lastResp, env, request);
      }

      // /rooms/:code/{join,state,action}
      if (parts[0] === 'rooms' && parts.length >= 2) {
        const roomCode = parts[1];
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
        const sub = parts[2];

        if (request.method === 'POST' && sub === 'join') {
          const body = await request.text();
          const resp = await stub.fetch('https://do/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          return withCors(resp, env, request);
        }
        if (request.method === 'GET' && sub === 'state') {
          const resp = await stub.fetch('https://do/state' + url.search);
          return withCors(resp, env, request);
        }
        if (request.method === 'POST' && sub === 'action') {
          const body = await request.text();
          const resp = await stub.fetch('https://do/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          return withCors(resp, env, request);
        }
      }

      return withCors(jsonResponse({ error: 'not_found' }, { status: 404 }), env, request);
    } catch (err) {
      return withCors(jsonResponse({ error: 'internal_error', message: String((err && err.message) || err) }, { status: 500 }), env, request);
    }
  },
};
