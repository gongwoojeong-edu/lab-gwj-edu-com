
## 변경 내용

### 1. `src/pages/teacher/RequestsInbox.tsx`

**(a) 라인 486–496 안내 카드 삭제**
```
<Card className="p-3 text-[11px] text-muted-foreground bg-muted/30">
  기존 페이지(시험지 요청 / 선생님분석본보기요청)는 ...
</Card>
```
이 안내 카드 블록 전체 제거. (`/teacher/requests`가 이미 자기 자신으로 연결되어 무의미)

**(b) 라인 7 import 정리**
```
- import { useNavigate, Link } from "react-router-dom";
+ import { useNavigate } from "react-router-dom";
```
안내 카드 제거 후 `Link`가 더 이상 사용되지 않으므로 제거.

### 2. `src/App.tsx`

**라인 32 import 제거**
```
- import AnalysisRequests from "./pages/teacher/AnalysisRequests.tsx";
```
어떤 라우트에서도 더 이상 사용하지 않는 고아(orphan) import.

### 3. 파일 삭제

- `src/pages/teacher/AnalysisRequests.tsx` 삭제
  - 라우트 매핑 없음(`/teacher/requests`는 `RequestsInbox`로 연결됨)
  - 사이드바/대시보드 어디에서도 참조되지 않음
  - 통합 인박스가 동일 기능을 모두 포함

## 영향 범위

- 사용자 화면 변화: 통합 요청확인 페이지 하단의 호환 안내 작은 카드만 사라짐. 그 외 동작·디자인 변화 없음.
- `/teacher/requests`, `/teacher/inbox`, `/teacher/print-queue` 모두 기존대로 동작.
- `PrintQueue`(`/teacher/print-queue`)는 사이드바·대시보드에서 계속 사용 중이므로 유지.

## 검증

- 정리 후 `rg "AnalysisRequests"` 결과가 없어야 함.
- 정리 후 `rg "Link" src/pages/teacher/RequestsInbox.tsx` 결과가 없어야 함.
