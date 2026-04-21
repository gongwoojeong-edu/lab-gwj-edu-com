

## 통합 플랜: 학생 학습 중 정답 비공개 + 제출 후 자기첨삭 + 한글해석 단계 분리

### A. 학습 중 정답 노출 차단

**1. `src/pages/Index.tsx` — 시드 정답 비교 제거**
분석 핸들러 16곳에서 `selectedToken?.answer.*` 비교 로직 제거:
- `handlePos`, `handleNounForm/Element/Role/ElementRole`, `handleAdjForm/Element/Role/ElementRole`, `handleAdvForm/Subtype/Role`, `handleEtcKind/Role`, `handleVerb*`
- 변경: `const correct = answerInputMode || token.answer.x === val` → `const correct = true` (학생 입력 항상 수용)
- `wrong` 분기 및 자동 리셋 제거 → 학생 선택 그대로 유지

**2. `src/components/analyzer/AnalysisPanel.tsx` — 시드 한글 라벨 차단**
- `CompletionBlock label={answer?.koreanLabel ...}` 4곳(NounPanel L939, AdjPanel L1034, AdvPanel L1302, EtcPanel L1454) → `progress.role ?? progress.form ?? "완료"`
- `answer?.element` 분기(L879)는 `progress.noun.element` 기반으로 변경

**3. 학생 답안 클라우드 저장 (채점 가능하게)**
`Index.tsx`에 useEffect 추가:
- `progressMap` 변경 시 `completed=true`로 전이된 owner를 감지
- `upsertOwnerProgress({ sentence_id, owner_id, progress, completed: true })` fire-and-forget
- `gradeAnalysis()`가 학생 답을 정상 비교 가능하도록

---

### B. 한글 해석 단계 분리 (베껴쓰기 차단)

**4. `src/pages/SentenceLearn.tsx` — 단계 재구성**
기존 `analysis` 단계를 두 개로 분할:
- `analysis-input`: 분석 UI + 한글힌트 사용 가능
- `translation`: 분석 UI 완전 언마운트, 원문만 + 해석 입력

새 흐름:
```
[분석 입력] → "분석 제출 → 한글해석" 버튼
   ↓ (분석 완전 잠금, 되돌아갈 수 없음)
[한글 해석] 원문만 노출 → 해석 제출
   ↓
[단어테스트]
```

**5. 단계 가드 강화**
- `StepProgressBar` 클릭에서 `translation` 진입 후에는 `pre`/`analysis-input` 클릭 disabled
- `setStep` 함수에 백워드 전이 가드: `translationDone === true` 면 분석 단계 진입 차단, 자동으로 `post` 또는 `translation`으로 리다이렉트
- URL `?step=analysis` 같은 수동 우회도 useEffect에서 차단

**6. `translation` 단계 화면**
- `Index` 컴포넌트(분석 패널/단어칩/한글힌트) 전부 미렌더
- 상단에 원문 카드(영어 큰 글씨), 하단에 `TranslationStep`(textarea + 제출)만
- 해석 제출 시 자동으로 `post`(단어테스트) 단계로 이동

---

### C. 제출 후 정답 열람 (자기첨삭 모드)

**7. 진입 조건 + 토글**
SentenceLearn 진입 시 `sentence_attempt_logs`에 시도 1건 이상 존재하면 분석 화면 우상단 **[정답 보기 / 닫기]** 토글 노출. 시도 0건이면 토글 자체 숨김.

**8. `src/integrations/supabase/storage.ts`**
- `fetchMasterProgressMap(sentenceId)` 추가: admin user의 owner_progress 전체 → `Record<owner_id, progress>`

**9. `Index.tsx` + `AnalysisPanel.tsx` — reviewMode 분기**
- 새 prop `reviewMode: boolean` + `masterProgress: Record<string, progress>`
- ON일 때:
  - 모든 분석 핸들러 early-return (읽기 전용)
  - owner 칩에 마스터 라벨 보조 배지 함께 표시 (예: "내 답: 명사·주어 / 정답: 명사·목적어")
  - 학생-마스터 불일치 owner는 amber outline + ⚠ (힌트 모드와 같은 시각언어)
- 마스터 미등록 지문이면 토글 비활성 + "마스터 미등록" 안내

**10. 진입 경로 (Hand out 학습 완료 후에도 언제든 열람)**
- SentenceLearn 미통 인트로에 **[내 답 vs 정답 보기]** 버튼 → `/learn/sentence/:id?mode=review`
- StudentHome 최근 학습 카드(PASS/미통 무관)에 **[정답 첨삭]** 보조 버튼
- WordTestStep 결과 화면(PASS/TRY AGAIN) 하단에 **[정답과 비교하기]** CTA

**11. URL 동기화**
`?mode=review` 쿼리 파라미터로 reviewMode 자동 ON. SentenceLearn에서 review 모드일 때는 단계 가드 무시(아무 단계든 자유 열람), 단 모든 입력은 읽기 전용.

---

### 작업 순서
1. `Index.tsx` 16개 핸들러에서 시드 정답 비교 제거
2. `AnalysisPanel.tsx` `koreanLabel` / `answer?.element` 의존 제거
3. `Index.tsx`에 학생 owner 완료 시 `upsertOwnerProgress` 자동 호출
4. `SentenceLearn.tsx`에 `translation` 단계 도입 + 분석/해석 분리 렌더
5. 단계 가드(백워드 차단) + `StepProgressBar` 잠금
6. `analysis-input` 하단에 "분석 제출 → 한글해석" 버튼
7. `storage.ts`에 `fetchMasterProgressMap` 추가
8. `Index.tsx`에 `reviewMode` 상태 + URL `?mode=review` 동기화 + 토글 버튼
9. `AnalysisPanel.tsx`에 reviewMode 분기 (마스터 보조표시 + 읽기 전용)
10. SentenceLearn 미통 인트로 / StudentHome 카드 / WordTestStep 결과에 정답 열람 진입 버튼
11. 검증: 학습 중 정답 미노출 → 분석 제출 후 해석 화면에서 분석 복귀 불가 → 단어테스트 후 자기첨삭 모드로 정답 열람 가능

