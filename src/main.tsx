import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateSentencesFromDb } from "./lib/sentenceSource";

// DB 지문 머지(비동기) — 실패해도 정적 SENTENCES로 폴백
void hydrateSentencesFromDb();

createRoot(document.getElementById("root")!).render(<App />);
