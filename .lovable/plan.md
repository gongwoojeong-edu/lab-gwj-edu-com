

## 목표

1. 학습 흐름 제어 — 구문 분석 → 한글 해석 입력 → 단어 테스트(POST) → Pass 기록
2. 우측 상단 `관용구` 버튼 제거 → 분석 메뉴 `기타` 항목 안으로 이동
3. 부배지 마우스 드래그로 좌우 수동 조절 + 새로고침 후에도 위치 유지
4. 형용사 분석 메뉴 하단에 `수식선 표시` 버튼 → 클릭 시 명사로 화살표 그리기
5. 모든 데이터(분석 결과, 해석, 테스트, 부배지 위치, 진행 상태)를 Supabase에 실시간 저장

이 작업은 Lovable Cloud(Supabase) 활성화가 필요합니다. 승인 시 자동으로 활성화됩니다.

---

## 1. 학습 흐름 — 분석 → 해석 → 단어 테스트 → Pass

### UI 흐름
문장 상단에 단계 진행 바 추가:
```
[1. 구문 분석] → [2. 한글 해석] → [3. 단어 테스트] → ✅ Pass
```

### Step 1: 구문 분석
- 기존 분석 화면 그대로
- 모든 owner가 `completed`이고 미저장 변경 0개일 때 "다음: 한글 해석" 버튼 활성

### Step 2: 한글 해석 입력
- 문장 아래 `Textarea` + `해석 제출` 버튼
- 제출 전엔 Step 3 버튼 잠금
- 제출 시 `sentence_translations` 테이블에 저장

### Step 3: 단어 테스트 (POST)
- 해당 문장의 분석 owner 중 `명사/동사/형용사/부사` 단어를 자동 추출
- 영단어 → 한글 의미 입력 카드 N개
- 80% 이상 정답 시 통과
- 결과를 `word_test_results`에 저장

### Step 4: Pass 기록
- 3단계 모두 완료 시 `sentence_progress` row의 `status='pass'`, `passed_at=now()` 업데이트
- 헤더에 `✅ Pass` 뱃지

### 신규 파일
- `src/components/learning/StepProgressBar.tsx`
- `src/components/learning/TranslationStep.tsx`
- `src/components/learning/WordTestStep.tsx`
- `src/lib/wordTestBuilder.ts` — 분석 결과에서 테스트 단어 추출

---

## 2. 관용구 버튼 → 분석 메뉴 `기타` 안으로

`src/pages/Index.tsx`
- 우측 상단 `📚 관용구 N` 버튼 + 다이얼로그 제거
- 본문 하단 toolbar `🟫 관용구` Popover 제거

`src/components/analyzer/AnalysisPanel.tsx`
- `EtcPanel` 안에 관용구 섹션 추가
  - 현재 선택 단어 → 관용구 등록/수정/삭제
  - `📚 등록된 관용구 보기` 토글 → 전체 목록 노출 + 점프
- props: `idiomEnabled`, `idiomExistingMeaning`, `onIdiomSave`, `onIdiomRemove`, `allIdioms`, `onJumpToIdiom`

---

## 3. 부배지 수동 드래그

`src/pages/Index.tsx`
- 부배지 pill에 `pointerdown / pointermove / pointerup` 핸들러 추가
- 좌우(±)만 이동, 상하 잠금, 최대 ±150px
- 더블클릭 시 `dx=0` 리셋
- 지우개 모드일 땐 드래그 비활성
- 적용: `style={{ transform: 'translateX({dx}px)' }}`

`src/index.css`
- `.sub-badge-pill { cursor: grab; touch-action: none; }`
- `.sub-badge-pill:active { cursor: grabbing; }`

저장: Supabase `badge_offsets` 테이블 (아래 5번)

---

## 4. 형용사 `수식선 표시` 버튼

`src/components/analyzer/AnalysisPanel.tsx` `AdjPanel`
- Layer 3 하단에 `🎯 수식선 표시` 버튼 추가
- 노출 조건: `adj.role`이 `명사수식 / 명사앞수식 / 명사뒤수식` 계열일 때 (`roleStatus`와 무관하게 노출)
- 클릭 → 부모에 `onStartModifierTarget(ownerId)` 전달 → 대상 명사 클릭 모드 진입 → 단어 클릭 시 화살표 생성

