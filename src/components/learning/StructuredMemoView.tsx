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
  if (isMemoEmpty(parsed)) {
    return <span className="text-muted-foreground italic text-xs">{emptyText}</span>;
  }
  const keys = MEMO_FIELD_KEYS.filter((k) => showEmpty || parsed[k].trim());
  return (
    <div className={cn("space-y-1.5", className)}>
      {keys.map((k) => {
        const empty = !parsed[k].trim();
        return (
          <div key={k} className={cn("text-sm", empty && "opacity-40")}>
            <span className="text-[11px] font-bold text-muted-foreground mr-1.5">
              {MEMO_FIELD_LABEL[k]}
            </span>
            <span className="whitespace-pre-wrap align-middle">
              {empty ? "—" : parsed[k].trim()}
            </span>
          </div>
        );
      })}
    </div>
  );
};
