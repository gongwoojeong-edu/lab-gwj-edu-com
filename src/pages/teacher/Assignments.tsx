import { TeacherLayout } from "@/components/teacher/TeacherLayout";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

const Assignments = () => (
  <TeacherLayout>
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ClipboardList className="size-6 text-primary" /> 교재 부여
      </h1>
      <Card className="p-10 text-center text-sm text-muted-foreground">
        곧 출시됩니다 — 학생별로 책장의 교재를 배정하고 진행률을 추적할 수 있게 됩니다.
      </Card>
    </div>
  </TeacherLayout>
);

export default Assignments;
