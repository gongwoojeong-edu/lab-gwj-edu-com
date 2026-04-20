
## 8개 매뉴얼 + 추가요구(4번) 통합 실행 계획

### 추가 요구 (4번 항목 반영)
접속사절(접SV)도 단어와 동일하게:
- **부배지(품사 라벨)**: 분석 메뉴에서 마지막으로 누른 레이어 문자열을 그대로 노출
  - 예: `형용사 > 접SV > 관대 > 주격` → 부배지 `관대주격`
  - 예: `부사 > 접SV > 시간` → 부배지 `시간`
- **SVOC 배지**: 절도 문장성분(S/V/O/C/M)을 단어와 동일한 스타일로 절 범위 하단에 표시

즉 절은 "긴 단어"처럼 취급되어 단어와 동일한 배지 시스템 사용.

## 핵심 구조 변경

### A. Owner 키 통일 — span 기반
- `span::{sentenceId}::{startIdx}-{endIdx}` 단일 체계
- 단어/구/절 구분 없이 동일 자료구조
- `progressMap`, `customAnswers`, `completedSelectionMap` 모두 이 키 사용
- 단어 owner와 절 owner가 같은 토큰 위에 독립 공존 (재귀 중첩)

### B. 라벨 생성 — 100% 클릭 기록 기반 (Item 3, 4, 8)
- 새 유틸 `src/lib/labels.ts`
  - `buildSubBadgeLabel(progress, customAnswer)`: 마지막 레이어 클릭 문자열 그대로 반환
  - `buildElementBadge(progress)`: S/V/O/C/M 반환
- 원본 `token.answer.koreanLabel`, `token.answer.pos` 의존 전부 제거
- 약어·치환 금지

### C. 다층 렌더링 (Item 1, 2, 7 + 추가요구)
한 토큰/범위에 동시 렌더 가능:
- 절 브래킷 `[ ]`
- 절 SVOC 배경 (외곽 옅게)
- 단어 SVOC 배경 (내부 진하게)
- 관용구 세피아 underline
- 단어 한글 라벨
- 부배지 스택 (word → phrase → clause 순으로 아래)
- **절 SVOC 배지**: 절 범위 하단 중앙에 단어와 동일 스타일

절 = 긴 단어 취급, 동일한 배지 렌더 경로 사용.

### D. AnalysisPanel — Always-On (Item 2, 5, 6)
- POS 메뉴, 지우개, 선택해제 버튼 항상 노출
- 선택 없을 때만 placeholder 표시, 메뉴 자체는 비활성 아님
- 단일/구/절/완료 owner 모두 동일 메뉴
- IdiomSection은 패널 하단 별도 카드, SVOC 메뉴 절대 가리지 않음
- 완료 owner 재클릭 → 그 owner progress 복원, 즉시 편집 가능

### E. 핸들러 — 원본 POS 의존 제거 (Item 3)
- 모든 저장 핸들러가 active owner의 progress만 갱신
- `selectedToken.answer.pos` 분기 전부 삭제
- `force` 단독 클릭 → 빈 progress 새로 시작, 인접 owner 자동 복원 금지
- AI 추론·자동 그룹핑 0%

### F. 지우개 / 선택해제 (Item 5, 6)
- 지우개: active owner의 progress + customAnswer + completed 모두 삭제
- 선택해제: 하이라이트만 해제, 데이터 보존
- 둘 다 패널·하단바에 항상 노출

### G. 관용구 독립성 (Item 6)
- 관용구는 시각 레이어 전용
- SVOC 분석/절 표기를 차단하지 않음
- 항상 별도 카드로 노출

## 수정 파일
- `src/pages/Index.tsx`
  - ownerId span 기반 전환
  - 단일 토큰 클릭 시 인접 owner 복원 차단
  - 부배지·SVOC 배지를 admin label 기반으로 다층 스택
  - 절 범위에 단어와 동일한 배지 렌더 (4번 추가요구)
  - 지우개/선택해제 항상 노출
- `src/components/analyzer/AnalysisPanel.tsx`
  - 원본 answer 의존 제거
  - 메뉴 항상-on, 완료 상태에서도 편집
  - 라벨 약어 금지, 클릭 문자열 그대로
  - IdiomSection 하단 분리
- `src/lib/customAnswers.ts`
  - span 키 지원, 표시용 라벨 필드 추가
- `src/lib/labels.ts` (신설)
  - `buildSubBadgeLabel`, `buildElementBadge` 등 라벨 유틸 집중화

## 검증 (구현 후 확인 요청)
1. `that soon followed` → 형용사>접SV>관대>주격 저장 → 절 하단에 부배지 `관대주격` + SVOC 배지 표시
2. 그 절 안 `followed`만 다시 선택 → 단수>과거 저장 → 그 owner만 `단수과거`, 절 라벨 불변
3. `force` 단독 분석/삭제 시 `driving` 보존
4. 완료 owner 재클릭 시 메뉴·지우개 항상 노출
5. 같은 범위에 idiom + clause + SVOC 동시 렌더
6. 메뉴/지우개/선택해제가 어떤 선택 상태에서도 사라지지 않음
7. 모든 배지 텍스트가 메뉴에서 누른 문자열과 100% 동일
8. 절도 단어와 동일한 SVOC 배지 스타일로 표시
