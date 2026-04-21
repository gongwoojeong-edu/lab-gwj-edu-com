

## 배주한 학생 진행 위치를 고1 s1으로 설정

### 현재 상태
DB 조회 결과 — 배주한 학생:
- `start_level: L01`
- `current_level: L10` ← 데이터에 없는 레벨을 가리킴
- `current_no: 1`

이로 인해 현재 학생 화면에서 학습할 지문을 못 찾고 있을 가능성이 높습니다.

### 변경 내용
`student_profiles` 테이블의 배주한 행(`user_id: 060beb9c-d432-43bd-bc82-34384ff91f96`)을 다음 값으로 업데이트:

| 컬럼 | 기존값 | 변경값 |
|---|---|---|
| `start_level` | L01 | **L08** |
| `current_level` | L10 | **L08** |
| `current_no` | 1 | **1** (그대로, s1 가리킴) |

### 적용 방법
`UPDATE` 작업이므로 마이그레이션 파일 한 개를 작성해 실행합니다:

```sql
UPDATE public.student_profiles
SET start_level = 'L08',
    current_level = 'L08',
    current_no = 1
WHERE user_id = '060beb9c-d432-43bd-bc82-34384ff91f96';
```

### 결과
배주한 학생이 다음 로그인 시 학생 메인화면에서 **고1 / s1 · Passage 1** (Radio provided the driving force...) 지문을 학습 시작 카드에 보게 됩니다.

