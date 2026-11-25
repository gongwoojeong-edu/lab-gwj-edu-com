# 대명사 지시어 의무화

## 학생 화면 (해석 단계)
- 문장 속 대명사 후보(it, its, they, them, their, this, that, these, those, he, she, him, her, one 등)를 모두 목록으로 보여 줘요.
- 학생은 단어마다 셋 중 하나를 꼭 골라야 해요.
  1. **같은 문장에서 잇기**: 지금처럼 가리키는 단어를 눌러요.
  2. **[문장 밖]**: 가리키는 말을 영어로 적어요(예: the scientists).
  3. **[대명사 아님]**: 가주어 / 비인칭주어 / 강조구문 / 접속사 / 관계대명사 / 지시형용사 / 기타 중에서 골라요.
- 하나라도 처리하지 않으면 제출 버튼이 눌리지 않고, 남은 단어를 알려 줘요.
- 선생님이 정답(마스터키)을 등록하지 않은 문장에서도 똑같이 동작해요.

## 승인창 (선생님)
- 해석 아래에 "They → the scientists (문장 밖)", "It → 가주어"처럼 한 줄씩 보여 줘요.
- 틀린 것은 지금처럼 코칭 포인트로 짚어요. 따로 점수를 매기는 단계는 넣지 않아요.
- 정답이 등록된 문장이면 정답과 다른 항목에 표시를 해 줘요.

## 마스터키 등록
- 선생님도 같은 입력을 할 수 있고, 등록하면 그 문장의 정답으로 쓰여요(선택 사항).

## 범위 밖
- 예전에 제출한 해석은 그대로 두고, 새로 제출하는 해석부터 적용해요.
- 워크북 인쇄 표기는 이번에 넣지 않아요.

## Technical details
- 저장: 학생·문장별 `pronoun_referents` 테이블 신설(user_id, sentence_id, token_id, kind: in_sentence|outside|non_pronoun, target_token_id, outside_text, non_pronoun_type), RLS 본인 쓰기 + staff 읽기, GRANT 포함. 기존 referent_relations(분석 화살표)는 in_sentence 입력 시 함께 갱신.
- 후보 판별·필수 검사 규칙은 순수 모듈 `src/lib/pronounReferents.ts`에 두고 테스트 작성(후보 추출, 미처리 시 제출 차단, 문장 밖 영어 입력 검증).
- `TranslationStep.tsx`에 입력 UI, 제출 가드는 `SentenceLearn.tsx`; 승인창 표시는 `TeacherApprovalDialog.tsx`.
- 마스터키 모드에서는 저장만 하고 승인·진도 기록을 만들지 않음(masterKeyMode 규칙 유지).
