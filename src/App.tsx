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
import TeacherHome from "./pages/teacher/TeacherHome.tsx";
import Bookshelf from "./pages/teacher/Bookshelf.tsx";
import BookshelfLevel from "./pages/teacher/BookshelfLevel.tsx";
import BookshelfUnit from "./pages/teacher/BookshelfUnit.tsx";
import PassageEditor from "./pages/teacher/PassageEditor.tsx";
import Assignments from "./pages/teacher/Assignments.tsx";
import AssignmentsPast from "./pages/teacher/AssignmentsPast.tsx";
import PrintQueue from "./pages/teacher/PrintQueue.tsx";
import LearningResults from "./pages/teacher/LearningResults.tsx";
import Retests from "./pages/teacher/Retests.tsx";
import HandoutPage from "./pages/Handout.tsx";
import HandoutWord from "./pages/HandoutWord.tsx";
import AnalysisReview from "./pages/AnalysisReview.tsx";
import LearnCompare from "./pages/LearnCompare.tsx";
import AnalysisRequests from "./pages/teacher/AnalysisRequests.tsx";
import TeacherAnalysisReview from "./pages/teacher/TeacherAnalysisReview.tsx";
import AnalysisCompare from "./pages/teacher/AnalysisCompare.tsx";
import AnalysisHandout from "./pages/teacher/AnalysisHandout.tsx";
import RequestsInbox from "./pages/teacher/RequestsInbox.tsx";
import PrintableHandout from "./pages/print/PrintableHandout.tsx";
import PrintableWord from "./pages/print/PrintableWord.tsx";
import PrintableAnalysis from "./pages/print/PrintableAnalysis.tsx";
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

            {/* 루트: 선생님은 /teacher, 학생은 /learn */}
            <Route
              path="/"
              element={
                <RequireAuth redirectStudentTo="/learn" redirectStaffTo="/teacher">
                  <Index studentMode />
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
              path="/learn/sentence/:sentenceId/review"
              element={
                <RequireAuth>
                  <AnalysisReview />
                </RequireAuth>
              }
            />
            <Route
              path="/learn/compare/:sentenceId"
              element={
                <RequireAuth>
                  <LearnCompare />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/inbox"
              element={
                <RequireAuth requireRole="teacher">
                  <RequestsInbox />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/requests"
              element={
                <RequireAuth requireRole="teacher">
                  <AnalysisRequests />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/review/:requestId"
              element={
                <RequireAuth requireRole="teacher">
                  <TeacherAnalysisReview />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/compare/:sentenceId/:studentId"
              element={
                <RequireAuth requireRole="teacher">
                  <AnalysisCompare />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/handout/analysis/:sentenceId/:studentId"
              element={
                <RequireAuth requireRole="teacher">
                  <AnalysisHandout />
                </RequireAuth>
              }
            />

            {/* 선생님 대시보드 */}
            <Route
              path="/teacher"
              element={
                <RequireAuth requireRole="teacher">
                  <TeacherHome />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf"
              element={
                <RequireAuth requireRole="teacher">
                  <Bookshelf />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level"
              element={
                <RequireAuth requireRole="teacher">
                  <BookshelfLevel />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level/:unitNo"
              element={
                <RequireAuth requireRole="teacher">
                  <BookshelfUnit />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level/:unitNo/:passageCode/edit"
              element={
                <RequireAuth requireRole="teacher">
                  <PassageEditor />
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
            <Route
              path="/teacher/assignments"
              element={
                <RequireAuth requireRole="teacher">
                  <Assignments />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/assignments/past"
              element={
                <RequireAuth requireRole="teacher">
                  <AssignmentsPast />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/print-queue"
              element={
                <RequireAuth requireRole="teacher">
                  <PrintQueue />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/results"
              element={
                <RequireAuth requireRole="teacher">
                  <LearningResults />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/handout/:passageCode"
              element={
                <RequireAuth requireRole="teacher">
                  <HandoutPage />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/handout/word/:passageCode"
              element={
                <RequireAuth requireRole="teacher">
                  <HandoutWord />
                </RequireAuth>
              }
            />
            <Route
              path="/learn/handout/:passageCode"
              element={
                <RequireAuth>
                  <HandoutPage />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/retests"
              element={
                <RequireAuth requireRole="teacher">
                  <Retests />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/dashboard"
              element={
                <RequireAuth requireRole="teacher">
                  <TeacherDashboard />
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
