
## 목표
문장암기 트랙에 **동시통역**(음성 즉시 반대 언어 발화)과 **번역**(타이핑) 단계를 추가한다. 두 단계는 **선생님이 유닛/과제 설정에서 선택**해야만 활성화된다(기본 OFF, 기존 학생에 영향 없음).

## 새 순서 (기본 → 선택단계 삽입)
```text
A 듣기 → B 어순배열 → C 빈칸(cloze) → D 받아쓰기
        → [G 동시통역]  (선택 옵션, 임계값 60%)
        → [H 번역]      (선택 옵션, ko→en 100% 일치 / en→ko 유사도 75%)
        → E 발화(Azure) → [F 녹음]
```
- 배열 · 받아쓰기 · 동시통역 · 번역 순서는 사용자 요청대로 D 뒤에 G/H 삽입.
- 기존 발화·녹음은 마지막 단계로 유지(발음/음질 확인은 최종 컨펌 성격).

## 채점 규칙
- **동시통역 (G)**: STT(Azure/브라우저) 결과 vs 반대 언어 정답. 유사도 ≥ **60%** 통과. 방향은 현재 트랙(ko_to_en / en_to_ko)의 **반대**로 발화.
- **번역 (H)**: 타이핑 입력.
  - `ko_to_en` 트랙: 영문 100% 일치 (기존 `dictationPassEn` 재사용, 아포스트로피/대소문자 정규화만 허용)
  - `en_to_ko` 트랙: 한글 유사도 ≥ 75% (`dictationPassKo` 임계값 조정 재사용)

## 분석 트랙 번역과의 관계
- **완전 별도**. 분석 트랙 `TranslationStep`(선생님 승인형)은 그대로 유지.
- 이 단계는 자동채점·즉시 통과. 승인 워크플로 없음.

## DB 마이그레이션
`textbook_units` 컬럼 추가:
- `mem_include_interpret boolean default false`
- `mem_include_translate boolean default false`

`assignments` 컬럼 추가(과제별 override):
- `mem_include_interpret boolean`
- `mem_include_translate boolean`

`sentence_progress` 컬럼 추가:
- `mem_interpret_done boolean default false`
- `mem_translate_done boolean default false`
- `mem_interpret_score int`
- `mem_translate_score int`

## 새 파일
- `src/components/learning/memorization/MemInterpretStep.tsx` — 오디오 재생 후 마이크 녹음 → Azure STT → 유사도 판정.
- `src/components/learning/memorization/MemTranslateStep.tsx` — 타이핑 입력창 → 정답 대조.

## 수정 파일
- `src/lib/memorizationProgress.ts` — `MemStep`에 `interpret`, `translate` 추가; 플래그·필수단계·리셋 로직 확장.
- `src/lib/fetchMemSettings.ts` — `includeInterpret`, `includeTranslate` resolve (유닛 → 과제 override).
- `src/pages/MemorizeLearn.tsx` — 새 순서/조건부 렌더링.
- `src/components/learning/memorization/MemStepProgressBar.tsx` — 진행바에 옵션 단계 노드 추가.
- `src/pages/teacher/BookshelfUnit.tsx` — "암기 설정"에 두 개의 체크박스(동시통역 포함 / 번역 포함).
- `src/pages/teacher/Assignments.tsx` — 과제 발행 시 두 옵션 선택 UI(선택시 유닛 기본값 덮어씀).

## 완료 판정
- `requiredMemSteps()`가 옵션 단계를 포함하도록 확장 → 모든 필수단계 통과 시 `mem_passed_at` 세팅. 회독 리셋도 새 플래그를 함께 초기화.

## 리스크 / 검토
- STT는 마이크 권한 필요. 실패 시 "타이핑 대체 입력" fallback 제공.
- 기존 진행중인 학생은 두 옵션 기본 OFF라 영향 없음.
- 문장이 매우 짧으면(1~2단어) 번역 100% 요구가 가혹할 수 있어, ko→en도 아포스트로피/공백/대소문자 정규화 후 완전일치로 판정(오탈자 여유 없음).

---
승인해 주시면 마이그레이션부터 순차 진행하겠습니다.
