# 판서 도구 모음을 대화상자 맨 위로 이동

## 목표
승인·평가 창을 열면 판서 도구 모음(판서 ON/OFF pill)이 한글해석을 가리는 위치에서 시작한다.
대화상자 **맨 위 제목 줄**(✕ 닫기 버튼 옆)에 붙여서, 열자마자 해석을 가리지 않게 한다.
드래그 이동·접기 기능은 그대로 유지.

## 원인
- `src/components/learning/TeacherApprovalDialog.tsx` 645행 `AnnotationLayer`에
  `toolbarClassName="absolute right-2 top-1 z-30"` 로 지정 → 도구 모음이 본문(해석 영역) 컨테이너 기준 맨 위에 떠서 해석 첫 줄을 가림.

## 변경

### 1. `src/features/annotation/AnnotationLayer.tsx`
- 새 선택 prop `toolbarPortalTarget?: HTMLElement | null` 추가.
- 값이 있으면 `createPortal`로 도구 모음을 그 요소 안에 렌더링(기존 `toolbarClassName` 위치 방식은 폴백으로 유지).

### 2. `src/features/annotation/AnnotationToolbar.tsx`
- 변경 없음(포털 이동만으로 충분). 드래그/접기 동작 그대로.

### 3. `src/components/learning/TeacherApprovalDialog.tsx`
- 대화상자 헤더(제목 "선생님 승인 — 평가" 줄) 오른쪽, 닫기 버튼 왼쪽에 toolbar 전용 슬롯 `<span ref>` 추가.
- 헤더 요소를 state로 보관(`useState<HTMLElement | null>`)해 645행 메인 `AnnotationLayer`에 `toolbarPortalTarget`으로 전달.
  → 도구 모음이 헤더 줄에 고정되어 해석을 가리지 않음.
- 793행 메모용 `AnnotationLayer`(scope="memo")는 메모 입력창 바로 위 현재 위치 유지(두 도구 모음이 헤더에서 겹치는 것 방지).
- 모바일/좁은 화면에서 헤더가 좁으면 도구 모음이 줄바꿈되도록 헤더 슬롯에 `flex-wrap` 적용.

## 검증
- `bunx tsgo --noEmit -p tsconfig.app.json`
- 미리보기에서 승인·평가 창을 열어 ① 도구 모음이 제목 줄에 표시 ② 한글해석이 가려지지 않음 ③ 판서 ON/드래그/접기 정상 동작 확인(Playwright 스크린샷).
