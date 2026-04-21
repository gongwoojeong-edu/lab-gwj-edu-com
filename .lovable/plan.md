

## 분석 화면 보강 3종

### 1) 분석 완료 단어 음영 복원

`src/components/analyzer/WordChip.tsx`의 `completed && !highlighted && "bg-primary/[0.06]"` 음영이 너무 옅어 거의 안 보임. 정답지(admin/teacher) 화면에서 분석된 단어가 한눈에 들어오도록 음영 강도를 올림:

- 변경: `bg-primary/[0.06]` → `bg-primary/15` (선택 음영과 같은 톤, 단 ring 없음)
- 또는 학생 화면과 admin 화면 톤을 분리하고 싶다면 `WordChip`에 `intensity?: "soft" | "strong"` prop을 추가해 admin/teacher 모드에서 strong 적용

권장: 톤만 올리는 단순 변경(`bg-primary/15`). 정답지·학생 양쪽에서 "이 단어는 분석 끝남"이 즉시 보임.

### 2) 분석 불필요 단어 클릭 차단

`src/pages/Index.tsx`의 `wordUnits` 메모는 이미 토큰별로 `analyzable` 여부를 계산함(구두점·기호 제외). 현재 `WordChip` / 토큰 렌더는 모든 토큰에 mouseDown/click 핸들러가 붙어 있어 비분석 토큰도 클릭됨.

변경:
- 토큰 렌더 분기에서 `!unit.analyzable`인 경우:
  - `<WordChip>` 대신 plain `<span>`으로 렌더 (cursor-default, 핸들러 없음, role/tabIndex 없음)
  - 또는 `WordChip`에 `disabled?: boolean` prop 추가 → `cursor-default`, `onMouseDown/Enter/Up/Click` no-op, `tabIndex={-1}`, `aria-disabled`
- 드래그 선택 로직(`handleMouseEnter`)에서도 비분석 토큰 인덱스는 range에서 제외

권장: `WordChip`에 `disabled` prop 추가 (한 곳만 수정하면 드래그/포커스/키보드 모두 안전).

### 3) 한글 해석 게이트 60% → 80%

직전 승인 플랜의 임계값만 교체. 영향 파일:
- `src/pages/SentenceLearn.tsx`: 게이트 비교값 `analysisRate < 0.6` → `< 0.8`, 안내 문구 "60% 이상" → "80% 이상"
- (게이트 로직이 `Index.tsx`에 들어간 경우엔 그쪽 상수도 함께 0.8로 교체)

---

### 작업 순서

1. `WordChip.tsx`
   - `completed && !highlighted` 음영을 `bg-primary/15`로 강화
   - `disabled?: boolean` prop 추가 → true면 모든 마우스/키 핸들러 no-op, `cursor-default`, `tabIndex={-1}`, `aria-disabled="true"`, 본문 텍스트는 `text-muted-foreground` 톤으로 살짝 죽임(선택 사항)
2. `Index.tsx`
   - 토큰 렌더에서 `disabled={!unit.analyzable}` 전달
   - `handleMouseEnter` 드래그 range 갱신 시 비분석 인덱스 skip
3. `SentenceLearn.tsx` (또는 게이트 위치)
   - 임계값 0.6 → 0.8, 표시 문구·진행률 표기 그대로 유지
4. 검증
   - 정답지 화면: 분석 완료 단어가 명확한 옅은 보라 음영으로 보임
   - 학생/정답지 모두: 마침표·쉼표·따옴표 등 비분석 토큰은 hover 커서 변화 없음, 클릭/드래그 선택 불가
   - 학생: 분석 진행률 79%까지 [한글 해석 →] 비활성, 80% 도달 시 활성화

