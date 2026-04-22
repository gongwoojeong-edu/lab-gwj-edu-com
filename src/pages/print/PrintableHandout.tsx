// ============================================================
// PrintableHandout — 경량 구문 HO 인쇄 라우트
// 라우트: /print/handout/:passageCode?student=...&autoprint=1&embed=1
//
// 정책:
//   - 애니메이션/lucide/Toolbar/Button 미사용
//   - 순수 텍스트 + @media print
//   - 부모 iframe 에서 호출 시 embed=1 → 자체 print() 호출 안 함
//   - 새 탭으로 직접 진입 시 autoprint=1 → 자체 print() 호출
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPassageByCode, type Passage } from "@/lib/textbooks";
import { buildClozeSegments, buildStructureHint } from "@/lib/handoutCloze";

interface StudentInfo {
  display_name: string | null;
  student_no: string;
}

const PrintableHandout = () => {
  const { passageCode } = useParams<{ passageCode: string }>();
  const [params] = useSearchParams();
  const studentId = params.get("student");
  const autoprint = params.get("autoprint") === "1";
  const embed = params.get("embed") === "1";

  const [passage, setPassage] = useState<Passage | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [studentTranslation, setStudentTranslation] = useState<string>("");
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
            .order("submitted_at", { ascending: false })
            .limit(1)
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

  // ready 시그널 (+ 새 탭 fallback 시 autoprint)
  useEffect(() => {
    if (loading || !passage) return;
    let cancelled = false;
    const fire = async () => {
      try {
        if (
          typeof document !== "undefined" &&
          (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
        ) {
          await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          (window as unknown as { __LOVABLE_PRINT_READY?: boolean }).__LOVABLE_PRINT_READY = true;
          // embed=1 (iframe) 모드에서는 부모가 print() 호출
          if (autoprint && !embed) {
            try {
              window.print();
            } catch (e) {
              console.error("[PrintableHandout] auto-print failed", e);
            }
          }
        });
      });
    };
    fire();
    return () => {
      cancelled = true;
    };
  }, [autoprint, embed, loading, passage]);

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

  if (loading || !passage) {
    return <div style={{ padding: 16, fontSize: 12 }}>{loading ? "로딩 중…" : "지문 없음"}</div>;
  }

  const audioUrl = `https://lab.gwj-edu.com/learn/sentence/${passage.code}?audio=1`;

  return (
    <div className="ph-root">
      <style>{`
        @page { size: B5 portrait; margin: 10mm; }
        html, body, #root { background: white; }
        .ph-root {
          background: white;
          color: black;
          font-family: 'Noto Sans KR', system-ui, sans-serif;
          font-size: 10.5pt;
        }
        .ph-page {
          width: 162mm;
          min-height: 237mm;
          background: white;
          color: black;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          page-break-after: always;
        }
        .ph-page:last-child { page-break-after: auto; }
        .ph-section { border-bottom: 0.5pt solid #000; padding: 3mm 4mm; }
        .ph-section:last-child { border-bottom: none; }
        .ph-section-title {
          font-size: 9pt; font-weight: 700;
          margin-bottom: 2mm; letter-spacing: 0.02em;
          display: flex; align-items: center; gap: 4mm;
          color: #000;
          border-left: 2pt solid #000;
          padding-left: 2mm;
        }
        .ph-section-title .hint { font-weight: 400; font-size: 8.5pt; color: #444; }
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
        .ph-grid {
          min-height: 90mm;
          background-image:
            linear-gradient(#bbb 0.3pt, transparent 0.3pt),
            linear-gradient(90deg, #bbb 0.3pt, transparent 0.3pt);
          background-size: 4mm 4mm;
          border: 0.5pt solid #000;
          padding: 2mm;
        }
        .write-lines { display: flex; flex-direction: column; gap: 6mm; padding-top: 4mm; }
        .write-line { border-bottom: 0.5pt solid #000; height: 0; }
        .header-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 4mm; padding: 3mm 4mm;
          border-bottom: 2.5pt solid #000;
        }
        .header-info { flex: 1; font-size: 9pt; line-height: 1.5; }
        .header-eyebrow {
          font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em;
          text-transform: uppercase; margin-bottom: 0.5mm;
        }
        .header-title { font-size: 13pt; font-weight: 800; margin-bottom: 1mm; }
        .header-meta { color: #333; }
        .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
        .qr-label { font-size: 7pt; color: #333; }
        .gist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        @media print {
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ===== Page 1 ===== */}
      <div className="ph-page">
        <div className="header-row">
          <div className="header-info">
            <div className="header-eyebrow">Gongwoojeong · Hand-out</div>
            <div className="header-title">공우정바른학원 · 영어 학습지</div>
            <div className="header-meta">
              {passage.code}
              {structureHint && <> · 핵심 흐름: {structureHint}</>}
            </div>
            <div className="header-meta">
              학생: {student?.display_name ?? "_______"}{" "}
              {student?.student_no && <>({student.student_no})</>}
            </div>
            <div className="header-meta">출력: {printedAt} · 1 / 2</div>
          </div>
          <div className="qr-wrap">
            <QRCodeSVG value={audioUrl} size={68} level="M" />
            <div className="qr-label">🎧 MP3</div>
          </div>
        </div>

        <div className="ph-section" style={{ flex: "0 0 auto" }}>
          <div className="ph-section-title">
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

        <div className="ph-section" style={{ flex: "1 1 auto" }}>
          <div className="ph-section-title">② 한글 해석</div>
          <div className="translation-box">{studentTranslation || " "}</div>
        </div>
      </div>

      {/* ===== Page 2 ===== */}
      <div className="ph-page">
        <div className="header-row">
          <div className="header-info">
            <div className="header-eyebrow">Gongwoojeong · Hand-out</div>
            <div className="header-title">공우정바른학원 · 구조도 · 지스트 · 영작</div>
            <div className="header-meta">
              {passage.code}
              {student?.display_name && (
                <>
                  {" "}
                  · {student.display_name} ({student.student_no})
                </>
              )}
            </div>
            <div className="header-meta">출력: {printedAt} · 2 / 2</div>
          </div>
        </div>

        <div className="ph-section" style={{ flex: "1 1 auto" }}>
          <div className="ph-section-title">
            ③ 구조도
            <span className="hint">
              {structureHint
                ? `힌트: ${structureHint}`
                : "한 문장씩 핵심어와 흐름을 표로 정리하세요."}
            </span>
          </div>
          <div className="ph-grid" />
        </div>

        <div className="ph-section" style={{ flex: "0 0 auto" }}>
          <div className="gist-grid">
            <div>
              <div className="ph-section-title">④ 지스트 (주제문장)</div>
              <div className="write-lines">
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
                <div className="write-line" />
              </div>
            </div>
            <div>
              <div className="ph-section-title">⑤ 영작</div>
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

export default PrintableHandout;
