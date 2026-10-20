# Architecture rules
- Deliver open teaching questions through a student-scoped global listener independent of teaching sessions and the current sentence; refresh on subscription/reconnect and focus so questions sent for earlier sentences remain reachable.
- Store student-specific important sentence designations in student_passage_overrides and read them through importantSentences.ts; this preserves flags across approval attempts and shares one source with workbook generation.
- Keep teacher evaluation grade labels/colors in src/lib/gradeMeta.ts (a pure module with no DB or auth imports); on-screen badges and print templates both read from it, so a printed workbook can never show a grade wording the app doesn't use.
