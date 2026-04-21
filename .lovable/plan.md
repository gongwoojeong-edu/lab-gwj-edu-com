

## 단어HO / 구문HO 분리 입력 — 마무리 작업

직전 대화에서 "정답 대조 요청 진입 경로"만 처리되고, 그 전에 승인됐던 **단어HO/구문HO 컬럼 분리**는 코드 반영이 누락된 상태입니다. 아래 작업으로 마무리합니다.

### 변경 사항

**1. 신규 컴포넌트 — `src/components/teacher/WordHoInput.tsx`**
- 숫자 입력만 담당 (`<Input type="number" min=0 max=100>`)
- `onBlur` + `Enter`로 자동 저장 (`upsertHandoutResult`의 `wordHoScore`만 갱신)
- Enter 시 다음 학생의 단어HO 칸으로 포커스 이동 (`registerInput` / `onEnterNext` 유지)
- 80점 미만 입력 시 입력 칸 테두리 amber + 우측에 작은 "재시" 텍스트 힌트
- 저장 상태: `Loader2` / `Check` 아이콘 자체 표시

**2. 신규 컴포넌트 — `src/components/teacher/SyntaxHoToggle.tsx`**
- `[P]` / `[F]` 토글 버튼만 담당
- 클릭 시 `upsertHandoutResult`의 `syntaxHoResult`만 갱신
- 같은 값 재클릭 시 해제(null)
- 저장 상태 인디케이터 자체 표시

**3. `src/pages/teacher/TeacherHome.tsx` 테이블 헤더/행 변경**

```text
이전: | 학번 | 이름 | 현재 진행 | 단어HO / 구문HO        |
이후: | 학번 | 이름 | 현재 진행 | 단어HO (≥80) | 구문HO (P/F) |
```

- 헤더를 두 컬럼으로 분리, 각 컬럼에 작은 부제 추가
- 행 안에서 `<WordHoInput>` 과 `<SyntaxHoToggle>`를 각 셀에 배치
- `inputRefs` / `registerInput` / `focusNext`는 **단어HO 전용**으로 유지 → 한 컬럼을 위→아래로 빠르게 채운 뒤, 구문HO를 마우스로 토글하는 2단계 워크플로우

**4. 정리**
- `src/components/teacher/HandoutInputRow.tsx` 삭제
- `src/pages/TeacherDashboard.tsx`(deprecated)에서도 동일하게 두 컴포넌트로 교체 → import 깨짐 방지

### 작업 순서
1. `WordHoInput.tsx` 신규 작성
2. `SyntaxHoToggle.tsx` 신규 작성
3. `TeacherHome.tsx` 헤더·행을 두 컬럼으로 재구성
4. `TeacherDashboard.tsx`도 동일하게 교체
5. `HandoutInputRow.tsx` 삭제
6. 검증: `/teacher`에서 단어HO 입력 → Enter로 다음 학생 단어HO로 포커스 이동 → 구문HO P/F 토글 → 자동 저장·진행률 카운트 정상 반영

### 기술 메모
- DB 스키마, RLS, `upsertHandoutResult`(부분 업데이트 지원) 모두 변경 없음
- 두 컴포넌트가 각자 `onSaved(row)`로 부모에 결과 전달 → 부모 `handoutMap` 머지 로직은 그대로

