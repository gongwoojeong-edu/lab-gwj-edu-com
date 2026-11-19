/**
 * 첨삭 질문에 이미 답한 문장으로 다시 들어왔을 때 곧바로 다음 진도로 넘길지 판단한다.
 * 재학습("다시 하기")으로 들어왔거나 재학습 요청이 걸린 문장은 통과(pass) 상태여도
 * 이 문장에 머물러야 한다. 넘겨 버리면 학생은 재학습 대신 진행 중이던 다른 문장을 보게 된다.
 */
export const shouldSkipPassedQnaSentence = (input: {
  status: string | null | undefined;
  redoRequestedAt: string | null | undefined;
  restart: boolean;
}): boolean => input.status === "pass" && !input.restart && !input.redoRequestedAt;