`src/pages/Index.tsx`
- 기존 `ArrowOverlay`가 modifier/referent 화살표를 이미 그리므로 트리거만 연결
- 화살표 데이터는 `modifier_relations`, `referent_relations` 테이블로 저장

---

## 5. Supabase 실시간 저장 (Lovable Cloud)

### 신규 테이블

#### `sentence_progress`
| 컬럼 | 타입 |
|---|---|
| id | uuid pk |
| user_id | uuid (auth.uid) |
| sentence_id | text |
| analysis_done | bool |
| translation_done | bool |
| word_test_done | bool |
| status | text ('in_progress' / 'pass') |
| passed_at | timestamptz |
| updated_at | timestamptz |

#### `owner_progress` (구문 분석 결과)
| 컬럼 | 타입 |
|---|---|
| id | uuid pk |
| user_id | uuid |
| sentence_id | text |
| owner_id | text |
| progress | jsonb (POS, form, role, status 등) |
| custom_answer | jsonb |
| completed | bool |
| updated_at | timestamptz |

#### `sentence_translations`
| user_id, sentence_id, text, submitted_at |

#### `word_test_results`
| user_id, sentence_id, items jsonb, score numeric, passed bool, taken_at |

#### `badge_offsets`
| user_id, sentence_id, owner_id, dx int |

#### `modifier_relations` / `referent_relations`
| user_id, sentence_id, source_owner_id, target_owner_id |

#### `idioms`
| user_id, sentence_id, indices int[], surface, meaning, created_at |

#### `user_sentences` (책장 — 추후 확장 대비)
| user_id, text, level, code, created_at |

### RLS
- 모든 테이블: `user_id = auth.uid()`만 select/insert/update/delete
- 인증 미사용 시(현재 비로그인) `user_id = null` 허용 정책 추가, 또는 익명 로그인 자동 활성

### 동기화 전략
- 기존 `localStorage` 유틸(`customAnswers.ts`, `idioms.ts`, `modifierTargets.ts`, `referentTargets.ts`) → Supabase 클라이언트로 교체
- 변경 시 `debounce 500ms`로 upsert
- 페이지 진입 시 `sentence_id` 기준 모든 관련 row 로드 → 메모리 hydration
- localStorage는 오프라인 캐시로만 유지 (선택)

### 신규 파일
- `src/integrations/supabase/storage.ts` — 위 7개 테이블 CRUD 래퍼
- `src/hooks/useSentenceSync.ts` — 마운트 시 로드 + 변경 시 debounced 저장

---

## 변경 파일 요약

신규
- `src/components/learning/StepProgressBar.tsx`
- `src/components/learning/TranslationStep.tsx`
- `src/components/learning/WordTestStep.tsx`
- `src/lib/wordTestBuilder.ts`
- `src/integrations/supabase/storage.ts`
- `src/hooks/useSentenceSync.ts`
- DB 마이그레이션 (위 7개 테이블 + RLS)

수정
- `src/pages/Index.tsx` — 학습 단계 통합, 관용구 버튼 제거, 부배지 드래그, Supabase hydration
- `src/components/analyzer/AnalysisPanel.tsx` — `EtcPanel`에 관용구, `AdjPanel`에 수식선 버튼
- `src/index.css` — grab 커서
- `src/lib/customAnswers.ts`, `idioms.ts`, `modifierTargets.ts`, `referentTargets.ts` — Supabase 래퍼로 위임

---

## 검증

1. 구문 분석 완료 → "한글 해석" 단계 활성, 미완 시 잠금
2. 해석 제출 → "단어 테스트" 단계 활성
3. 단어 테스트 80% 이상 → `Pass` 뱃지 + DB `status='pass'` 기록
4. 우측 상단 관용구 버튼 사라지고 분석 메뉴 `기타`에서 등록/조회 가능
5. `that has influenced` 부배지를 마우스로 끌면 좌우 이동, 새로고침 후 위치 유지
6. 형용사 명사수식 role 선택 시 하단 `🎯 수식선 표시` 버튼 노출, 클릭 → 명사 클릭 → 화살표 생성
7. 브라우저/PC 재시작 후에도 분석 결과, 해석, 테스트 결과, 화살표, 관용구, 부배지 위치 모두 복원

