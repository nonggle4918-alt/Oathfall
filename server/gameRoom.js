// GameRoom Durable Object — 방(룸) 하나 = 인스턴스 하나. 게임의 유일한 권위 있는 상태
// 저장소이자 유일하게 reduce()를 실제로 호출하는 곳이다. 클라이언트는 절대 자기 브라우저에서
// reduce()를 돌리지 않는다(온라인 모드에서는) — 여기서 나온 결과만 받는다.
//
// js/rules.js는 순수 모듈(브라우저 API 의존 없음)이라 그대로 import해서 쓴다 — 게임 규칙이
// 클라이언트/서버 두 곳에 따로 존재하며 어긋날 위험이 없다.

import { initGame, reduce, PLAYER_ORDER } from '../js/rules.js';
import { redactStateForViewer } from './redact.js';

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 비활성 시 정리

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function randomToken() {
  return crypto.randomUUID();
}

function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export class GameRoom {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'POST' && path === '/init') return await this.handleInit(request);
      if (request.method === 'POST' && path === '/join') return await this.handleJoin(request);
      if (request.method === 'GET' && path === '/state') return await this.handleState(url);
      if (request.method === 'POST' && path === '/action') return await this.handleAction(request);
      return jsonResponse({ error: 'not_found' }, { status: 404 });
    } catch (err) {
      return jsonResponse({ error: 'internal_error', message: String((err && err.message) || err) }, { status: 500 });
    }
  }

  async touchActivity() {
    const meta = await this.storage.get('meta');
    if (!meta) return;
    meta.lastActivityAt = Date.now();
    await this.storage.put('meta', meta);
    const alarm = await this.storage.getAlarm();
    if (alarm === null) await this.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  // 30일간 활동이 없으면 방 데이터를 완전히 지운다 (best-effort 정리, 정밀할 필요 없음).
  async alarm() {
    const meta = await this.storage.get('meta');
    if (!meta) return;
    if (Date.now() - meta.lastActivityAt >= ROOM_TTL_MS) {
      await this.storage.deleteAll();
    } else {
      await this.storage.setAlarm(meta.lastActivityAt + ROOM_TTL_MS);
    }
  }

  async handleInit(request) {
    const existing = await this.storage.get('meta');
    if (existing) return jsonResponse({ error: 'code_taken' }, { status: 409 });

    const body = await request.json();
    const race = body.race || 'kingdom';
    const roomCode = body.roomCode;
    const token = randomToken();
    const now = Date.now();

    await this.storage.put('meta', { roomCode, createdAt: now, lastActivityAt: now, status: 'waiting' });
    await this.storage.put('seats', { P1: { token, race, joinedAt: now }, P2: null });
    await this.storage.setAlarm(now + ROOM_TTL_MS);

    return jsonResponse({ roomCode, seat: 'P1', seatToken: token, status: 'waiting' }, { status: 201 });
  }

  async handleJoin(request) {
    const meta = await this.storage.get('meta');
    if (!meta) return jsonResponse({ error: 'not_found' }, { status: 404 });
    const seats = await this.storage.get('seats');
    if (seats.P2) return jsonResponse({ error: 'room_full' }, { status: 409 });
    if (meta.status !== 'waiting') return jsonResponse({ error: 'already_started' }, { status: 409 });

    const body = await request.json();
    const race = body.race || 'kingdom';
    const token = randomToken();
    const now = Date.now();
    seats.P2 = { token, race, joinedAt: now };
    await this.storage.put('seats', seats);

    const races = { P1: seats.P1.race, P2: race };
    const seed = randomSeed();
    const game = initGame(seed, { races, aiPlayers: [] });
    await this.storage.put('game', game);

    meta.status = 'playing';
    await this.storage.put('meta', meta);
    await this.touchActivity();

    return jsonResponse({
      roomCode: meta.roomCode, seat: 'P2', seatToken: token, status: 'playing',
      state: redactStateForViewer(game, 'P2'),
    });
  }

  async handleState(url) {
    const seat = url.searchParams.get('seat');
    const token = url.searchParams.get('token');
    const auth = await this.authenticate(seat, token);
    if (auth.error) return jsonResponse({ error: auth.error }, { status: auth.status });

    const meta = await this.storage.get('meta');
    if (meta.status === 'waiting') {
      return jsonResponse({ roomCode: meta.roomCode, seat, status: 'waiting' });
    }
    const game = await this.storage.get('game');
    await this.touchActivity();
    return jsonResponse({ roomCode: meta.roomCode, seat, status: meta.status, state: redactStateForViewer(game, seat) });
  }

  async handleAction(request) {
    const body = await request.json();
    const { seat, token, action } = body;
    const auth = await this.authenticate(seat, token);
    if (auth.error) return jsonResponse({ error: auth.error }, { status: auth.status });

    const meta = await this.storage.get('meta');
    if (meta.status !== 'playing') return jsonResponse({ error: 'not_playing' }, { status: 409 });

    let game = await this.storage.get('game');
    if (game.phase === 'ended') return jsonResponse({ error: 'game_ended' }, { status: 409 });
    if (!action || typeof action.type !== 'string') return jsonResponse({ error: 'bad_request' }, { status: 400 });
    if (game.activePlayer !== seat) return jsonResponse({ error: 'not_your_turn' }, { status: 409 });

    // 서버가 실제 행위자를 강제한다 — 클라이언트가 보낸 action.player는 절대 신뢰하지 않는다.
    // (토큰이 P1의 것이면 action.player가 뭐라고 적혀 있든 무조건 'P1'으로 실행된다.)
    const safeAction = { ...action, player: seat };
    game = reduce(game, safeAction);
    await this.storage.put('game', game);
    await this.touchActivity();

    return jsonResponse({ roomCode: meta.roomCode, seat, status: meta.status, state: redactStateForViewer(game, seat) });
  }

  async authenticate(seat, token) {
    if (!seat || !token || !PLAYER_ORDER.includes(seat)) return { error: 'bad_request', status: 400 };
    const meta = await this.storage.get('meta');
    if (!meta) return { error: 'not_found', status: 404 };
    const seats = await this.storage.get('seats');
    const seatInfo = seats[seat];
    if (!seatInfo || seatInfo.token !== token) return { error: 'forbidden', status: 403 };
    return { ok: true };
  }
}
