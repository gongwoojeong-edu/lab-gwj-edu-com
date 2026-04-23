

# 분석교안/구조도 파일 열람 기능 추가

현재 분석교안·구조도 파일명이 표시되지만 클릭해도 열리지 않습니다. **"보기" 버튼**을 추가해 새 탭에서 내용을 확인할 수 있게 만듭니다.

## 변경 사항

### 1. `src/pages/teacher/BookshelfUnit.tsx`

분석자료 카드와 구조도 카드 양쪽에 **"보기"** 버튼(👁 Eye 아이콘)을 추가합니다. 위치: 파일명 옆, "교체"·"삭제" 버튼 앞.

동작:
1. 클릭 시 `getAnalysisPdfSignedUrl(unit.analysis_pdf_url)` (또는 구조도용) 호출
2. Storage에서 1시간짜리 서명 URL 생성
3. `window.open(signedUrl, "_blank")` 로 새 탭에서 열기
4. 실패 시 toast 에러 메시지

```text
[📄 2026-1-1-35-분석교안.html]  업로드: 04-22 16:30   [👁 보기] [⬆ 교체] [✕ 삭제]
```

### 2. 클로드에서 들어온 파일은 HTML
- 클로드 import는 `.html` 로 저장됨 (PDF 아님) → 브라우저에서 그대로 잘 열립니다
- 사용자가 직접 PDF로 출력하고 싶으면 새 탭에서 `Ctrl+P` → "PDF로 저장" 가능
- UI 라벨은 그대로 "분석자료 (PDF)"로 두되, 보기 버튼이 있어 실제 파일이 PDF든 HTML이든 모두 열림

### 3. 기존 PDF 업로드와 호환
- 직접 업로드한 PDF는 브라우저 내장 PDF 뷰어로 새 탭에서 열림
- 클로드에서 받은 HTML은 그대로 렌더링됨
- 동일한 "보기" 버튼으로 양쪽 모두 처리

## 기술 노트

- Storage 버킷 `analysis-materials` 는 비공개(private)이므로 **반드시 서명 URL** 필요
- `getAnalysisPdfSignedUrl` / `getStructurePdfSignedUrl` 함수는 `src/lib/textbooks.ts`에 이미 존재 (재사용)
- 새 state 추가: `viewingAnalysis`, `viewingStructure` (로딩 표시용 boolean)
- 변경 파일: **`src/pages/teacher/BookshelfUnit.tsx` 1개만**

## 검증 방법

승인 후 적용하면:
1. 책장 → L01 → 2026 모의고사 → Lesson 3월 진입
2. 분석자료 카드의 **"보기"** 버튼 클릭 → 새 탭에서 클로드 분석교안 HTML 표시
3. 구조도 카드의 **"보기"** 버튼 클릭 → 새 탭에서 구조도 HTML 표시

