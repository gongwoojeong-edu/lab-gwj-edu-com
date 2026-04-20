
## 의도 확인

5번 항목 보강:
- **idiom(관용구) 안의 단어도 개별 클릭 + 분석 가능**
- 즉 클릭만 되는 게 아니라 mousedown/enter/up 드래그 선택, POS·element·role 분석까지 idiom 외곽 wrapper와 무관하게 정상 동작해야 함

기존 5번은 "클릭 가능"으로만 적었는데, 실제로는 분석 패널 입력까지 막힘 없이 되도록 모든 이벤트가 inner WordChip으로 전달돼야 한다는 뜻.

## 7개 사항 통합 처리 (5번 보강 반영)

| # | 항목 | 처리 |
|---|---|---|
| 1 | 연속 완료 토큰 배경 병합 | `WordChip.groupPosition` + 공백 span 배경 |
| 2 | 완료 토큰 클릭 → 재선택·수정·삭제 | mousedown 시 selectedId·indices 복원 |
| 3 | 종속절(접SV) 하단 SVOC 배지 | clause wrapper 아래 element 배지 1개 |
| 4 | 지우개 정상화 | progress + completedSelectionMap + clause start/end + customAnswers 정리 |
| 5 | **idiom 안 단어 개별 클릭·드래그·분석 모두 가능** | outer wrapper `pointer-events-none`, inner WordChip `pointer-events-auto`, 모든 mouse/touch 이벤트 inner에서 처리 — 분석 패널·POS·element·role 입력까지 정상 동작 |
| 6 | 부속배지에서 품사(명/형/동/부/기타) 전체 제거 | POS 라벨 렌더 분기 제거 |
| 7 | "숙어" 문구 → "관용구" | UI 한글 라벨만 교체 (식별자·키 유지) |

## 변경 파일

### `src/components/analyzer/WordChip.tsx`
- `groupPosition?: "single" | "start" | "middle" | "end"` prop 추가
  - single: `px-1 rounded-sm`
  - start: `pl-1 pr-0 rounded-l-sm rounded-r-none`
  - middle: `px-0 rounded-none`
  - end: `pl-0 pr-1 rounded-r-sm rounded-l-none`

### `src/pages/Index.tsx`
- 렌더 루프: 같은 owner의 연속 인덱스 판정 → `groupPosition` 전달, 토큰 사이 공백도 같은 그룹이면 `bg-primary/[0.06]` 채움
- 완료 토큰 mousedown: `selectedId = ownerId`, `selectedWordIndices = completedSelectionMap[ownerId]` 복원 → 패널이 기존 progress 그대로 로드, 수정·삭제 가능
- **idiom outer wrapper**: `pointer-events-none` (배경/툴팁만 담당)  
  → inner WordChip은 정상적으로 mousedown/enter/up 받아 분석 흐름에 진입
  → 툴팁 트리거는 별도 hover-only 영역으로 분리해 클릭 차단 안 함
- 절(clause) 묶음 wrapper 아래 absolute로 element 배지(`badge-s/o/c/m`) 1개 — owner token element 사용
- POS 배지(명/형/동/부/기타) 렌더 분기 제거
- `handleEraser`: progress + completedSelectionMap + clause start/end customAnswer 정리, idiom mark는 유지
- 헤더 카운터 "📚 등록 숙어 N" → "📚 등록 관용구 N"

### `src/components/analyzer/AnalysisPanel.tsx`
- `IdiomSection` 한글 문구 "숙어" → "관용구" (제목/버튼/플레이스홀더/토스트)
- 필요 시 절 element 저장값 노출 보정

## 손대지 않을 것
- 하단 SVOC 배지 (S/V/O/C/M) — 그대로
- 부속성분 배지 (to V의o, V-ing의o, 전치사의o 등) — 그대로
- 한국어 라벨 — 그대로
- idiom 식별자/localStorage key/타입명 — 영문 그대로
- 데이터·테스트 페이지 — 변경 없음

## 진행 범위
- ✅ 7개 항목 모두 한 번에 처리 (5번은 클릭+드래그+분석 입력까지 전부 작동)
- ❌ 데이터/테스트 페이지/식별자 변경 없음
