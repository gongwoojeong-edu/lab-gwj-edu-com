-- ============================================================
-- 실수로 전원 부여한 특별과제 정리
-- 김서윤 · 김나연 만 남기고, 나머지 학생 과제 행 삭제
-- 대상 제목: '%김성연 1과%' (스크린샷 기준)
-- Lovable Cloud → SQL Editor 에서 실행
-- ============================================================

-- ① 보관할 학생 확인
SELECT user_id, display_name, student_no
FROM student_profiles
WHERE display_name IN ('김서윤', '김나연');

-- ② 삭제 대상 미리보기 (개인 지정 과제)
SELECT a.id, a.title, a.student_id, p.display_name, a.sentence_id, a.created_at
FROM assignments a
LEFT JOIN student_profiles p ON p.user_id = a.student_id
WHERE a.title ILIKE '%김성연 1과%'
  AND a.student_id IS NOT NULL
  AND a.student_id NOT IN (
    SELECT user_id FROM student_profiles
    WHERE display_name IN ('김서윤', '김나연')
  )
ORDER BY a.created_at DESC;

-- ③ 전체 학생(student_id NULL) 과제 미리보기
SELECT a.id, a.title, a.sentence_id, a.created_at, a.due_at
FROM assignments a
WHERE a.title ILIKE '%김성연 1과%'
  AND a.student_id IS NULL
ORDER BY a.created_at DESC;

-- ④ 실행: 김서윤·김나연 제외한 개인 과제 삭제
DELETE FROM assignments
WHERE title ILIKE '%김성연 1과%'
  AND student_id IS NOT NULL
  AND student_id NOT IN (
    SELECT user_id FROM student_profiles
    WHERE display_name IN ('김서윤', '김나연')
  );

-- ⑤ 실행: 「전체 학생」행은 전원에게 보이므로 삭제 후,
--         김서윤·김나연 개인 과제로 다시 넣기 (이미 개인 행이 있으면 중복 주의)
-- 5-1) 전체 행을 임시로 복사해 두 학생용으로 INSERT
WITH keep AS (
  SELECT user_id, display_name
  FROM student_profiles
  WHERE display_name IN ('김서윤', '김나연')
),
all_rows AS (
  SELECT *
  FROM assignments
  WHERE title ILIKE '%김성연 1과%'
    AND student_id IS NULL
)
INSERT INTO assignments (
  teacher_id, student_id, title, description, sentence_id, unit_id,
  task_mode, due_at, include_pre, include_analysis, include_translation,
  include_wordtest, mem_direction
)
SELECT
  r.teacher_id,
  k.user_id,
  r.title,
  r.description,
  r.sentence_id,
  r.unit_id,
  r.task_mode,
  r.due_at,
  r.include_pre,
  r.include_analysis,
  r.include_translation,
  r.include_wordtest,
  r.mem_direction
FROM all_rows r
CROSS JOIN keep k
WHERE NOT EXISTS (
  SELECT 1 FROM assignments x
  WHERE x.title = r.title
    AND x.student_id = k.user_id
    AND x.sentence_id IS NOT DISTINCT FROM r.sentence_id
);

-- 5-2) 전체 학생 행 삭제
DELETE FROM assignments
WHERE title ILIKE '%김성연 1과%'
  AND student_id IS NULL;

-- ⑥ 결과 확인 — 김서윤·김나연만 남아야 함
SELECT a.title, p.display_name, a.student_id, count(*) AS rows
FROM assignments a
LEFT JOIN student_profiles p ON p.user_id = a.student_id
WHERE a.title ILIKE '%김성연 1과%'
GROUP BY a.title, p.display_name, a.student_id
ORDER BY a.title, p.display_name;
