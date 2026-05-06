// ============================================================
// LearnCompare — 학생 본인의 답안을 마스터키와 비교 (정답 확인)
// 라우트: /learn/compare/:sentenceId
// AnalysisCompare 컴포넌트를 본인 user_id로 재사용한다.
// ============================================================
import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getCurrentUserId } from "@/lib/authState";
import AnalysisCompare from "@/pages/teacher/AnalysisCompare";

const LearnCompare = () => {
  const { sentenceId } = useParams<{ sentenceId: string }>();
  const [uid, setUid] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((userId) => {
      if (!cancelled) setUid(userId);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sentenceId) return <Navigate to="/learn" replace />;
  if (uid === undefined) return null;
  if (!uid) return <Navigate to="/login" replace />;

  // AnalysisCompare는 useParams에서 sentenceId/studentId를 읽으므로
  // 위치를 본인 비교 경로로 바꿔 컴포넌트가 동작하도록 wrapper로 라우터를 흉내내기 어려움.
  // 가장 간단한 방법: 그 경로(/teacher/compare/:sid/:uid)로 리다이렉트.
  return <Navigate to={`/teacher/compare/${encodeURIComponent(sentenceId)}/${uid}`} replace />;
};

export default LearnCompare;
