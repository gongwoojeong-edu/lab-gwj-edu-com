

## Hand-out 인쇄 기능 (B5, 흑백 최적화)

### 진입 경로
- **책장 페이지**: 지문 카드 우측 상단에 `🖨️ Hand-out` 버튼 추가
- **학생화면 학습완료 화면**: 보조 버튼으로 "학습지 인쇄" 추가
- **신규 라우트**: `/teacher/handout/:passageCode?student=:userId`
  - 학생 user_id 쿼리스트링이 있으면 해당 학생의 한글 해석을 본문에 포함
  - 없으면 빈 칸 학습지로 출력

### 새 페이지: `src/pages/Handout.tsx`
인쇄 전용 단일 페이지(헤더/사이드바 없음). `window.print()` 자동 트리거 버튼 + 미리보기.

레이아웃 (B5 한 장 = 182mm × 257mm, 여백 10mm):

```text
┌─────────────────────────────────────────────┐
│ [LOGO] 공우정 영어 Hand-out      ┌──────┐  │ ← 헤더 8mm
│ Lv L05 · U2 · 003                │  QR  │  │
│ 학생: 김OO (gwj0001)             │ MP3  │  │
│ 출력: 2026-04-21 15:32           └──────┘  │
├─────────────────────────────────────────────┤
│ ① 지문 (어법 선택형)             [넓게]    │ ← ~85mm
│  Many people [what / that] live in cities… │
│  (행간 2.0, 좌우 여백 8mm, 표시 공간 확보) │
├─────────────────────────────────────────────┤
│ ② 한글 해석 [학생 작성 / 첨삭]   [중간]    │ ← ~55mm
│  학생: ……                                  │
│  ✎ 첨삭: ……                                │
├─────────────────────────────────────────────┤
│ ③ 구조도 (문장별 핵심어 흐름)    [중간]    │ ← ~45mm
│  S—V—O    [모눈 배경]                      │
├──────────────────┬──────────────────────────┤
│ ④ 지스트(주제)   │ ⑤ 영작                  │ ← ~30mm
│  ___________     │  ___________             │
└──────────────────┴──────────────────────────┘
```

### 1) 어법 선택형 자동 생성
파일: `src/lib/handoutCloze.ts` (신규)
- 입력: `Sentence.tokens`
- 규칙 (마스터키 답안 기반):
  - **what / that**: `pos="명사", form="접SV"` 또는 `pos="형용사", form="접SV"`(관계대명사) 토큰 → `[ what / that ]`
  - **ing / pp**: `pos="형용사", form="V-ing/PP"` 또는 `pos="부사", form="ing/pp"` 토큰 → `[ V-ing / V-ed ]`
  - **to V / V-ing**: `pos="명사", form="to V"|"V-ing"` 토큰 → `[ to V / V-ing ]`
- 출력: `{ before: string, choices: [string,string], after: string }[]` 식 분절 → 본문 렌더링
- 마스터키 미등록(`tokens === null`)이면 원문만 노출, 안내 표기 "어법 표시 없음"

### 2) 학생 한글 해석 + 첨삭
- `fetchTranslation(passageCode, studentUserId)` — 기존 storage 헬퍼 사용
- 신규 컬럼 또는 별도 테이블이 필요하다면 이번 턴에는 첨삭 메모만 `localStorage` 임시 저장 + DB 마이그레이션은 후속 작업으로 연기 (이번 인쇄 기능에서는 학생 본인 작성 텍스트만 표시)
- **결정 필요 ①** 첨삭 피드백 저장처: (a) 새 테이블 `translation_feedback` 생성 vs (b) 일단 인쇄 화면에서 선생님이 직접 타이핑해서 즉석 출력 — 기본은 (b)로 가되, 추후 (a) 확장 가능 구조 유지

### 3) 구조도 칸
- 빈 모눈(grid) 박스 1개 (`background: repeating linear-gradient`로 인쇄 시 0.3pt 회색 격자)
- 마스터키가 있으면 상단에 자동 힌트: `S — V — O` (주절 핵심 element만 추출)
- 학생이 직접 그리도록 충분히 비워둠

### 4·5) 지스트 + 영작 칸
- 좌우 2단 그리드, 각 4줄 밑줄 (`border-bottom: 0.5pt solid black`)

### 헤더 + QR
- QR: `qrcode.react` 추가 (npm). 값 = `https://lab.gwj-edu.com/learn/sentence/<passageCode>?audio=1`
- 24mm × 24mm 정사각형
- 학생명·학번은 `student_profiles` 조회, 미선택 시 빈칸

### 인쇄 CSS
파일: `src/pages/Handout.tsx` 내 `<style>` 블록 + `src/index.css`에 `@media print` 추가
```css
@page { size: B5 portrait; margin: 10mm; }
@media print {
  body { background: white !important; }
  .no-print { display: none !important; }
  .handout-page {
    width: 162mm; height: 237mm;
    page-break-after: always;
    color: black; font-size: 10.5pt;
  }
  /* 모든 색을 흑백으로 강제 */
  .handout-page * { color: black !important; background: white !important; border-color: black !important; }
  .handout-grid { background-image: linear-gradient(#ddd 0.3pt, transparent 0.3pt),
                                    linear-gradient(90deg, #ddd 0.3pt, transparent 0.3pt);
                  background-size: 4mm 4mm; }
}
```
- 화면 미리보기에서도 동일 비례 유지 (162mm × 237mm 컨테이너)
- 흑백 안전 패턴: 클로즈 박스는 검정 1pt 테두리 + 둥근 모서리 없음

### 라우트 등록
- `src/App.tsx`에 `/teacher/handout/:passageCode` 추가 (RequireAuth + teacher role)
- 학생 본인 인쇄도 허용하려면 별도 라우트 `/learn/handout/:passageCode` 추가 가능 — **결정 필요 ②**

### 책장 진입 버튼
파일: `src/pages/teacher/BookshelfUnit.tsx`
- 각 passage 행에 `Printer` 아이콘 버튼 추가 → `/teacher/handout/<code>` 새 탭 열기

### 신규 패키지
- `qrcode.react` (small, no extra deps)

### 작업 순서
1. `qrcode.react` 추가
2. `src/lib/handoutCloze.ts` — 토큰 → 클로즈 분절 변환
3. `src/pages/Handout.tsx` — 페이지 + 인쇄 CSS
4. `src/App.tsx` 라우트 등록
5. `BookshelfUnit.tsx`에 인쇄 버튼 추가
6. (옵션) 학생화면 완료 화면에도 인쇄 버튼
7. 검증: B5 한 장에 모든 섹션이 잘리지 않고 들어가는지, 흑백 인쇄 미리보기에서 가독성 OK인지

### 결정이 필요한 항목
① 첨삭 피드백 저장: **A) 새 DB 테이블 생성** / **B) 인쇄 화면 즉석 입력만 (저장 없음)** — 기본 추천: B
② 학생도 본인 학습지를 인쇄할 수 있게 할지: **A) 학생/선생님 모두** / **B) 선생님 전용** — 기본 추천: A
이 두 결정이 다르면 알려주세요. 기본값(B + A)으로 진행해도 좋다면 그대로 구현하겠습니다.

