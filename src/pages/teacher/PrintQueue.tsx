import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { Printer } from "lucide-react";

const PrintQueue = () => (
  <TeacherLayout>
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Printer className="size-6 text-primary" /> 인쇄 대기열
      </h1>
      <Card className="p-10 text-center text-sm text-muted-foreground">
        2단계 인쇄 시스템에서 학생 통과 시 자동으로 시험지가 이 대기열에 쌓입니다. (구현 예정)
      </Card>
    </div>
  </TeacherLayout>
);

export default PrintQueue;
