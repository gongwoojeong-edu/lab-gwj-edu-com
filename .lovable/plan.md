## 통합 워크북 뒷면 → 예전 포맷 복원 + 정독해석/재영작 칸 추가

### 변경 내용

`src/lib/printTemplates.ts` 의 `buildUnitCombinedWorkbookHtml` 에서 뒷면(`structurePage`) 부분만 교체합니다.

**현재 뒷면**: PDF embed 또는 빈 grid 1장 (구조도만)

**변경 후 뒷면** (예전 `uo-end-page` 포맷 + 신규 2칸):
1. **① 구조도** — 4mm 격자 빈칸 (min-height 90mm)
2. **② 지스트 (주제문장)** — 작성 줄 4줄
3. **③ 영작** — 작성 줄 4줄
4. **④ 정독해석** (신규) — 작성 줄 4줄
5. **⑤ 재영작** (신규) — 작성 줄 4줄

②③은 2열 그리드, ④⑤도 그 아래 2열 그리드로 배치.
`structurePdfUrl` 관련 로직(embed, signed URL fetch)은 제거.

### 파일
- `src/lib/printTemplates.ts` — `buildUnitCombinedWorkbookHtml` 의 structurePage 블록 교체 + `UnitCombinedPayload` 에서 `structurePdfUrl` 필드 제거
- `src/lib/unitWorkbook.ts` — `buildUnitOnlyCombined` 에서 구조도 PDF signed URL fetch 로직 제거, payload에서 `structurePdfUrl` 전달 삭제