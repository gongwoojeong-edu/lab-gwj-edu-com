// ============================================================
// StudentScopeDialog — 학생 진도(학습 범위) 설정
//   레벨 / 시리즈(책) / 권 / 시작 유닛 단위로 등록.
//   시리즈만 지정하면 시리즈 전체, 권을 지정하면 그 권 전체가 진도 범위.
// ============================================================
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEVELS, type LevelCode } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { toast } from "@/hooks/use-toast";
import { updateStudentStartScope } from "@/lib/studentProfile";
import {
  fetchAllSeries,
  fetchTextbooksBySeries,
  fetchUnitsByTextbook,
  type Series,
  type Textbook,
  type Unit,
} from "@/lib/textbooks";

export interface ScopeDialogTarget {
  userId: string;
  name: string;
  level: LevelCode;
  seriesId: string | null;
  volumeId: string | null;
  unitId: string | null;
}

interface Props {
  target: ScopeDialogTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: {
    userId: string;
    level: LevelCode;
    seriesId: string | null;
    volumeId: string | null;
    unitId: string | null;
    label?: string;
  }) => void;
}

export const StudentScopeDialog = ({ target, onOpenChange, onSaved }: Props) => {
  const { displayLevel } = useLevelLabels();
  const open = target !== null;
  const [level, setLevel] = useState<LevelCode>("L05");
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [volumeList, setVolumeList] = useState<Textbook[]>([]);
  const [unitList, setUnitList] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLevel(target.level);
    setSeriesId(target.seriesId);
    setVolumeId(target.volumeId);
    setUnitId(target.unitId);
  }, [target]);

  useEffect(() => {
    if (!open) return;
    fetchAllSeries().then(setSeriesList).catch(() => setSeriesList([]));
  }, [open]);

  useEffect(() => {
    if (!open || !seriesId) {
      setVolumeList([]);
      return;
    }
    fetchTextbooksBySeries(seriesId).then(setVolumeList).catch(() => setVolumeList([]));
  }, [open, seriesId]);

  useEffect(() => {
    if (!open || !volumeId) {
      setUnitList([]);
      return;
    }
    fetchUnitsByTextbook(volumeId).then(setUnitList).catch(() => setUnitList([]));
  }, [open, volumeId]);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await updateStudentStartScope(target.userId, {
        start_level: level,
        start_series_id: seriesId,
        start_volume_id: volumeId,
        start_unit_id: unitId,
      });
      const parts: string[] = [];
      const s = seriesList.find((x) => x.id === seriesId);
      if (s) parts.push(s.title);
      const v = volumeList.find((x) => x.id === volumeId);
      if (v) parts.push(`Vol.${v.volume_no} ${v.title}`);
      const u = unitList.find((x) => x.id === unitId);
      if (u) parts.push(`Unit ${u.unit_no} ${u.title}`);
      onSaved({
        userId: target.userId,
        level,
        seriesId,
        volumeId,
        unitId,
        label: parts.length ? parts.join(" / ") : undefined,
      });
      toast({ title: "📚 진도가 설정되었습니다", description: parts.join(" / ") || "레벨 전체" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "진도 저장 실패",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-kr">
        <DialogHeader>
          <DialogTitle>진도 설정 — {target?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-[12px] text-muted-foreground">
            시리즈(책) 또는 권 단위로 진도를 등록할 수 있습니다. 등록한 범위의 지문을 모두
            끝내면 학생 목록에 <b>진도 끊김</b>으로 표시되며, 새 시리즈·책을 다시 등록해 주세요.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label>레벨</Label>
            <Select
              value={level}
              onValueChange={(v) => {
                const next = v as LevelCode;
                setLevel(next);
                const picked = seriesList.find((s) => s.id === seriesId);
                if (!picked || picked.level !== next) {
                  setSeriesId(null);
                  setVolumeId(null);
                  setUnitId(null);
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.code} · {displayLevel(l.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>시리즈 · 책</Label>
            <Select
              value={seriesId ?? "__all__"}
              onValueChange={(v) => {
                if (v === "__all__") setSeriesId(null);
                else {
                  setSeriesId(v);
                  const picked = seriesList.find((s) => s.id === v);
                  if (picked && picked.level !== level) setLevel(picked.level as LevelCode);
                }
                setVolumeId(null);
                setUnitId(null);
              }}
              disabled={seriesList.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={seriesList.length === 0 ? "등록된 책 없음" : "레벨 전체"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">레벨 전체 (책 미지정)</SelectItem>
                {seriesList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    [{s.level}] {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>권 (선택)</Label>
            <Select
              value={volumeId ?? "__all__"}
              onValueChange={(v) => {
                setVolumeId(v === "__all__" ? null : v);
                setUnitId(null);
              }}
              disabled={!seriesId || volumeList.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={!seriesId ? "먼저 책을 선택" : volumeList.length === 0 ? "등록된 권 없음" : "책 전체"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">책(시리즈) 전체</SelectItem>
                {volumeList.map((v) => (
                  <SelectItem key={v.id} value={v.id}>Vol.{v.volume_no} {v.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>시작 유닛 (선택)</Label>
            <Select
              value={unitId ?? "__all__"}
              onValueChange={(v) => setUnitId(v === "__all__" ? null : v)}
              disabled={!volumeId || unitList.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={!volumeId ? "먼저 권을 선택" : unitList.length === 0 ? "등록된 유닛 없음" : "권 전체"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">권 전체 (1유닛부터)</SelectItem>
                {unitList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    Unit {u.unit_no} {u.title} ~ 권 끝
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={save} disabled={saving}>진도 저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StudentScopeDialog;
