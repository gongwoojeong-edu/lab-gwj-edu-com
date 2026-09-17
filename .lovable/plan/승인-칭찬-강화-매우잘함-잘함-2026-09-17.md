# 승인 칭찬 강화 — 매우잘함·잘함

## 목표
선생님이 승인할 때 학생 화면에 뜨는 칭찬을 심플하면서도 임팩트 있게 강화.
학습 흐름(약 2.5초 후 자동 다음 문장 이동)을 방해하지 않는 선에서 텍스트 + 가벼운 연출.
- 자동 칭찬 문구(등급별 다양한 문구 중 랜덤)
- 선생님이 직접 칭찬 한 줄을 적으면 자동 문구 대신 우선 표시("둘 다")

## 현재 상태 (확인 완료)
- 학생 결과 토스트: `✅ 선생님 평가: 매우잘함` (고정 문구, 단조로움)
- 학생 결과 배너(`SentenceLearn.tsx` 1204~): "선생님 평가 결과" + 등급 배지 + 메모. 칭찬 문구 없음.
- 알림함 제목: `선생님 학습평가: 매우잘함`
- `sentence_approvals` 테이블에 칭찬 전용 컬럼 없음.
- 설치된 애니메이션 라이브러리: `tailwindcss-animate` 만 있음 (폭죽 라이브러리 없음 → CSS/Tailwind 기반 경량 연출 사용).

## 예시 (최종 문구는 구현 시 다듬음)

자동 칭찬 문구(매번 랜덤):
- 매우잘함
  - "🔥 완벽해요! 이 감각 그대로!"
  - "🌟 정말 훌륭해요! 완벽한 해석이에요!"
  - "💎 압도적 완벽함! 최고예요!"
- 잘함
  - "👍 아주 잘했어요! 실력이 쑥쑥 자라요!"
  - "✨ 잘했어요! 지금 흐름이 아주 좋아요!"
  - "🌈 참 잘했어요! 조금만 더면 완벽!"

선생님 직접 칭찬(예): "오늘 집중력 최고! 연결사 처리 완벽했어요" → 자동 문구 대신 큰 글씨로 표시.

연출(등급별 강도 차등, 1회성):
- 매우잘함: 에메랄드 그라데이션 테두리 배너 + 상단에 큰 칭찬 문구 + 1.2초짜리 반짝이 스파클(✨/🌟이 위로 떠오르며 페이드아웃, 6~8개, 가벼움).
- 잘함: 스카이 톤 배너 + 차분한 1회 스파클(4~5개).
- 보통/미흡/코칭/재학습/보류: 기존과 동일(칭찬 연출 없음, 중립 배지·메모 유지).

## 구현

### 1. DB — 칭찬 컬럼 추가
`sentence_approvals`에 `praise_text text NULL` 컬럼 추가 (마이그레이션).
- 기존 테이블이므로 GRANT/RLS 변경 불필요(컬럼은 테이블 권한 상속).
- `src/integrations/supabase/types.ts` Row/Insert/Update 에 `praise_text` 추가.
- `SentenceApproval` 인터페이스(`sentenceApprovals.ts`)에 `praise_text?: string | null` 추가.

### 2. 칭찬 문구 모듈 (신규)
`src/lib/praisePhrases.ts`
- `EXCELLENT_PRAISE[]`, `GOOD_PRAISE[]` 배열.
- `pickPraise(grade, customText?)`: customText(선생님 칭찬)가 비어있지 않으면 우선 반환, 없으면 등급별 랜덤. excellent/good 외는 null.

### 3. 선생님 승인창 — 칭찬 한 줄 입력
`TeacherApprovalDialog.tsx`
- grade가 excellent/good일 때만 "칭찬 한 줄(선택)" 입력란 노출.
- `approveSentenceRequest` 호출 시 `praise` 전달.
- `approveSentenceRequest`(`sentenceApprovals.ts`): 승인 행 UPDATE에 `praise_text` 포함.
- PostHocGradeDialog(사후평가)는 평가/메모만 갱신하므로 칭찬 입력은 스킵(정책상 사후평가엔 미적용).

### 4. 학생 화면 — 결과 배너 + 연출 강화
`SentenceLearn.tsx`
- `lastEvaluation` 상태에 `praise` 필드 추가. `advanceAfterApproval`에서 `approval.praise_text` 저장.
- 배너 상단: 큰 칭찬 문구(`pickPraise` 결과) + 등급 배지 + 메모(기존).
- 매우잘함/잘함일 때만 1회성 스파클 컴포넌트 렌더(tailwindcss-animate 기반, 1.2초 후 자동 소거, 학습 차단 없음).
- 토스트 문구도 칭찬 문구 사용(예: "🌟 정말 훌륭해요! 매우잘함").

### 5. 알림함 제목
`sentenceApprovals.ts`의 `createNotification` 호출 시 excellent/good면 칭찬 문구를 제목에 반영.

## 검증
- 타입검사 통과.
- 승인창에서 매우잘함 승인 → 학생 화면에 칭찬 문구+스파클 배너 등장, 2.5초 후 자동 다음 이동 확인.
- 잘함도 동일 흐름, 강도 차등 확인.
- 선생님 칭찬 한 줄 입력 시 자동 문구 대신 해당 문구 표시 확인.
- 보통/재학습/보류는 기존과 동일(연출 없음) 확인.
