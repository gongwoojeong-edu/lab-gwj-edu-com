
# 회독(Round) 모델 구현 + 임포트 시 한글해석 저장

## 배경
- 지금은 학습 진도가 `(user_id, sentence_id)` 전역 키. 재출제해도 이전 pass가 그대로 붙어 "이어하기"가 사라지는 문제(홍예지·황준서 사례).
- 재출제는 "회독(round)" — 이전 이력은 학습결과에 그대로 보존, 새 회독은 백지에서 다시.
- 별도로: 신텍스스튜디오 CSV에 한글해석이 있는데 임포트가 AI로 다시 생성하는 낭비 → CSV 값을 우선 사용.

## 1. 회독(Round) 모델

### 1-1. 스키마 (마이그레이션)
- `assignments.round_no INT NOT NULL DEFAULT 1` 추가.  
  - 같은 (student_id, unit_id, task_mode) 재출제 시 서버에서 `max(round_no)+1` 자동 부여.
- `sentence_progress`에 `assignment_id UUID NULL` 추가 + 인덱스.  
  - 기존 유니크 `(user_id, sentence_id)` → `(user_id, sentence_id, COALESCE(assignment_id, '00000000-...'))` 로 교체 (부분 유니크 인덱스 2개로 구현: 회독 전용 + 레거시 전역용).
  - 기존 행은 `assignment_id = NULL`로 남겨 "0회독(레거시)" 취급.
- `sentence_attempt_logs.assignment_id UUID NULL` 추가 + 인덱스.
- `sentence_approvals.assignment_id UUID NULL` 추가 + 인덱스.
- 세 컬럼 모두 FK: `REFERENCES assignments(id) ON DELETE SET NULL`.

### 1-2. 진도 기록/조회 (핵심 로직)
- 학습 시작·저장 시 항상 현재 활성 assignment_id를 파라미터로 받아 진도/로그/승인에 함께 기록.
- "다음 문장/이어하기" 계산:
  - assignment_id 스코프로 `sentence_progress`를 조회 → 해당 회독 내에서만 done/미완 판단.
  - `assignmentSequenceKey`는 그대로 두되(같은 제목·교재는 한 트랙), 그룹 내부 done 판정은 `(assignment_id, sentence_id)`로.
- 승인/보류/재학습 요청도 assignment_id 스코프로 필터 → 이전 회독의 pass가 현재 회독에 영향 없음.

### 1-3. 교사 UI
- 재출제 버튼: "재출제(N회독)" 라벨로 표시. 리스트 카드 우측에 `2회독`, `3회독` 뱃지.
- 학습결과/보류 목록: 회독별로 카드가 분리되어 나열(제목 뒤 `· 2회독`).
- 진도바/문장 카운트: 이미 회독별 assignment 단위이므로 자연히 회독 단위 표기.

### 1-4. 학생 UI
- 홈 카드도 회독별 분리(같은 제목이라도 다른 회독은 별개 카드).
- 카드 라벨: `공통영어2 김은형 1과 유닛1 · 2회독 (0/2)`, 이어하기 버튼 정상 노출.

### 1-5. 마이그레이션 전략
- 기존 데이터는 그대로 유지(assignment_id NULL = 레거시 1회독).
- 신규 학습부터 assignment_id가 채워짐.
- 홍예지의 오늘자 재출제 2건: 마이그레이션 배포 직후 그 두 assignment_id로 진도가 백지 상태가 되어 곧바로 학습 재개 가능(과거 pass는 학습결과에 유지).

### 1-6. 롤백 안전장치
- 컬럼 추가는 NULL 허용 + FK ON DELETE SET NULL → 실패 시 컬럼만 드롭하면 원복.

## 2. 신텍스스튜디오 임포트: 한글해석 우선 사용
- 임포트 엣지 함수(`admin-import-textbook` 계열):
  - CSV 파서에서 한글 컬럼 후보 인식(`korean`, `한글해석`, `translation`, `해석` 등 — 최종 컬럼명 확인 후 확정).
  - 값이 있으면:
    - `textbook_passages.korean`에 저장
    - `sentence_translations`에 `source='syntax'`(신규 값) ref 번역으로 upsert
  - 값이 비어있는 행만 기존 AI 번역 폴백 실행.
- 이미 임포트된 유닛에 대한 "한글해석 재적용" 관리 액션 하나 추가(선택): 최근 임포트 원본 CSV로 소급 채움.

## 실행 순서
1. (1-1) 스키마 마이그레이션 승인·적용.
2. (1-2) 진도/이어하기/승인 로직 assignment_id 스코프로 교체.
3. (1-3, 1-4) 교사·학생 UI 회독 라벨/카드 분리.
4. 홍예지·황준서 케이스로 검증.
5. (2) CSV 컬럼명 확정 후 임포트 함수 개선.

## 결정 필요
- (a) 위 순서대로 진행 OK?  
- (b) CSV 한글해석 컬럼명 (예시: `korean` / `한글해석` / `translation` 중 무엇인지) — 샘플 CSV 헤더 한 줄만 알려주시면 확정하겠습니다.
