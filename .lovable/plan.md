# 전체 특별과제 초기화

## 목적
중복 부여된 특별과제를 전부 정리하고 새로 출제할 수 있도록 클린업합니다.

## 실행할 SQL (마이그레이션)
```sql
DELETE FROM public.assignments;
```

## 삭제 대상
- `assignments` 테이블 전체 행 (현재 48건, 7명 학생, 10개 title)

## 보존되는 데이터 (영향 없음)
- `sentence_progress` — PASS/FAIL/HOLD/PENDING 학습 상태
- `sentence_attempt_logs` — 시도 기록
- `sentence_translations` — 한글 해석 제출본
- `word_test_results`, `word_pre_results` — 단어테스트 결과
- `owner_progress` — 구문분석 진행
- `points_log` — 포인트 적립 내역
- `handout_results` — 시험지 채점 결과

## 실행 후 효과
- 학생 대시보드의 모든 "특별과제" 카드 사라짐
- 새로 부여한 특별과제는 정상 노출
- 기존에 PASS한 sentence를 새 과제로 재부여하면 → 학생은 새 과제로 다시 진행 (이전 PASS 기록은 "내 학습 카드"에 그대로 보임)
- 코드 변경은 없음 (DB 데이터만 정리)

## 승인 후 절차
1. Default 모드 전환 즉시 마이그레이션 도구로 `DELETE FROM public.assignments;` 발행
2. Lovable이 마이그레이션 승인 다이얼로그를 띄움 → "Apply" 클릭
3. 삭제 후 카운트(0건) 검증
