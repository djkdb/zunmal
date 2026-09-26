/**
 * 기록 옮기기 코드 — 저장 데이터 전체를 한 줄 문자열로 바꾸고 되돌린다. (순수 모듈)
 *
 * 형식: `MALANG1.<payload>.<checksum>`
 *  - payload  = base64url(UTF-8 JSON { v: 저장 버전, s: 저장 상태 })
 *  - checksum = payload의 FNV-1a 32비트 (16진수 8자리) — 복사하다 잘리거나 바뀐 코드를 거른다
 * 불러오기는 항상 migrateSave(→ sanitizeSave)를 거치므로 예전 버전 코드도, 손본 코드도 안전하게 들어온다.
 * 저장 스키마(SAVE_VERSION)와는 따로인 층이라 스키마가 바뀌어도 이 형식은 그대로다.
 */
import { SAVE_VERSION, migrateSave, type SaveData } from './persistence';

export const SAVE_CODE_PREFIX = 'MALANG1';

export type DecodeResult =
  | { ok: true; save: SaveData; version: number }
  | { ok: false; reason: 'format' | 'checksum' | 'empty' };

/** FNV-1a 32비트 해시 (16진수 8자리) */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** 저장 상태(+버전)를 기록 코드로 */
export function encodeSaveCode(state: unknown, version: number = SAVE_VERSION): string {
  const payload = toBase64Url(JSON.stringify({ v: version, s: state }));
  return `${SAVE_CODE_PREFIX}.${payload}.${checksum(payload)}`;
}

/**
 * localStorage에 들어 있는 zustand persist 문자열({ state, version })을 그대로 코드로.
 * 스토어를 거치지 않아 화면이 깨졌을 때(오류 화면)에도 쓸 수 있다. 읽을 수 없으면 null.
 */
export function encodePersistedSave(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { state, version } = parsed as { state?: unknown; version?: unknown };
    if (typeof state !== 'object' || state === null) return null;
    return encodeSaveCode(state, typeof version === 'number' && Number.isFinite(version) ? version : 0);
  } catch {
    return null;
  }
}

/**
 * 기록 코드를 저장 데이터로. 어떤 입력에도 throw하지 않는다.
 * 메신저가 넣은 줄바꿈·공백은 무시한다. 말랑이가 한 마리도 없는 기록은 받지 않는다.
 */
export function decodeSaveCode(code: string, now: Date = new Date()): DecodeResult {
  const compact = code.replace(/\s+/g, '');
  const parts = compact.split('.');
  if (parts.length !== 3 || parts[0] !== SAVE_CODE_PREFIX) return { ok: false, reason: 'format' };
  const payload = parts[1] ?? '';
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return { ok: false, reason: 'format' };
  if (checksum(payload) !== parts[2]?.toLowerCase()) return { ok: false, reason: 'checksum' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'format' };
  const { v, s } = parsed as { v?: unknown; s?: unknown };
  const version = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  const save = migrateSave(s, version, now);
  if (Object.keys(save.ownedMalangs).length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, save, version };
}
