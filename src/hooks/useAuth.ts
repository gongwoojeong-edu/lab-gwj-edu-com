import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAuthSnapshot,
  subscribeAuthState,
  type AppRole,
  type AuthSnapshot,
} from "@/lib/authState";
// D(cacheCleanup) 비활성화: signOut 내부에서 getUser() 호출이 supabase auth lock과 충돌하여
// "Lock not released within 5000ms / Lock broken by another request" 에러를 유발했음.
// 학생 모드는 이미 cloud-only로 전환되어 LS 잔재 노출 위험이 낮으므로 임시 보류.
// import { purgeAllGwjKeysForUser } from "@/lib/cacheCleanup";

export type { AppRole };

export const useAuth = (): AuthSnapshot =>
  useSyncExternalStore(subscribeAuthState, getAuthSnapshot, getAuthSnapshot);

export const signOut = async () => {
  // 로그아웃 직전 현재 user의 gwj.* localStorage 키 일괄 정리.
  // (공용 PC에서 다른 학생 로그인 시 잔재 노출 방지)
  // D(cacheCleanup) 비활성화: getUser() + LS 변형이 auth lock과 충돌함.
  return supabase.auth.signOut();
};
