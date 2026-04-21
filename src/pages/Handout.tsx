// ============================================================
// Handout — B5 학습지 인쇄 페이지 (흑백 최적화)
// 라우트: /teacher/handout/:passageCode  또는  /learn/handout/:passageCode
// 쿼리:   ?student=:userId  (선택) → 해당 학생의 한글 해석 자동 표기
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchPassageByCode, type Passage } from "@/lib/textbooks";
import { markPrintRequestHandled } from "@/lib/printRequests";
import { ensureHandoutRow, toIsoDate } from "@/lib/handoutResults";
import { buildClozeSegments, buildStructureHint } from "@/lib/handoutCloze";

interface StudentInfo {
  display_name: string | null;
  student_no: string;
}

const HandoutPage = () => {
  const { passageCode } = useParams<{ passageCode: string }>();
  const [params] = useSearchParams();
  const studentId = params.get("student");
  const fromQueue = params.get("fromQueue") === "1";
  const reqId = params.get("reqId");
  const autoprint = params.get("autoprint") === "1";

  const [passage, setPassage] = useState<Passage | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [studentTranslation, setStudentTranslation] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!passageCode) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const p = await fetchPassageByCode(passageCode);
      if (!alive) return;
      setPassage(p);
      if (studentId) {
        const [{ data: prof }, { data: tr }] = await Promise.all([
          supabase
            .from("student_profiles")
            .select("display_name, student_no")
            .eq("user_id", studentId)
            .maybeSingle(),
          supabase
            .from("sentence_translations")
            .select("text")
            .eq("sentence_id", passageCode)
            .eq("user_id", studentId)
            .maybeSingle(),
        ]);
        if (!alive) return;
        if (prof) setStudent(prof as StudentInfo);
        if (tr?.text) setStudentTranslation(tr.text as string);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [passageCode, studentId]);

  // ===== 인쇄대기열에서 진입 시: 실제 인쇄 직전에 처리완료 자동 마킹 =====
  useEffect(() => {
    if (!fromQueue || !reqId || !studentId) return;
    let handled = false;
    const onBeforePrint = () => {
      if (handled) return;
      handled = true;
      // fire-and-forget: 인쇄 흐름을 막지 않음
      Promise.all([
        markPrintRequestHandled(reqId),
        ensureHandoutRow(studentId, null, toIsoDate(new Date())),
      ]).catch((e) => console.error("[Handout] auto-mark failed", e));
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [fromQueue, reqId, studentId]);

  const segments = useMemo(
    () => (passage ? buildClozeSegments(passage.tokens) : null),
    [passage],
  );
  const structureHint = useMemo(
    () => (passage ? buildStructureHint(passage.tokens) : null),
    [passage],
  );

  const printedAt = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  if (!passage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-3">지문을 찾을 수 없습니다.</p>
          <Link to="/teacher/bookshelf" className="text-primary underline text-sm">
            책장으로
          </Link>
        </div>
      </div>
    );
  }

  const audioUrl = `https://lab.gwj-edu.com/learn/sentence/${passage.code}?audio=1`;

  return (
    <div className="handout-root bg-muted/40 min-h-screen">
      <style>{`
        @page { size: B5 portrait; margin: 10mm; }
        .handout-page {
          width: 162mm;
          min-height: 237mm;
          background: white;
          color: black;
          padding: 0;
          margin: 16px auto;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
          font-family: 'Noto Sans KR', 'Plus Jakarta Sans', system-ui, sans-serif;
          font-size: 10.5pt;
          display: flex;
          flex-direction: column;
        }
        .handout-section { border-bottom: 0.5pt solid #000; padding: 3mm 4mm; }
        .handout-section:last-child { border-bottom: none; }
        .handout-section-title {
          font-size: 9pt; font-weight: 700;
          margin-bottom: 2mm; letter-spacing: 0.02em;
          display: flex; align-items: center; gap: 4mm;
          color: hsl(var(--primary));
          border-left: 2pt solid hsl(var(--primary));
          padding-left: 2mm;
        }
        .handout-section-title .hint {
          font-weight: 400; font-size: 8.5pt; color: #444;
        }
        .cloze-box {
          display: inline-block;
          border: 1pt solid #000;
          padding: 0.5mm 1.5mm;
          margin: 0 0.5mm;
          font-weight: 600;
          white-space: nowrap;
        }
        .passage-text {
          line-height: 2.5;
          font-size: 11pt;
          letter-spacing: 0.01em;
          word-spacing: 0.5mm;
        }
        .translation-box {
          min-height: 26mm;
          border: 0.5pt dashed #555;
          padding: 2mm;
          font-size: 10pt;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .feedback-box {
          min-height: 14mm;
          border: 0.5pt dashed #555;
          padding: 2mm;
          font-size: 10pt;
          line-height: 1.6;
          margin-top: 2mm;
          white-space: pre-wrap;
        }
        .feedback-label {
          font-size: 8.5pt; font-weight: 700; margin-bottom: 1mm;
        }
        .handout-grid {
          min-height: 38mm;
          background-image:
            linear-gradient(#bbb 0.3pt, transparent 0.3pt),
            linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
          background-size: 4mm 4mm;
          border: 0.5pt solid #000;
          padding: 2mm;
        }
        .write-lines {
          display: flex; flex-direction: column; gap: 6mm;
          padding-top: 4mm;
        }
        .write-line { border-bottom: 0.5pt solid #000; height: 0; }
        .header-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 4mm; padding: 3mm 4mm;
          border-bottom: 2.5pt solid hsl(var(--primary));
        }
        .header-info { flex: 1; font-size: 9pt; line-height: 1.5; }
        .header-eyebrow {
          font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em;
          color: hsl(var(--primary)); text-transform: uppercase;
          margin-bottom: 0.5mm;
        }
        .header-title { font-size: 13pt; font-weight: 800; margin-bottom: 1mm; }
        .header-meta { color: #333; }
        .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
        .qr-label { font-size: 7pt; color: #333; }
        .gist-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 4mm;
        }
        .toolbar {
          position: sticky; top: 0; z-index: 10;
          background: hsl(var(--background));
          border-bottom: 1px solid hsl(var(--border));
          padding: 8px 16px;
          display: flex; align-items: center; gap: 8px;
        }
        .editable {
          outline: none;
        }
        .editable:focus {
          background: rgba(255, 255, 0, 0.1);
        }

        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .handout-root { background: white !important; padding: 0 !important; min-height: 0 !important; }
          .handout-page {
            margin: 0 !important;
            box-shadow: none !important;
            width: 100%;
            min-height: 0;
            page-break-after: always;
          }
          .editable:focus { background: white !important; }
        }
      `}</style>

      <div className="toolbar no-print">
        <Link to="/teacher/bookshelf">
          <Button size="sm" variant="ghost">
            <ArrowLeft className="size-4 mr-1" /> 책장
          </Button>
        </Link>
        <div className="text-sm text-muted-foreground flex-1">
          B5 Hand-out · {passage.code}
        </div>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4 mr-1" /> 인쇄
        </Button>
      </div>

      {/* ===== Page 1 ===== */}
      <div className="handout-page">
        {/* Header */}
        <div className="header-row">
          <div className="header-info">
            <div className="header-eyebrow">Gongwoojeong · Hand-out</div>
            <div className="header-title">공우정바른학원 · 영어 학습지</div>
            <div className="header-meta">
              {passage.code}
              {structureHint && <> · 핵심 흐름: {structureHint}</>}
            </div>
            <div className="header-meta">
              학생:{" "}
              <span className="editable" contentEditable suppressContentEditableWarning>
                {student?.display_name ?? ""}
              </span>{" "}
              {student?.student_no && <>({student.student_no})</>}
              {!student && (
                <>
                  {" "}
                  / 학번:{" "}
                  <span className="editable" contentEditable suppressContentEditableWarning>
                    　　　　
                  </span>
                </>
              )}
            </div>
            <div className="header-meta">출력: {printedAt} · 1 / 2</div>
          </div>
          <div className="qr-wrap">
            <QRCodeSVG value={audioUrl} size={68} level="M" />
            <div className="qr-label">🎧 MP3</div>
          </div>
        </div>

        {/* ① 지문 (어법 선택형) */}
        <div className="handout-section" style={{ flex: "0 0 auto" }}>
          <div className="handout-section-title">
            ① 지문
            <span className="hint">
              {segments && segments.some((s) => s.kind === "cloze")
                ? "괄호 안의 어법 중 알맞은 것을 고르고, 구문 기호로 분석하세요."
                : "구문 기호로 분석하세요. (어법 표시 없음)"}
            </span>
          </div>
          <div className="passage-text">
            {segments
              ? segments.map((seg, i) =>
                  seg.kind === "cloze" && seg.choices ? (
                    <span key={i}>
                      <span className="cloze-box">
                        [ {seg.choices[0]} / {seg.choices[1]} ]
                      </span>{" "}
                    </span>
                  ) : (
                    <span key={i}>{seg.text} </span>
                  ),
                )
              : passage.english}
          </div>
        </div>

        {/* ② 한글 해석 + 첨삭 */}
        <div className="handout-section" style={{ flex: "1 1 auto" }}>
          <div className="handout-section-title">② 한글 해석</div>
          <div className="translation-box">{studentTranslation || " "}</div>
          <div className="feedback-label no-print">
            ✎ 첨삭 (인쇄 직전 입력 — 저장되지 않음)
          </div>
          <textarea
            className="feedback-box no-print w-full resize-none"
            placeholder="여기에 첨삭 메모를 입력하면 인쇄물에 함께 출력됩니다."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          {/* 인쇄용 첨삭 박스 */}
          <div className="hidden print:block">
            <div className="feedback-label">✎ 첨삭</div>
            <div className="feedback-box">{feedback || " "}</div>
          </div>
        </div>
      </div>

      {/* ===== Page 2 ===== */}
      <div className="handout-page">
        <div className="header-row">
          <div className="header-info">
            <div className="header-eyebrow">Gongwoojeong · Hand-out</div>
            <div className="header-title">공우정바른학원 · 구조도 · 지스트 · 영작</div>
            <div className="header-meta">
              {passage.code}
              {student?.display_name && <> · {student.display_name} ({student.student_no})</>}
            </div>
            <div className="header-meta">출력: {printedAt} · 2 / 2</div>
          </div>
        </div>

        {/* ③ 구조도 */}
        <div className="handout-section" style={{ flex: "1 1 auto" }}>
          <div className="handout-section-title">
            ③ 구조도
            <span className="hint">
              {structureHint
                ? `힌트: ${structureHint}`
                : "한 문장씩 핵심어와 흐름을 표로 정리하세요."}
            </span>
          </div>
          <div className="handout-grid" style={{ minHeight: "90mm" }} />
        </div>

        {/* ④/⑤ 지스트 + 영작 */}
        <div className="handout-section" style={{ flex: "0 0 auto" }}>
          <div className="gist-grid">
            <div>
              <div className="handout-section-title">④ 지스트 (주제문장)</div>
              <div className="write-lines">
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
              </div>
            </div>
            <div>
              <div className="handout-section-title">⑤ 영작</div>
              <div className="write-lines">
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandoutPage;
