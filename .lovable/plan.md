

## 명사절(접SV) 분석 메뉴 리팩터링

### 변경 요약

명사 → 접SV 형태 선택 시 현재 5개 그룹(헤더+버튼) 구조를 **플랫 단일 버튼 18개**로 변경. 각 버튼 라벨이 그대로 부배지에 노출되도록 `that(주어)` 형식으로 통합 표기.

### 작업 내역

**파일: `src/components/analyzer/AnalysisPanel.tsx`**

`FORM_ONLY_ROLES["접SV"]` 정의를 다음과 같이 변경:

기존 (5 그룹 × 4 항목 = 20):
```
that / whether-if / 의SV / 관대what / 복합관대~ever  
  → 각각 [주어, 목적어, 보어, 전목적어]
```

변경 후 (플랫 18개 단일 문자열):
```
"that(주어)", "that(목적어)", "that(보어)",
"동격that(주어)", "동격that(목적어)", "동격that(보어)",
"whether/if(주어)", "whether/if(목적어)", "whether/if(보어)",
"의SV(주어)", "의SV(목적어)", "의SV(보어)",
"관대what(주어)", "관대what(목적어)", "관대what(보어)",
"복합관대~ever(주어)", "복합관대~ever(목적어)", "복합관대~ever(보어)"
```

- **모든 "전목적어" 제거**.
- **"동격that" 3종 신규 추가**.
- 헤더 그룹 구조 제거 → `RoleRow`는 단일 버튼만 렌더링 (기존 `typeof option === "string"` 분기 그대로 동작).

### 기대 동작

- `RoleRow` 컴포넌트가 18개 버튼을 한 줄(또는 자동 줄바꿈)로 평탄 렌더.
- 사용자가 `that(주어)` 클릭 → `noun.role = "that(주어)"` 저장.
- `labels.ts` `buildSubBadgeLabel`이 현행 로직 그대로 `role.replace(/\s+/g, "")` 반환 → 부배지에 `that(주어)` 노출.
- SVOC 하단 배지: `labels.ts` 현행 분기상 접SV의 noun.element가 비어 있으면 SVOC 배지 미표시 — 부배지만 노출되어 사용자 의도와 일치.

### 영향도

- DB 스키마/마이그레이션 변경 없음.
- 기존 사용자가 저장한 데이터(`role: "주어"` 등 헤더 분리형) 호환성: 기존 답안은 그대로 유지되나 신규 답안부터 새 라벨 적용. 별도 마이그레이션 불필요.
- `Index.tsx`, `labels.ts`, `analysisGrading.ts`는 수정 불필요 (role 문자열만 바뀜).

### 비고

이번 턴은 메뉴 라벨 리팩터링만 수행. Phase 3(다중 절 깊이 시각화) 및 Phase 2(레벨 DB)는 다음 턴 진행.

