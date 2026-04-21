import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  date: Date;
  onDateChange: (d: Date) => void;
  studentCount: number;
  filledCount: number;
}

const SessionDateBar = ({ date, onDateChange, studentCount, filledCount }: Props) => {
  return (
    <Card className="p-3 flex flex-wrap items-center gap-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">📅 시험 날짜</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 justify-start text-left font-normal min-w-[160px]")}
            >
              <CalendarIcon className="w-3.5 h-3.5 mr-2" />
              {format(date, "yyyy.MM.dd (EEE)", { locale: ko })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && onDateChange(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">📊 입력 현황</span>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
          {filledCount} / {studentCount}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5" />
        <span>
          단어HO <strong className="text-foreground">80점 미만 = FAIL</strong> · 자동 저장됩니다
        </span>
      </div>
    </Card>
  );
};

export default SessionDateBar;
