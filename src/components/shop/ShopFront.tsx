import type { Character } from '../../data/characters';
import { Malang } from '../Malang';
import { Awning } from './Awning';

export interface ShopFrontStaff {
  character: Character;
  shiny: boolean;
}

/** 직원마다 하는 일 (자리 순서대로 돌아가며) */
const ROLES = ['wipe', 'tray', 'hop'] as const;
type Role = (typeof ROLES)[number];

function staffSize(count: number): number {
  if (count <= 1) return 128;
  if (count <= 3) return 90;
  return 64;
}

/**
 * 코드로 그린 디저트 가게 앞모습: (간판은 화면 제목 h1 이 위에 걸린다) + 딸기우유 줄무늬 차양 + 옅은 하늘 가게 안(선반의 병)
 * + 카운터 뒤에 선 직원 말랑이(행주질·쟁반·통통) + 흰 카운터와 디저트 유리 진열장.
 * 말랑이는 DOM(<Malang>)이라 뒤 그림과 카운터 그림 사이에 끼운다. 움직임 줄이기면 모두 가만히.
 */
export function ShopFront({ staff, reduced }: { staff: ShopFrontStaff[]; reduced: boolean }) {
  const size = staffSize(staff.length);
  return (
    <div className="shop-front" aria-hidden="true">
      <svg className="shop-front__back" viewBox="0 0 360 320" focusable="false">
        {/* 가게 벽 */}
        <rect x="10" y="40" width="340" height="276" rx="22" fill="#ffffff" />
        <rect x="24" y="84" width="312" height="170" rx="14" fill="#dcebff" />
        {/* 뒤 선반 + 사탕 병 */}
        <rect x="40" y="158" width="280" height="6" rx="3" fill="#ffffff" />
        <g>
          <rect x="56" y="132" width="22" height="26" rx="7" fill="rgba(255,255,255,0.75)" />
          <circle cx="63" cy="150" r="3.5" fill="#ff9fb8" />
          <circle cx="71" cy="148" r="3.5" fill="#ffd66b" />
          <circle cx="66" cy="142" r="3.5" fill="#9fe0b8" />
          <rect x="59" y="128" width="16" height="5" rx="2" fill="#ffc4d3" />
        </g>
        <g>
          <rect x="282" y="134" width="24" height="24" rx="8" fill="rgba(255,255,255,0.75)" />
          <circle cx="290" cy="150" r="3.5" fill="#c9b6ff" />
          <circle cx="298" cy="149" r="3.5" fill="#8fc3ff" />
          <circle cx="294" cy="142" r="3.5" fill="#ffc2a0" />
          <rect x="285" y="130" width="18" height="5" rx="2" fill="#9fe0b8" />
        </g>
        {/* 둥근 창 두 개 — 하늘이 보인다 */}
        <circle cx="120" cy="140" r="13" fill="#eaf4ff" />
        <circle cx="240" cy="140" r="13" fill="#eaf4ff" />
        <path d="M110 144 q4 -5 9 -2 q3 -4 8 -1" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M232 138 q4 -4 8 -1 q4 -3 8 1" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>

      <Awning stripes={12} className="shop-front__awning" />

      <ul className={`shop-front__staff shop-front__staff--${Math.min(staff.length, 5)}`}>
        {staff.map((s, i) => {
          const role: Role = ROLES[i % ROLES.length] ?? 'hop';
          return (
            <li key={s.character.id} className={`shop-front__member is-${role}`} style={{ ['--i' as string]: i }}>
              <span className="shop-front__body">
                {role === 'tray' && (
                  <svg className="shop-front__tray" viewBox="0 0 40 22" focusable="false">
                    <ellipse cx="20" cy="19" rx="18" ry="3" fill="#ffffff" stroke="#c3cddb" strokeWidth="1.2" />
                    <path d="M13 17 l2 -7 h10 l2 7 Z" fill="#ffc2a0" />
                    <circle cx="20" cy="8" r="6" fill="#ffe3ec" />
                    <circle cx="20" cy="2.8" r="2.2" fill="#f0506e" />
                  </svg>
                )}
                <Malang
                  character={s.character}
                  size={size}
                  animation={reduced ? 'none' : 'idle'}
                  blink
                  shiny={s.shiny}
                  decorative
                />
              </span>
              {role === 'wipe' && <span className="shop-front__cloth" />}
            </li>
          );
        })}
      </ul>

      <svg className="shop-front__counter" viewBox="0 0 360 100" focusable="false">
        {/* 카운터 윗판 + 앞면 */}
        <rect x="0" y="6" width="360" height="94" rx="16" fill="#f3f8fe" />
        <rect x="0" y="0" width="360" height="16" rx="8" fill="#ffffff" />
        {/* 유리 진열장 */}
        <rect x="70" y="26" width="220" height="64" rx="12" fill="#ffffff" />
        <rect x="76" y="31" width="208" height="54" rx="9" fill="#eaf4ff" />
        <rect x="80" y="57" width="200" height="3" rx="1.5" fill="#ffffff" />
        {/* 윗칸: 컵케이크 · 마카롱 · 딸기 조각 케이크 */}
        <g>
          <path d="M96 55 l2 -10 h14 l2 10 Z" fill="#ffc2a0" />
          <circle cx="105" cy="42" r="7.5" fill="#ffe3ec" />
          <circle cx="105" cy="35" r="2.6" fill="#f0506e" />
        </g>
        <g>
          <ellipse cx="140" cy="52" rx="9" ry="3.6" fill="#9fe0b8" />
          <ellipse cx="140" cy="48.5" rx="8" ry="1.6" fill="#ffffff" />
          <ellipse cx="140" cy="45" rx="9" ry="3.6" fill="#9fe0b8" />
          <ellipse cx="160" cy="52" rx="9" ry="3.6" fill="#c9b6ff" />
          <ellipse cx="160" cy="48.5" rx="8" ry="1.6" fill="#ffffff" />
          <ellipse cx="160" cy="45" rx="9" ry="3.6" fill="#c9b6ff" />
        </g>
        <g>
          <path d="M190 55 v-14 l30 6 v8 Z" fill="#ffffff" stroke="#e3edf8" strokeWidth="1" />
          <path d="M190 49 l30 3" stroke="#ff9fb8" strokeWidth="3" />
          <path d="M197 40 q2 -6 6 -1 q-2 3 -6 1 Z" fill="#f0506e" />
        </g>
        <g>
          <path d="M238 55 l3 -11 h14 l3 11 Z" fill="#ffd66b" />
          <path d="M241 44 h14 l-1 -3 h-12 Z" fill="#b8712a" />
        </g>
        {/* 아랫칸: 동글 쿠키 줄 */}
        {[98, 122, 146, 170, 194, 218, 242, 266].map((x, i) => (
          <circle key={x} cx={x} cy="74" r="7" fill={['#ffc4d3', '#ffe597', '#bfeccf', '#d9ccff'][i % 4]} />
        ))}
        {/* 유리 반사 */}
        <path d="M92 33 l-12 48 M104 33 l-12 48" stroke="rgba(255,255,255,0.8)" strokeWidth="3" />
      </svg>
    </div>
  );
}
