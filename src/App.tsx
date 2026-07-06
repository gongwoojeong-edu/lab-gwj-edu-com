import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";
import TeacherStudents from "./pages/TeacherStudents.tsx";
import StudentRoster from "./pages/teacher/StudentRoster.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import StudentHome from "./pages/StudentHome.tsx";
import StudentLibrary from "./pages/StudentLibrary.tsx";
import SentenceLearn from "./pages/SentenceLearn.tsx";
import TeacherHome from "./pages/teacher/TeacherHome.tsx";
import StalledStudents from "./pages/teacher/StalledStudents.tsx";
import PendingApprovals from "./pages/teacher/PendingApprovals.tsx";
import Integrations from "./pages/teacher/Integrations.tsx";
import Bookshelf from "./pages/teacher/Bookshelf.tsx";
import BookshelfLevel from "./pages/teacher/BookshelfLevel.tsx";
import BookshelfSeries from "./pages/teacher/BookshelfSeries.tsx";
import BookshelfVolume from "./pages/teacher/BookshelfVolume.tsx";
import BookshelfUnit from "./pages/teacher/BookshelfUnit.tsx";
import PassageEditor from "./pages/teacher/PassageEditor.tsx";
import Assignments from "./pages/teacher/Assignments.tsx";
import AssignmentsPast from "./pages/teacher/AssignmentsPast.tsx";
import PrintQueue from "./pages/teacher/PrintQueue.tsx";
import LearningResults from "./pages/teacher/LearningResults.tsx";
import LearningResultsCalendar from "./pages/teacher/LearningResultsCalendar.tsx";
import EvaluationReports from "./pages/teacher/EvaluationReports.tsx";
import StudentNotifications from "./pages/StudentNotifications.tsx";
import Retests from "./pages/teacher/Retests.tsx";
import HandoutPage from "./pages/Handout.tsx";
import HandoutWord from "./pages/HandoutWord.tsx";
import AnalysisReview from "./pages/AnalysisReview.tsx";
import LearnCompare from "./pages/LearnCompare.tsx";
import MemorizeLearn from "./pages/MemorizeLearn.tsx";

import TeacherAnalysisReview from "./pages/teacher/TeacherAnalysisReview.tsx";
import AnalysisCompare from "./pages/teacher/AnalysisCompare.tsx";
import AnalysisHandout from "./pages/teacher/AnalysisHandout.tsx";
import RequestsInbox from "./pages/teacher/RequestsInbox.tsx";
import PrintableHandout from "./pages/print/PrintableHandout.tsx";
import PrintableWord from "./pages/print/PrintableWord.tsx";
import PrintableAnalysis from "./pages/print/PrintableAnalysis.tsx";
import { HintSettingsProvider } from "./components/analyzer/HintSettingsContext";
import { RequireAuth } from "./components/auth/RequireAuth";
import { StaffProvider } from "./lib/staff-context";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <HintSettingsProvider>
        <StaffProvider>
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
                  <StudentHome />
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
              path="/learn/library"
              element={
                <RequireAuth>
                  <StudentLibrary />
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
              path="/learn/sentence/:sentenceId/memorize"
              element={
                <RequireAuth>
                  <MemorizeLearn />
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
                  <RequestsInbox />
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
              path="/teacher/bookshelf/:level/:seriesNo"
              element={
                <RequireAuth requireRole="teacher">
                  <BookshelfSeries />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level/:seriesNo/:volumeNo"
              element={
                <RequireAuth requireRole="teacher">
                  <BookshelfVolume />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level/:seriesNo/:volumeNo/:unitNo"
              element={
                <RequireAuth requireRole="teacher">
                  <BookshelfUnit />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/bookshelf/:level/:seriesNo/:volumeNo/:unitNo/:passageCode/edit"
              element={
                <RequireAuth requireRole="teacher">
                  <PassageEditor />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/roster"
              element={
                <RequireAuth requireRole="teacher">
                  <StudentRoster />
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
              path="/teacher/results-calendar"
              element={
                <RequireAuth requireRole="teacher">
                  <LearningResultsCalendar />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/evaluation-reports"
              element={
                <RequireAuth requireRole="teacher">
                  <EvaluationReports />
                </RequireAuth>
              }
            />
            <Route
              path="/learn/notifications"
              element={
                <RequireAuth requireRole="student">
                  <StudentNotifications />
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
            <Route
              path="/teacher/stalled"
              element={
                <RequireAuth requireRole="teacher">
                  <StalledStudents />
                </RequireAuth>
              }
            />
            <Route
              path="/teacher/approvals"
              element={
                <RequireAuth requireRole="teacher">
                  <PendingApprovals />
                </RequireAuth>
              }
            />

            <Route
              path="/teacher/integrations"
              element={
                <RequireAuth requireRole="teacher">
                  <Integrations />
                </RequireAuth>
              }
            />
            {/* === 경량 인쇄 라우트 (iframe 즉시 인쇄용) === */}
            <Route
              path="/print/handout/:passageCode"
              element={
                <RequireAuth>
                  <PrintableHandout />
                </RequireAuth>
              }
            />
            <Route
              path="/print/word/:passageCode"
              element={
                <RequireAuth>
                  <PrintableWord />
                </RequireAuth>
              }
            />
            <Route
              path="/print/analysis/:sentenceId/:studentId"
              element={
                <RequireAuth>
                  <PrintableAnalysis />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </StaffProvider>
      </HintSettingsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
