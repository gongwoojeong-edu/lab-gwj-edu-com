# 클로드 import 통합 개선 (버그 수정 + 계층 구조 확장)

## 배경

두 가지 문제를 한 번에 해결합니다:

1. **권한 체크 버그** — `gwj0000` 계정은 user_roles에 student/teacher/admin 3행이 있어 `.maybeSingle()`이 에러를 던지고 "토큰 소유자가 더 이상 교사가 아닙니다" 오류 반환. 실제로는 권한 멀쩡함.
2. **계층 구조 미지원** — 현재 페이로드는 level/series/volume/unit 지정 불가 → 모든 지문이 L01에 한 덩어리로 들어감.

## 변경 사항

### 1. `supabase/functions/import-claude-handout/index.ts`

#### (a) 권한 체크 수정
`.maybeSingle()` → `.limit(1)`로 변경. 한 사용자가 여러 역할을 가져도 안전하게 통과.

```typescript
const { data: roleRows } = await admin
  .from("user_roles")
  .select("role")
  .eq("user_id", teacherId)
  .in("role", ["teacher", "admin"])
  .limit(1);
if (!roleRows || roleRows.length === 0)
  return json({ ok: false, error: "토큰 소유자가 더 이상 교사가 아닙니다" }, 403);
```

#### (b) 페이로드 확장 — 계층 구조 자동 매칭

새 필드 (모두 옵션, 미지정 시 기존 동작 유지):

| 필드 | 예시 | 설명 |
|---|---|---|
| `level` | `"L08"` | L01~L10. 없으면 L01 |
| `series_title` | `"모의고사"` | 같은 (level, title)이면 재사용 |
| `series_no` | `1` | 정렬용 (옵션) |
| `volume_title` | `"2026년 3월"` | 같은 (series_id, title)이면 재사용 |
| `volume_no` | `1` | 정렬용 (옵션) |
| `unit_title` | `"263모고32"` | **지문별로 다르게 보내야 별도 유닛 생성** |
| `unit_no` | `260332` | 정렬용 |
| `passage_no` | `1` | 유닛 내 지문 번호 (없으면 자동) |
| `item_code` | `"263모고32-1"` | 지문 고유 코드 |

#### (c) 매칭 로직 (제목 우선, 번호 폴백)

- **Series**: `level + series_title` → 없으면 `level + series_no` → 없으면 신규 생성
- **Volume(Textbook)**: `series_id + volume_title` → 없으면 `series_id + volume_no` → 없으면 신규 생성
- **Unit**: `textbook_id + unit_title` → 없으면 `textbook_id + unit_no` → 없으면 신규 생성

같은 `unit_title`로 여러 번 호출하면 **같은 유닛에 지문이 누적**되고, 다른 유닛명이면 **새 유닛 생성**.

#### (d) item_code/passage code 처리 개선

`item_code`가 명시되면 그대로 `code`로 사용 (전역 유일 검사 후 충돌 시 -2, -3 자동 부여).

### 2. `src/pages/teacher/Integrations.tsx` — 안내 문서 갱신

교사가 클로드에 붙여넣을 JS 스니펫을 새 필드 포함 버전으로 교체:

```javascript
fetch(`${SUPABASE_URL}/functions/v1/import-claude-handout`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    level: "L08",                 // L01~L10
    series_title: "모의고사",       // 시리즈명
    volume_title: "2026년 3월",    // 권명
    unit_title: "263모고32",       // 유닛명 (지문별로 다르게!)
    unit_no: 260332,
    item_code: "263모고32-1",
    passage: "...영문 본문...",
    analysis_html: "...",
    structure_html: "...",
  }),
});
```

상세 필드 표 + **"지문이 3개면 unit_title을 다르게 해서 3번 호출하세요"** 안내 추가.

### 3. 기존 잘못 들어간 데이터 (L01의 `2026년 고1 모의고사`)

마이그레이션으로 **삭제** 처리 (CASCADE로 권/유닛/지문/스토리지 메타 자동 정리). 사용자가 클로드에서 새 형식으로 다시 전송하면 L08에 정상 누적됨.

```sql
-- L01에 잘못 들어간 시리즈 통째 삭제
DELETE FROM textbook_series 
WHERE level = 'L01' AND title = '2026년 고1 모의고사';
```

(textbook_units에 FK CASCADE가 설정되어 있지 않을 수 있어 마이그레이션에서 단계적으로 삭제)

## 변경 파일 (3개)

1. `supabase/functions/import-claude-handout/index.ts` — 권한 버그 수정 + 계층 매칭 로직 확장
2. `src/pages/teacher/Integrations.tsx` — 안내 스니펫과 필드 설명 갱신
3. DB 마이그레이션 1회 — L01 잘못 들어간 데이터 정리

## 검증 방법

배포 후 (엣지 함수는 자동 배포):

1. **버그 수정 확인** — 기존 `GWJ_IMPORT_KEY` 토큰으로 클로드에서 전송 → "토큰 소유자가…" 에러가 사라지는지 확인
2. **계층 구조 확인** — `level: "L08", series_title: "모의고사", volume_title: "2026년 3월", unit_title: "263모고42"` 로 테스트 → 책장 → L08 → 모의고사 → 2026년 3월에 `263모고42` 유닛이 생기는지
3. **누적 동작** — 같은 `unit_title`로 두 번째 지문 전송 → 같은 유닛에 누적
4. **분리 동작** — 다른 `unit_title`(`263모고43`)로 전송 → 새 유닛 생성
