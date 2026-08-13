// 온라인 멀티플레이 서버(server/)와 통신하는 얇은 fetch 래퍼.
// 세션({roomCode, seat, seatToken})은 localStorage에 저장해서 새로고침해도 내 시트를
// 잃지 않는다. 이 모듈은 게임 로직을 전혀 모른다 — main.js가 받은 state를 그대로 쓴다.

import { WORKER_BASE_URL } from './config.js';

const SESSION_KEY = 'oathfall_online_session';

class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession() {
  return loadSession();
}

async function request(method, path, body) {
  let resp;
  try {
    resp = await fetch(WORKER_BASE_URL + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, 'network_error', '서버에 연결할 수 없습니다.');
  }
  let data = null;
  try {
    data = await resp.json();
  } catch {
    // 빈 응답(예: OPTIONS)은 무시
  }
  if (!resp.ok) {
    throw new ApiError(resp.status, data && data.error, data && data.message);
  }
  return data;
}

export async function createRoom(race) {
  const data = await request('POST', '/rooms', { race });
  saveSession({ roomCode: data.roomCode, seat: data.seat, seatToken: data.seatToken });
  return data;
}

export async function joinRoom(roomCode, race) {
  const data = await request('POST', `/rooms/${roomCode}/join`, { race });
  saveSession({ roomCode: data.roomCode, seat: data.seat, seatToken: data.seatToken });
  return data;
}

export async function fetchState() {
  const session = loadSession();
  if (!session) throw new ApiError(0, 'no_session', '온라인 세션이 없습니다.');
  const { roomCode, seat, seatToken } = session;
  return request('GET', `/rooms/${roomCode}/state?seat=${seat}&token=${encodeURIComponent(seatToken)}`);
}

export async function submitAction(action) {
  const session = loadSession();
  if (!session) throw new ApiError(0, 'no_session', '온라인 세션이 없습니다.');
  const { roomCode, seat, seatToken } = session;
  return request('POST', `/rooms/${roomCode}/action`, { seat, token: seatToken, action });
}

export function shareLinkFor(roomCode) {
  const url = new URL(window.location.href);
  url.search = `?join=${roomCode}`;
  return url.toString();
}
