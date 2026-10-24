# Architecture rules
- Keep automatic vocabulary difficulty and lemma-based per-unit repetition policy in extract-sentence-words/vocabularyPolicy.ts; resolve grade from the stored textbook and enforce limits in passage order so manual and import-triggered extraction share the same policy.
- Keep held coaching assignee in sentence_approvals.held_teacher_id independently of held_by; teacher inboxes filter the assignee without changing existing staff access or student progression.
- Count learning-result sentences from dated student submissions/attempts, deduplicated per student and category; never count approval decisions, print actions or historical unit-context rows as new learning.
- Deliver open teaching questions through a student-scoped global listener independent of teaching sessions and the current sentence; refresh on subscription/reconnect and focus so questions sent for earlier sentences remain reachable.
- Store student-specific important sentence designations in student_passage_overrides and read them through importantSentences.ts; this preserves flags across approval attempts and shares one source with workbook generation.
- Keep teacher evaluation grade labels/colors in src/lib/gradeMeta.ts (a pure module with no DB or auth imports); on-screen badges and print templates both read from it, so a printed workbook can never show a grade wording the app doesn't use.
