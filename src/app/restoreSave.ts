/**
 * 스토어가 localStorage를 읽기 전에 실행되어야 하는 부수 효과 모듈.
 * main.tsx에서 App보다 먼저 import한다 (ES 모듈은 import 순서대로 평가된다).
 * 원래 저장이 지워졌거나 깨졌으면 백업(sessionStorage / .bak 키)으로 되돌린다.
 */
import { browserStores, restoreSaveIfMissing } from '../lib/saveBackup';
import { SAVE_KEY } from '../store/persistence';

restoreSaveIfMissing(SAVE_KEY, browserStores());
