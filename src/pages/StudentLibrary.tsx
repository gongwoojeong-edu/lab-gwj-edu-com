import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileText, Layers } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchApprovedMaterialUnits } from "@/lib/materialViewRequests";
import { supabase } from "@/integrations/supabase/client";
import { getAnalysisPdfSignedUrl, getStructurePdfSignedUrl } from "@/lib/textbooks";
import { toast } from "@/hooks/use-toast";
import { GWJ_SYNTAX_PRODUCT_NAME } from "@/lib/gwj-brand";

interface LibraryUnit {
  id: string;
  title: string;
  unitNo: number;
  volumeTitle: string;
  analysisPdfUrl: string | null;
  analysisPdfName: string | null;
  structurePdfUrl: string | null;
  structurePdfName: string | null;
}

const StudentLibrary = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<LibraryUnit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const approvedIds = await fetchApprovedMaterialUnits(user.id);
      if (!mounted || approvedIds.length === 0) {
        if (mounted) {
          setUnits([]);
          setLoading(false);
        }
        return;
      }

      const { data: unitRows } = await supabase
        .from("textbook_units")
        .select("id, title, unit_no, analysis_pdf_url, analysis_pdf_name, structure_pdf_url, structure_pdf_name, textbook_id")
        .in("id", approvedIds);

      const textbookIds = [
        ...new Set(((unitRows ?? []) as { textbook_id: string }[]).map((u) => u.textbook_id)),
      ];
      const volMap = new Map<string, string>();
      if (textbookIds.length) {
        const { data: vols } = await supabase
          .from("textbooks")
          .select("id, title")
          .in("id", textbookIds);
        ((vols ?? []) as { id: string; title: string }[]).forEach((v) => volMap.set(v.id, v.title));
      }

      const list: LibraryUnit[] = ((unitRows ?? []) as Array<{
        id: string;
        title: string;
        unit_no: number;
        textbook_id: string;
        analysis_pdf_url: string | null;
        analysis_pdf_name: string | null;
        structure_pdf_url: string | null;
        structure_pdf_name: string | null;
      }>)
        .map((u) => ({
          id: u.id,
          title: u.title,
          unitNo: u.unit_no,
          volumeTitle: volMap.get(u.textbook_id) ?? "",
          analysisPdfUrl: u.analysis_pdf_url,
          analysisPdfName: u.analysis_pdf_name,
          structurePdfUrl: u.structure_pdf_url,
          structurePdfName: u.structure_pdf_name,
        }))
        .sort((a, b) => a.unitNo - b.unitNo);

      if (mounted) {
        setUnits(list);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const openPdf = async (kind: "analysis" | "structure", unit: LibraryUnit) => {
    const path = kind === "analysis" ? unit.analysisPdfUrl : unit.structurePdfUrl;
    if (!path) {
      toast({ title: "자료가 아직 등록되지 않았습니다.", variant: "destructive" });
      return;
    }
    setBusy(`${kind}:${unit.id}`);
    try {
      const url =
        kind === "analysis"
          ? await getAnalysisPdfSignedUrl(path)
          : await getStructurePdfSignedUrl(path);
      if (!url) throw new Error("URL 생성 실패");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "열람 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/learn">
              <ArrowLeft className="size-4 mr-1" /> 학습 허브
            </Link>
          </Button>
          <h1 className="font-bold text-lg">{GWJ_SYNTAX_PRODUCT_NAME} · 라이브러리</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          선생님이 승인한 분석·구조도 자료입니다. 워크북 탐구 활동에 참고하세요.
        </p>

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mr-2" /> 불러오는 중…
          </div>
        ) : units.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            승인된 자료가 없습니다. 유닛 인쇄 후 「자료열람 요청」을 보내고 선생님 승인을 기다려 주세요.
          </Card>
        ) : (
          <ul className="space-y-3">
            {units.map((u) => (
              <li key={u.id}>
                <Card className="p-4 space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{u.volumeTitle}</div>
                    <div className="font-semibold">
                      Unit {u.unitNo} · {u.title}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!u.analysisPdfUrl || busy === `analysis:${u.id}`}
                      onClick={() => openPdf("analysis", u)}
                    >
                      {busy === `analysis:${u.id}` ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : (
                        <FileText className="size-3 mr-1" />
                      )}
                      분석자료
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!u.structurePdfUrl || busy === `structure:${u.id}`}
                      onClick={() => openPdf("structure", u)}
                    >
                      {busy === `structure:${u.id}` ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : (
                        <Layers className="size-3 mr-1" />
                      )}
                      구조도
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default StudentLibrary;
