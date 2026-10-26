import { cn } from "@/lib/utils";
import {
  MEMO_FIELD_KEYS,
  MEMO_FIELD_LABEL,
  isMemoEmpty,
  parseMemo,
} from "@/lib/approvalMemo";

interface Props {
  memo: unknown;
  className?: string;
  /** true 면 빈 항목도 흐리게 표시 (기본: 숨김) */
  showEmpty?: boolean;
  emptyText?: string;
}

/** 평가 메모 — 고정 라벨 4개 섹션으로 렌더 */
export const StructuredMemoView = ({
  memo,
  className,
  showEmpty = false,
  emptyText = "메모 없음",
}: Props) => {
  const parsed = parseMemo(memo);
  if (isMemoEmpty(parsed) && !showEmpty) {
    return <span className="text-muted-foreground italic text-xs">{emptyText}</span>;
  }
  const keys = MEMO_FIELD_KEYS.filter((k) => showEmpty || parsed[k].trim());
  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      {keys.map((k) => {
        const empty = !parsed[k].trim();
        return (
          <div key={k} className={cn("min-w-0 space-y-1 text-sm", empty && "opacity-40")}>
            <div className="text-xs font-bold leading-relaxed text-muted-foreground break-words">
              {MEMO_FIELD_LABEL[k]}
            </div>
            <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {empty ? "—" : parsed[k].trim()}
            </div>
          </div>
        );
      })}
    </div>
  );
};
