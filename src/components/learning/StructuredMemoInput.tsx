import { Textarea } from "@/components/ui/textarea";
import {
  MEMO_FIELD_KEYS,
  MEMO_FIELD_LABEL,
  type StructuredMemo,
} from "@/lib/approvalMemo";

interface Props {
  value: StructuredMemo;
  onChange: (next: StructuredMemo) => void;
  disabled?: boolean;
  rows?: number;
}

/** 평가 승인 메모 — 고정 라벨 4칸 입력 (순서 고정, 라벨 수정 불가) */
export const StructuredMemoInput = ({ value, onChange, disabled, rows = 2 }: Props) => (
  <div className="space-y-2">
    <div className="text-xs font-semibold text-muted-foreground">
      메모 <span className="font-normal">(선택 · 항목별로 작성)</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {MEMO_FIELD_KEYS.map((key) => (
        <div key={key} className="space-y-1">
          <label className="text-[11px] font-bold text-foreground/80">
            {MEMO_FIELD_LABEL[key]}
          </label>
          <Textarea
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            rows={rows}
            maxLength={500}
            disabled={disabled}
            placeholder={MEMO_FIELD_LABEL[key]}
            className="text-sm"
          />
        </div>
      ))}
    </div>
  </div>
);
