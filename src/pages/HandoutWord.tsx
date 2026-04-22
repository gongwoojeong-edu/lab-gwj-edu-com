// ============================================================
// HandoutWord — 단어 HO 학습지 (B5 인쇄)
// 라우트: /teacher/handout/word/:passageCode?student=...&scope=wrong|all&autoprint=1
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const HandoutWord = () => {
  const { passageCode } = useParams<{ passageCode: string }>();
  const [params] = useSearchParams();
  const studentId = params.get("student");
  const scope = (params.get("scope") ?? "wrong") as "wrong" | "all";
  const autoprint = params.get("autoprint") === "1";

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

      // 학생 정보
      if (studentId) {
        const { data: prof } = await supabase
          .from("student_profiles")
          .select("display_name, student_no")
          .eq("user_id", studentId)
          .maybeSingle();
        if (alive && prof) setStudent(prof as StudentInfo);
      }

      // 단어 목록 수집
      let collected: WordItem[] = [];
      if (scope === "wrong" && studentId) {
        // 학생의 최근 word_test_results.wrong_words
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
        // 전체 추출 단어로 fallback
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
    if (!autoprint || loading || !passage) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.error("[HandoutWord] auto-print failed", e);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [autoprint, loading, passage]);

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

  // 두 컬럼으로 분배
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  return (
    <div className="handout-root bg-muted/40 min-h-screen">
      <style>{`
        @page { size: B5 portrait; margin: 10mm; }
        .word-page {
          width: 162mm; min-height: 237mm;
          background: white; color: black;
          margin: 16px auto; padding: 0;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
          font-family: 'Noto Sans KR', system-ui, sans-serif;
          font-size: 10.5pt;
          display: flex; flex-direction: column;
        }
        .word-header {
          display: flex; justify-content: space-between; align-items: flex-end;
          padding: 4mm 5mm; border-bottom: 2.5pt solid hsl(var(--primary));
        }
        .word-title { font-size: 14pt; font-weight: 800; }
        .word-eyebrow {
          font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em;
          color: hsl(var(--primary)); text-transform: uppercase;
        }
        .word-meta { font-size: 8.5pt; color: #333; }
        .word-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 4mm 5mm; flex: 1; }
        .word-col { display: flex; flex-direction: column; }
        .word-row {
          display: grid; grid-template-columns: 7mm 1fr 1fr; gap: 2mm;
          align-items: end; border-bottom: 0.5pt solid #000;
          padding: 2mm 0; min-height: 9mm;
        }
        .word-row .num { font-size: 8pt; color: #444; text-align: right; padding-right: 1mm; }
        .word-row .en { font-size: 11pt; font-weight: 600; }
        .word-row .ko { font-size: 9.5pt; color: #444; }
        .toolbar {
          position: sticky; top: 0; z-index: 10;
          background: hsl(var(--background));
          border-bottom: 1px solid hsl(var(--border));
          padding: 8px 16px;
          display: flex; align-items: center; gap: 8px;
        }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .handout-root { background: white !important; min-height: 0 !important; }
          .word-page { margin: 0 !important; box-shadow: none !important; width: 100%; min-height: 0; page-break-after: always; }
        }
      `}</style>

      <div className="toolbar no-print">
        <Link to="/teacher/bookshelf">
          <Button size="sm" variant="ghost">
            <ArrowLeft className="size-4 mr-1" /> 책장
          </Button>
        </Link>
        <div className="text-sm text-muted-foreground flex-1">
          단어 HO · {passage.code} ·{" "}
          {scope === "wrong" ? "오답만" : "전체"} · {items.length}개
        </div>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4 mr-1" /> 인쇄
        </Button>
      </div>

      <div className="word-page">
        <div className="word-header">
          <div>
            <div className="word-eyebrow">Gongwoojeong · Word Hand-out</div>
            <div className="word-title">단어 HO · {passage.code}</div>
            <div className="word-meta">
              {scope === "wrong" ? "오답 단어 학습지" : "전체 단어 학습지"} · {items.length}문항
            </div>
          </div>
          <div className="word-meta" style={{ textAlign: "right" }}>
            <div>
              학생: <b>{student?.display_name ?? "_______"}</b>{" "}
              {student?.student_no && <>({student.student_no})</>}
            </div>
            <div>출력: {printedAt}</div>
            <div>점수: ___ / {items.length}</div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            출제할 단어가 없습니다.
          </div>
        ) : (
          <div className="word-grid">
            {[left, right].map((col, ci) => (
              <div key={ci} className="word-col">
                {col.map((it, i) => {
                  const idx = ci === 0 ? i + 1 : half + i + 1;
                  return (
                    <div key={idx} className="word-row">
                      <div className="num">{idx}.</div>
                      <div className="en">{it.word}</div>
                      <div className="ko">&nbsp;</div>
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

export default HandoutWord;
