

## 두 가지 작업 묶음

### A) 부배지 수직 stacking → 수평 + 명확한 층별 색

**문제**: 층이 깊어질수록 부배지가 위로 올라가서 윗줄 영문과 겹침. 좌상단 legend도 불필요.

**해결**:
1. **수직 offset 제거** — 안쪽/외곽 부배지 모두 동일한 `top: -16px` 한 줄로 고정
2. **층별 색을 강하게 분리** — 현재 violet/indigo/sky/teal(비슷한 색조)을 → **Layer1 노랑 / Layer2 빨강 / Layer3 청록 / Layer4 보라** 같이 hue를 크게 벌림
3. **부배지 prefix 숫자** — `①품사명` `②절명` 처럼 layer 번호를 작은 원형 숫자로 prefix → 색맹/흑백 출력에서도 구분
4. **본문 단어 stacking 색**도 동일 Layer 토큰 사용 → 본문 색띠와 부배지 색이 즉시 매칭
5. **수평 충돌 방지** — 한 단어에 여러 부배지가 anchor되면 `gap-1`로 inline 나란히 표시 (anchor 분산은 이미 중간 인덱스에 함)
6. **좌상단 Layer Legend 제거** — 색+숫자만으로 충분
7. **상단 padding 축소** — 더 이상 층마다 위로 안 쌓이므로 `pt-6` 정도로 충분

### B) 수식 화살표 (Modifier Arrow) 신규 기능

**데이터 모델** (`progressMap` 또는 별도 `modifierTargetsMap`):
```ts
type ModifierTarget = { source: string /*ownerId*/, target: string /*tokenId*/ };
```
문장별로 `Map<sentenceId, ModifierTarget[]>` 저장 (localStorage 영구화).

**Interaction Flow** (`AnalysisPanel.tsx`):
1. 현재 owner의 element가 `M` 또는 형용사일 때만 `[수식 대상 지정]` 버튼 노출
2. 버튼 클릭 → 전역 상태 `pendingModifierSource = ownerId` 설정 + 패널에 "대상 단어를 클릭하세요" 안내
3. `handleWordMouseDown`에서 `pendingModifierSource`가 있으면 일반 selection 흐름 가로채고 → 클릭한 token을 target으로 저장 후 pending 해제
4. 같은 source로 다시 지정하면 덮어쓰기, source 자체가 지워지면(eraseOwner) 관계도 같이 삭제

**SVG 렌더링** (`Index.tsx` 본문 컨테이너 위에 absolute SVG overlay):
- 컨테이너에 `ref` + `ResizeObserver`로 각 token DOM의 좌표 측정
- 각 관계마다 source 단어 top-center → target 단어 top-center 곡선 (`<path d="M sx,sy Q midX,midY-30 tx,ty">`)
- 화살표 끝에 `<marker>` 정의로 화살촉
- 스타일: `stroke="hsl(var(--primary))"` `stroke-dasharray="4 3"` `stroke-width="1.5"` `fill="none"`
- top 기준 → 하단 SVOC 배지와 충돌 없음

**텍스트 라벨 제거**: "→ Noun" 같은 텍스트는 일절 렌더하지 않음. 화살표 SVG 만.

**Toggle 표시**:
- `HintSettingsContext`에 `showModifierArrows: boolean` 추가
- 헤더 `AdminHintToggle` 옆 또는 같은 패널에 "수식선 표시" 스위치 (Admin 모드에서만 노출)
- OFF면 SVG overlay 숨김

### 수정 파일

- `src/index.css` — Layer 토큰 hue 재설계 (yellow/red/teal/purple), `sub-badge-pill` 한 줄 inline 정렬용 wrapper 클래스
- `src/pages/Index.tsx` —
  - 부배지 수직 offset 제거, layer 번호 prefix, Legend 제거, padding 축소
  - 화살표 overlay SVG 컴포넌트 + token ref map
  - `pendingModifierSource` 상태 + 클릭 가로채기
  - `modifierTargetsMap` localStorage 저장/로드
- `src/components/analyzer/AnalysisPanel.tsx` — `[수식 대상 지정]` 버튼 (조건부)
- `src/components/analyzer/HintSettingsContext.tsx` — `showModifierArrows` 추가
- `src/components/analyzer/AdminHintToggle.tsx` — 수식선 표시 스위치 추가
- (신규) `src/lib/modifierTargets.ts` — load/save/upsert/remove 유틸 (`customAnswers.ts` 패턴 그대로)

### 검증

1. 1·2·3층 부배지가 한 줄에 색·숫자로 구분되어 표시 (윗줄 영문과 겹침 0)
2. Layer 색이 본문 stacking 색과 정확히 일치
3. 형용사/M owner에서만 [수식 대상 지정] 버튼 노출 → 클릭 → 다른 단어 클릭 → 곡선 화살표 등장
4. 화살표는 단어 위쪽에서만 그려져 SVOC 배지와 안 겹침
5. Admin 토글로 화살표 일괄 숨김/표시
6. owner 삭제 시 관련 화살표도 사라짐
7. 새로고침 후에도 화살표 관계 유지 (localStorage)

