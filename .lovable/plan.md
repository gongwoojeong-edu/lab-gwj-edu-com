

## 두 가지 변경 — 지문 필수화 + 정답 비교 위치 안내

### 1. 과제 생성 시 "지문 연결" 필수화

**`src/pages/teacher/Assignments.tsx`**
- `validateForm()`에서 `sentence_id`가 없으면 `"지문을 반드시 연결해야 과제를 생성할 수 있습니다"` 에러 반환 → 저장 차단.
- "지문 선택" 영역을 빨간 별표(*)로 필수 표시.
- 편집 다이얼로그(`handleUpdate`)도 동일하게 필수화 — 기존 sentence_id null 행을 빈값으로 저장 방지.
- 기존 sentence_id가 null인 과제 카드에는 "⚠ 지문 미연결 — 편집해서 연결하세요" 경고 배지 + 인라인 "편집" 버튼 표시.

### 2. "정답(마스터키) 비교" 화면 — 어디서 보는지

현재 마스터 정답을 학생/선생님이 볼 수 있는 화면은 **이미 다 구현되어 있습니다**. 위치 정리:

#### 학생 측

| 화면 | 위치 | 동작 |
|---|---|---|
| 학생 홈 (`/`) — 최근 학습 카드 | `StudentHome.tsx` | 분석 일치율이 임계값 미만 또는 PASS 후에 **"정답 비교 요청"** 버튼 노출 → 선생님 승인 시 같은 카드에 **"정답보기"** 녹색 버튼으로 전환 |
| 정답 비교 화면 (`/review/:sentenceId`) | `AnalysisReview.tsx` | 승인된 경우 **마스터 분석본 vs 내 분석본**을 좌우로 표시. 미승인 시 "승인 전" 안내 |

#### 선생님 측 — 정답(마스터) 비교/관리 위치

| 화면 | 경로 | 용도 |
|---|---|---|
| **정답비교 요청 대기열** | `/teacher/analysis-requests` (`AnalysisRequests.tsx`) | 학생이 보낸 요청 목록. 승인/거절. 사이드바 "정답비교 요청"에서 진입. 빨간 알림 배지로 카운트 표시 |
| **개별 요청 상세 검토** | `/teacher/analysis-review/:id` (`TeacherAnalysisReview.tsx`) | 한 학생의 분석 결과를 **마스터답안과 텍스트 표로 대조** |
| **시각 비교 뷰** *(이번 단계에서 새로 추가됨)* | `/teacher/compare/:sentenceId/:studentId` (`AnalysisCompare.tsx`) | **분석 그래픽 그대로** 마스터 vs 학생 좌우 병렬. 빨강 음영 자동 + 수동 토글. 인쇄 가능 |
| **학생본 핸드아웃** *(이번 단계에서 새로 추가됨)* | `/teacher/handout/analysis/:sentenceId/:studentId?mode=marked\|blank` (`AnalysisHandout.tsx`) | 학생본만 인쇄 (채점 표시 / 백지 모드) |
| **학생 이력 시트** | 학생 관리 화면(`TeacherStudents.tsx`)에서 학생 행 클릭 → `StudentHistorySheet.tsx` | 최근 시도 로그의 각 행에 **"👁 비교"** 버튼 → 시각 비교 뷰로 진입 |

#### 진입 동선 추가 (Phase 2 잔여분 — 이번에 같이 처리)

지금은 시각 비교 뷰로 가는 입구가 `StudentHistorySheet.tsx`에만 있어 발견하기 어려움. 다음 두 곳에 **"🖼 시각 비교"** 버튼 추가:

| 파일 | 추가 위치 |
|---|---|
| `src/pages/teacher/AnalysisRequests.tsx` | 각 요청 카드의 액션 행 ("거절/승인" 옆) |
| `src/pages/teacher/TeacherAnalysisReview.tsx` | 헤더 바 ("뒤로가기" 옆) |

각 버튼 클릭 → `/teacher/compare/:sentenceId/:studentId` 새 탭/이동.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/teacher/Assignments.tsx` | sentence_id 필수 검증(생성·편집), 필수 표시, 미연결 행 경고 배지 |
| `src/pages/teacher/AnalysisRequests.tsx` | "🖼 시각 비교" 버튼 추가 |
| `src/pages/teacher/TeacherAnalysisReview.tsx` | "🖼 시각 비교" 버튼 추가 |

### 비고

- 기존 sentence_id가 null인 과제(예: "L08 S1 한글해석") 자체는 자동 정리하지 않음 — 선생님이 편집해서 지문을 연결하거나 삭제하도록 경고만 표시.
- 정답 비교 자체의 신규 화면은 만들 필요 없음. **이미 구현되어 있는 4개 화면**(요청 대기열 / 텍스트 표 검토 / 시각 비교 / 핸드아웃)의 진입 동선만 보강.
- DB 스키마 변경 없음. RLS 그대로.

