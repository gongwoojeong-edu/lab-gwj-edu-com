-- ============================================================
-- 「김성연 1과 3rd」 전체학생 과제 → 김서윤·김나연만 남기기
-- Lovable Cloud → SQL Editor 에서 실행
--
-- 확인된 현황 (2026-07-20):
--   title = '김성연 1과 3rd'
--   student_id = NULL (전체 학생) × 9지문
--   sentence_id = 3-1-alt2-1 … 3-1-alt2-9
-- ============================================================

-- ① 보관할 학생 확인 (인동고1)
SELECT user_id, display_name, student_no, school_name, actual_grade
FROM student_profiles
WHERE display_name IN ('김서윤', '김나연');

-- ② 대상 과제 미리보기
SELECT a.id, a.title, a.student_id, p.display_name, a.sentence_id, a.created_at
FROM assignments a
LEFT JOIN student_profiles p ON p.user_id = a.student_id
WHERE a.title = '김성연 1과 3rd'
ORDER BY a.sentence_id, p.display_name NULLS FIRST;

-- ③ 전체 학생 행 → 김서윤·김나연 개인 과제로 복제
WITH keep AS (
  SELECT user_id
  FROM student_profiles
  WHERE display_name IN ('김서윤', '김나연')
),
all_rows AS (
  SELECT *
  FROM assignments
  WHERE title = '김성연 1과 3rd'
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

-- ④ 전체 학생 행 삭제
DELETE FROM assignments
WHERE title = '김성연 1과 3rd'
  AND student_id IS NULL;

-- ⑤ 혹시 다른 학생에게 개인 지정된 행이 있으면 삭제
DELETE FROM assignments
WHERE title = '김성연 1과 3rd'
  AND student_id IS NOT NULL
  AND student_id NOT IN (
    SELECT user_id FROM student_profiles
    WHERE display_name IN ('김서윤', '김나연')
  );

-- ⑥ 결과 확인 — 김서윤·김나연만, 지문 9개씩
SELECT p.display_name, count(*) AS passage_rows
FROM assignments a
JOIN student_profiles p ON p.user_id = a.student_id
WHERE a.title = '김성연 1과 3rd'
GROUP BY p.display_name
ORDER BY p.display_name;
