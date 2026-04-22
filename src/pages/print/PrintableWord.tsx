// ============================================================
// PrintableWord — 경량 단어 HO 인쇄 라우트
// 라우트: /print/word/:passageCode?student=...&scope=wrong|all&mode=ko|en|mix
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchPassageByCode, type Passage } from "@/lib/textbooks";

interface StudentInfo {
  display_name: string | null;
  student_no: string;
}

interface WordItem {
  word: string;
  expected: string;
}

type WordMode = "ko" | "en" | "mix";

const PrintableWord = () => {
  const { passageCode } = useParams<{ passageCode: string }>();
  const [params] = useSearchParams();
  const studentId = params.get("student");
  const scope = (params.get("scope") ?? "wrong") as "wrong" | "all";
  const mode = (params.get("mode") ?? "ko") as WordMode;
  const autoprint = params.get("autoprint") === "1";
  const embed = params.get("embed") === "1";

  const [passage, setPassage] = useState<Passage | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [items, setItems] = useState<WordItem[]>([]);
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
        const { data: prof } = await supabase
          .from("student_profiles")
          .select("display_name, student_no")
          .eq("user_id", studentId)
          .maybeSingle();
        if (alive && prof) setStudent(prof as StudentInfo);
      }

      let collected: WordItem[] = [];
      if (scope === "wrong" && studentId) {
        const { data: wt } = await supabase
          .from("word_test_results")
          .select("wrong_words, taken_at")
          .eq("user_id", studentId)
          .eq("sentence_id", passageCode)
          .order("taken_at", { ascending: false })
          .limit(1);
        const wrong = (wt?.[0]?.wrong_words ?? []) as Array<{
          word: string;
          expected: string;
        }>;
        collected = wrong
          .filter((w) => w?.word)
          .map((w) => ({ word: w.word, expected: w.expected ?? "" }));
      }
      if (collected.length === 0) {
        const { data: ext } = await supabase
          .from("sentence_word_extractions")
          .select("words")
          .eq("sentence_id", passageCode)
          .maybeSingle();
        const arr = (ext?.words ?? []) as Array<{
          word: string;
          meaning?: string;
          expected?: string;
        }>;
        collected = arr
          .filter((w) => w?.word)
          .map((w) => ({ word: w.word, expected: (w.expected ?? w.meaning ?? "").trim() }));
      }
      if (alive) setItems(collected);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [passageCode, studentId, scope]);

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
          if (autoprint && !embed) {
            try {
              window.print();
            } catch (e) {
              console.error("[PrintableWord] auto-print failed", e);
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

  const printedAt = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const blankSideOf = (idx0: number): "ko" | "en" => {
    if (mode === "ko") return "ko";
    if (mode === "en") return "en";
    return idx0 % 2 === 0 ? "ko" : "en";
  };

  const modeLabel = mode === "ko" ? "한글 채우기" : mode === "en" ? "영어 채우기" : "혼합";

  if (loading || !passage) {
    return <div style={{ padding: 16, fontSize: 12 }}>{loading ? "로딩 중…" : "지문 없음"}</div>;
  }

  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  return (
    <div className="pw-root">
      <style>{`
        @page { size: B5 portrait; margin: 10mm; }
        html, body, #root { background: white; }
        .pw-root {
          background: white; color: black;
          font-family: 'Noto Sans KR', system-ui, sans-serif;
          font-size: 10.5pt;
        }
        .pw-page {
          width: 162mm; min-height: 237mm;
          background: white; color: black;
          margin: 0 auto; padding: 0;
          display: flex; flex-direction: column;
          page-break-after: always;
        }
        .pw-page:last-child { page-break-after: auto; }
        .pw-header {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding: 4mm 5mm; border-bottom: 2.5pt solid #000;
        }
        .pw-title { font-size: 14pt; font-weight: 800; }
        .pw-eyebrow {
          font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .pw-meta { font-size: 8.5pt; color: #333; }
        .pw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 4mm 5mm; flex: 1; }
        .pw-col { display: flex; flex-direction: column; }
        .pw-row {
          display: grid; grid-template-columns: 7mm 1fr 1fr; gap: 2mm;
          align-items: end; border-bottom: 0.5pt solid #000;
          padding: 2mm 0; min-height: 9mm;
        }
        .pw-row .num { font-size: 8pt; color: #444; text-align: right; padding-right: 1mm; }
        .pw-row .en { font-size: 11pt; font-weight: 600; }
        .pw-row .ko { font-size: 9.5pt; color: #333; }
        .pw-row .blank { color: transparent; }
        @media print {
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="pw-page">
        <div className="pw-header">
          <div>
            <div className="pw-eyebrow">Gongwoojeong · Word Hand-out</div>
            <div className="pw-title">단어 HO · {passage.code}</div>
            <div className="pw-meta">
              {scope === "wrong" ? "오답 단어 학습지" : "전체 단어 학습지"} · {modeLabel} ·{" "}
              {items.length}문항
            </div>
          </div>
          <div className="pw-meta" style={{ textAlign: "right" }}>
            <div>
              학생: <b>{student?.display_name ?? "_______"}</b>{" "}
              {student?.student_no && <>({student.student_no})</>}
            </div>
            <div>출력: {printedAt}</div>
            <div>점수: ___ / {items.length}</div>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 11 }}>
            출제할 단어가 없습니다.
          </div>
        ) : (
          <div className="pw-grid">
            {[left, right].map((col, ci) => (
              <div key={ci} className="pw-col">
                {col.map((it, i) => {
                  const idx0 = ci === 0 ? i : half + i;
                  const idx = idx0 + 1;
                  const side = blankSideOf(idx0);
                  return (
                    <div key={idx} className="pw-row">
                      <div className="num">{idx}.</div>
                      <div className={side === "en" ? "en blank" : "en"}>
                        {side === "en" ? "______" : it.word}
                      </div>
                      <div className={side === "ko" ? "ko blank" : "ko"}>
                        {side === "ko" ? "______" : it.expected || "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintableWord;
