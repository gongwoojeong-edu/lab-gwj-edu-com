import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";
import TeacherStudents from "./pages/TeacherStudents.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import StudentHome from "./pages/StudentHome.tsx";
import SentenceLearn from "./pages/SentenceLearn.tsx";
import { HintSettingsProvider } from "./components/analyzer/HintSettingsContext";
import { RequireAuth } from "./components/auth/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <HintSettingsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* 선생님 전용 정답입력기 — 학생은 /learn 으로 강제 이동 */}
            <Route
              path="/"
              element={
                <RequireAuth redirectStudentTo="/learn">
                  <Index />
                </RequireAuth>
              }
            />

            {/* 학생 메인 + 학습 컨테이너 */}
            <Route
              path="/learn"
              element={
                <RequireAuth>
                  <StudentHome />
                </RequireAuth>
              }
            />
            <Route
              path="/learn/sentence/:sentenceId"
              element={
                <RequireAuth>
                  <SentenceLearn />
                </RequireAuth>
              }
            />

            <Route
              path="/teacher"
              element={
                <RequireAuth requireRole="teacher">
                  <TeacherDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/students"
              element={
                <RequireAuth requireRole="teacher">
                  <TeacherStudents />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </HintSettingsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
