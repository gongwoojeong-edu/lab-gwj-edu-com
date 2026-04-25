## 진단 요약

스크린샷의 김재원 카드에서 **L08-U260339-001~007** 7건은 진짜 지문이고, 그 아래 별도 그룹으로 떠 있는 **`L08-U260339-005__remediation_1`** / **`L08-U260339-006__remediation_1`** 두 개는 **단어시험 오답 복습(remediation) 세션**의 부산물입니다. 학생이 단어시험에서 임계치 미만으로 떨어지면 `WordTestStep`이 "틀린 단어 4단계 복습"을 띄우는데, 이때 내부적으로 `WordPreStep`을 재사용하면서 `sentence_id` 를 `"<원래코드>__remediation_<attemptNo>"` 라는 합성 ID로 `word_pre_results` 에 저장합니다 (소스: `WordTestStep.tsx:473`).

`학습결과` 화면은 `word_pre_results.sentence_id` 도 활동 소스로 모아 sentence 카드를 만들기 때문에(소스: `LearningResults.tsx:178-180, 219-221`), 이 합성 ID가 "지문 1개"인 것처럼 별도 그룹으로 잘못 노출됩니다. DB 확인 결과, 김재원만이 아니라 16명의 학생/지문에서 동일하게 발생 중입니다.

워크북 인쇄 재구성과 학생분석 누락 건도 함께 잡겠습니다.

---

## 작업 1 — 학습결과: `__remediation_N` 합성카드 제거 + 원래 지문 행에 "오답복습 N회" 표시

**파일:** `src/pages/teacher/LearningResults.tsx`

1. 활동 소스에서 `(user_id, sentence_id)` 페어를 모으는 단계 (line 205-220 근방) 에서 `/__remediation_\d+$/` 매칭 sid 는 **collect 에서 제외** → 별도 카드 생성 차단.
2. 동시에 `word_pre_results` 결과를 한 번 더 훑어서 `parentSid = sid.replace(/__remediation_\d+$/, "")` 로 묶어 **`(user_id, parentSid) → 오답복습 시도 수`** 맵을 만든다.
   - 시도 수 = 해당 학생/원래 지문에 대해 발견된 distinct `__remediation_\d+` suffix 개수.
3. 화면 표의 `단어시험` 컬럼 옆에 작은 보조 배지 추가:
   - 예: `100 ↻3` 또는 `오답복습 3회` (Tooltip 으로 "단어시험 오답 4단계 복습 누적 3회")
   - 시도 수가 0 이면 표시하지 않음.
4. 카운트 자체는 신뢰할 수 있도록 sid 가 `"^…__remediation_<숫자>$"` 형태인 것만 인정하고, 부모 sid 가 실제 `textbook_passages.code` 또는 `user_sentences.code` 에 존재할 때만 카운트.

> 데이터는 그대로 둡니다 (`word_pre_results` 의 학습 이력은 가치 있음). UI 노출만: 부모 행에 시도 횟수 배지로 흡수.

---

## 작업 2 — "유닛만" 모드 워크북 레이아웃 재구성

**파일:** `src/lib/unitWorkbook.ts`, `src/lib/printTemplates.ts`

현재 `unit_only` 모드는 지문마다 `[분석 채점본 → 한글해석 HO 2장]` 을 N번 반복해서, 같은 구조도/지스트/영작 블록이 N번 출력됩니다. 사용자 요구는:

```text
[표지]
─────────────────────────────────
[분석 채점본 — 지문별 N장]   (작업 3 후 학생 분석 라벨 포함)
─────────────────────────────────
[유닛 통합 한글해석본 — 1~2장]
  · "영문 한 줄 / 학생 한글해석 한 줄" 반복
  · 자연 흐름 페이지 분할 (B5 11pt line-height 2.0)
─────────────────────────────────
[유닛 끝 — 1회만]
  · 구조도 (큰 grid 1장)
  · 지스트 (4줄)
  · 영작 (4줄)
─────────────────────────────────
```

구현:
- `printTemplates.ts` 에 `buildUnitOnlyHandoutHtml(passages, ctx)` 신규 함수 추가
  - 입력: 한 유닛의 모든 완료 지문 + 학생 번역
  - 출력 1: 통합 해석본 페이지 (영문 + 학생 해석 줄로 나열)
  - 출력 2: 유닛 끝 한 페이지 (구조도 grid + 지스트/영작)
- `unitWorkbook.ts` 의 `buildUnitWorkbookHtmlFor`:
  - `mode === "unit_only"` 인 경우 지문별 루프 대신 다음 순서로:
    1. 표지
    2. 분석 채점본 (지문별 반복)
    3. 유닛 통합 한글해석본 (1회)
    4. 유닛 끝 구조도/지스트/영작 (1회)
  - `mode === "both"` 동작 변경 없음
- 표지 안내 문구 업데이트.

---

## 작업 3 — 분석 채점본에 "학생 분석 결과(품사/역할 라벨)" 출력

**파일:** `src/lib/printPreload.ts`, `src/lib/printTemplates.ts`

현재 `buildAnalysisPrintHtml` 는 `passage.english` 만 검정 텍스트로 찍고, 채점결과는 "차이 표"만 보여줘서 — 학생이 직접 만든 **owner 라벨**(예: `they → 명사·주어`, `disappear → 동사·과거`)이 인쇄본에 안 들어감. 사용자 피드백 그대로 "빈 영어문장만 출력".

구현:
1. `preloadAnalysisPayload` 에서 `fetchStudentAnswersByUserId(sentenceId, studentId)` (이미 `analysisGrading.ts` 존재) 호출 추가 → `studentProgress: Record<ownerId, AnyProgress>` 를 payload 에 포함.
2. `buildWordUnitsFromTokens` 결과(이미 사용 중)와 매핑해서 단일 단어 + span owner 모두 라벨 산출.
3. `printTemplates.ts` 에 `formatProgressLabel(prog)` 헬퍼 추가:
   - `pos=noun` → `"명사·{form?}·{element?}·{role?}"`
   - `pos=verb` → `"동사·{tense?}·{aspect?}·{voice?}"`
   - `pos=adj/adv/etc` → 동일 패턴
4. `buildAnalysisPrintHtml` ① 본문 블록 교체:
   - 영문 단어를 칩으로 렌더링하고, 학생이 라벨을 채운 owner 는 그 아래에 작은 라벨 함께 표시
   - 마스터키 불일치(`status !== "exact"`) owner 는 칩 배경 옅은 빨강 음영
   - 학생 미입력 owner 는 점선 회색
5. 수식/지칭 관계선은 이번 라운드 제외 (스코프 큼).

> 인쇄용이라 컬러는 흑백/회색 + 빨강 음영만. `print-color-adjust: exact` 이미 설정됨.

---

## 기술 노트 (요약)

- 합성 sid 패턴: `${realCode}__remediation_${attemptNo}` — `/__remediation_\d+$/` 정규식으로 안전 필터.
- 오답복습 카운트는 `word_pre_results` 의 distinct suffix 기준 (재진입해도 같은 attempt_no 면 1회).
- `unit_only` 한 페이지 문장 수는 CSS overflow 자연 분할에 맡기고, `page-break-before: always` 는 유닛 끝 구조도 직전에만.
- 학생 분석 라벨은 `owner_progress.progress` (jsonb) 의 `pos / noun / adj / adv / verb / etc` 구조 그대로 활용. SQL 마이그레이션 불필요.
- 변경 파일 4개: `LearningResults.tsx`, `unitWorkbook.ts`, `printTemplates.ts`, `printPreload.ts`. 신규 SQL/RLS/마이그레이션 없음.
