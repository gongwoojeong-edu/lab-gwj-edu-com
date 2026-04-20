

## 분석 패널 복구 — 실행 계획 (승인됨, 1~4단계 모두 적용)

`src/pages/Index.tsx` **단일 파일**만 수정합니다. 분석 로직/저장 흐름은 건드리지 않습니다.

### 1. 헤더 우측 영역 3그룹화 + 구분선

```text
[정답입력][정답저장][정답초기화]  │  [AI추출][단어목록][힌트]  │  [진행상태][사용자]
```

- 기존 헤더 우측 `flex` 컨테이너를 3개의 sub-group `<div>` 으로 분리.
- 그룹 사이에 `<Separator orientation="vertical" className="h-6 mx-1" />` 삽입.
- 선생님 도구 그룹(`AiExtractButton` + `ExtractedWordsPanel` + `AdminHintToggle`)은 staff가 아닐 때 렌더 자체를 스킵 → 학생 화면 영향 0.

### 2. 좁은 화면(<md)에서 도구 그룹을 ⋯ 메뉴로 접기

- 도구 그룹 컨테이너에 `hidden md:flex` 적용해 데스크톱은 그대로 노출.
- `md:hidden` 으로 `DropdownMenu` 트리거(`MoreHorizontal` 아이콘 + "도구") 추가.
- 드롭다운 안에 동일한 3개 컴포넌트를 세로 배치(`AiExtractButton`/`ExtractedWordsPanel` 트리거는 `DropdownMenuItem` 으로 감싸기).

### 3. 분석 패널 가시성 회복

- 우측 고정 패널: `fixed top-[76px] right-4` → `fixed top-[68px] right-4 z-30` 로 조정.
- 컨테이너 클래스 추가: `border border-border/60 bg-background/80 backdrop-blur-sm shadow-lg rounded-xl`.
- 단어 미선택 시 placeholder 카드 표시: 흐릿한 안내문 "단어를 선택하면 여기서 분석할 수 있어요" + 작은 키 힌트("`?` 키로 패널 토글").

### 4. 강제 토글 (단축키 + 플로팅 버튼)

- 새 state `analysisPanelHidden` (default: false). 데스크톱 패널의 렌더 조건에 추가.
- `useEffect` 로 `keydown` 리스너: `?` (Shift+/) 누르면 `analysisPanelHidden` 토글. 입력창 포커스 중에는 무시.
- 우측 하단 플로팅 버튼: 패널이 숨겨진 상태일 때만 표시(`fixed bottom-4 right-4 z-40`), 클릭 시 다시 노출. `PanelRightOpen` 아이콘 + tooltip "분석 패널 열기 ( ? )".

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/pages/Index.tsx` | 헤더 3그룹화 + ⋯ DropdownMenu + 분석 패널 스타일/위치 + `?` 토글 + 플로팅 복구 버튼 |

### 동작 결과

- **1290px (현재)**: 헤더 한 줄 유지 → 우측 분석 패널 명확히 보임.
- **모바일**: 도구 3개가 ⋯ 안으로 접혀 헤더 깔끔.
- **학생**: 선생님 도구 그룹 미렌더 → 영향 없음.
- **언제든**: `?` 키 또는 플로팅 버튼으로 패널 강제 복구.

