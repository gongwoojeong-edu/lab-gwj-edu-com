import { z } from "zod";

export const STUDENT_NO_RE = /^gwj\d{4}$/;
const DOMAIN = "gwj.local";

export const studentNoToEmail = (no: string) => `${no.toLowerCase()}@${DOMAIN}`;

export const signupSchema = z.object({
  studentNo: z.string().trim().toLowerCase().regex(STUDENT_NO_RE, "학번은 gwj+숫자4자리 형식이어야 합니다 (예: gwj0001)"),
  displayName: z.string().trim().min(1, "이름을 입력하세요").max(40),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다").max(72),
});

export const loginSchema = z.object({
  studentNo: z.string().trim().toLowerCase().regex(STUDENT_NO_RE, "학번은 gwj+숫자4자리 형식이어야 합니다"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
});
