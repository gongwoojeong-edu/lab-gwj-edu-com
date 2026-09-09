import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Link } from "react-router-dom";

const C = {
  primary: "#6B4E9E",
  deep: "#4A3475",
  lav: "#EFE9FA",
  lavBorder: "#E0D6F2",
  ink: "#24272E",
  gray: "#6B6480",
  line: "#E7E2F0",
};

const serif = "'Noto Serif KR', serif";
const sans = "'Noto Sans KR', sans-serif";

/** 아주 옅은 라벤더 도트 패턴 (배경 장식용) */
const dots =
  "radial-gradient(circle at 1px 1px, rgba(107,78,158,0.10) 1px, transparent 0)";

type Design = {
  id: string;
  name: string;
  w: number;
  h: number;
  note: string;
  render: () => JSX.Element;
};

const DESIGNS: Design[] = [
  {
    id: "blog-bg",
    name: "블로그 기본 배경 (PC 스킨)",
    w: 1920,
    h: 1080,
    note: "네이버/티스토리 PC 배경 이미지용 · 가운데 본문 영역은 비워 둠",
    render: () => (
      <div
        style={{
          width: 1920,
          height: 1080,
          background: "#FBFAFE",
          position: "relative",
          fontFamily: sans,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: dots,
            backgroundSize: "26px 26px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            background: C.primary,
          }}
        />
        {/* 좌측 세로 브랜드 */}
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 140,
            width: 380,
          }}
        >
          <div style={{ width: 70, height: 4, background: C.primary }} />
          <div
            style={{
              fontFamily: serif,
              fontWeight: 900,
              fontSize: 54,
              color: C.deep,
              marginTop: 26,
              lineHeight: 1.35,
            }}
          >
            공우정바른학원
          </div>
          <div style={{ fontSize: 22, color: C.gray, marginTop: 16, lineHeight: 1.7 }}>
            언어에서 입시까지,
            <br />하나의 로드맵
          </div>
        </div>
        {/* 우측 하단 라벤더 면 */}
        <div
          style={{
            position: "absolute",
            right: -160,
            bottom: -160,
            width: 620,
            height: 620,
            borderRadius: "50%",
            background: C.lav,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 96,
            bottom: 72,
            fontSize: 22,
            color: C.primary,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          054-474-0704 · 카카오채널 「공우정」
        </div>
      </div>
    ),
  },
  {
    id: "blog-title",
    name: "블로그 타이틀 배너",
    w: 966,
    h: 300,
    note: "네이버 블로그 타이틀 영역(966×300)",
    render: () => (
      <div
        style={{
          width: 966,
          height: 300,
          background: "#fff",
          position: "relative",
          fontFamily: sans,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 8, border: `1px solid ${C.lav}` }} />
        <div style={{ position: "absolute", inset: 8, border: `2px solid ${C.lavBorder}` }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 8, color: C.primary, fontWeight: 700 }}>
            GONGWOOJUNG
          </div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 900,
              fontSize: 52,
              color: C.deep,
              marginTop: 14,
            }}
          >
            공우정바른학원
          </div>
          <div style={{ width: 70, height: 4, background: C.primary, margin: "18px 0 14px" }} />
          <div style={{ fontSize: 20, color: C.gray }}>구미 · 입시영어 로드맵 이야기</div>
        </div>
      </div>
    ),
  },
  {
    id: "blog-quote",
    name: "본문 삽입용 인용 카드",
    w: 800,
    h: 800,
    note: "글 중간에 넣는 정사각 카드",
    render: () => (
      <div
        style={{
          width: 800,
          height: 800,
          background: "#fff",
          position: "relative",
          fontFamily: sans,
        }}
      >
        <div style={{ position: "absolute", inset: 8, border: `1px solid ${C.lav}` }} />
        <div style={{ position: "absolute", inset: 8, border: `2px solid ${C.lavBorder}` }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 90,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 20, letterSpacing: 6, color: C.primary, fontWeight: 700 }}>
            오늘의 한 줄
          </div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 46,
              lineHeight: 1.5,
              color: C.deep,
              marginTop: 34,
            }}
          >
            문장 구조력 + 논리 연결력
            <br />= 진짜 입시 독해력
          </div>
          <div style={{ width: 70, height: 4, background: C.primary, margin: "38px 0 24px" }} />
          <div style={{ fontSize: 20, color: C.gray }}>공우정바른학원</div>
        </div>
      </div>
    ),
  },
  {
    id: "blog-section",
    name: "소제목 구분 띠",
    w: 900,
    h: 220,
    note: "글 안에서 단락을 나눌 때",
    render: () => (
      <div
        style={{
          width: 900,
          height: 220,
          background: C.lav,
          position: "relative",
          fontFamily: sans,
          display: "flex",
          alignItems: "center",
          paddingLeft: 64,
        }}
      >
        <div
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, background: C.primary }}
        />
        <div>
          <div style={{ fontSize: 18, letterSpacing: 5, color: C.primary, fontWeight: 700 }}>
            SECTION
          </div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 900,
              fontSize: 44,
              color: C.deep,
              marginTop: 10,
            }}
          >
            소제목을 여기에
          </div>
        </div>
      </div>
    ),
  },
];

export default function BlogSkin() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    document.title = "블로그 배경 디자인 — 공우정바른학원";
    const done = () => setFontsReady(true);
    if (document.fonts?.ready) document.fonts.ready.then(done).catch(done);
    else done();
  }, []);

  const download = async (d: Design) => {
    const node = refs.current[d.id];
    if (!node) return;
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      width: d.w,
      height: d.h,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `공우정_${d.id}.png`;
    a.click();
  };

  return (
    <div style={{ background: "#F7F6FB", minHeight: "100vh", padding: "24px 12px 80px" }}>
      <header style={{ maxWidth: 1080, margin: "0 auto 24px", fontFamily: sans }}>
        <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, color: C.deep }}>
          블로그 꾸미기용 배경 디자인
        </h1>
        <p style={{ fontSize: 14, color: C.gray, marginTop: 6 }}>
          {fontsReady ? "폰트 준비 완료 — 2배 해상도 PNG로 저장됩니다." : "폰트 불러오는 중…"}
        </p>
        <Link
          to="/seminar-cards"
          style={{
            display: "inline-block",
            marginTop: 12,
            background: "#fff",
            color: C.deep,
            border: `1px solid ${C.lavBorder}`,
            borderRadius: 10,
            padding: "10px 18px",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ← 세미나 카드뉴스
        </Link>
      </header>

      <main style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
        {DESIGNS.map((d) => (
          <section key={d.id} style={{ maxWidth: "100%" }}>
            <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: C.deep }}>
              {d.name}{" "}
              <span style={{ fontWeight: 400, color: C.gray }}>
                · {d.w}×{d.h} · {d.note}
              </span>
            </div>
            <div
              style={{
                marginTop: 10,
                width: "min(100%, 1080px)",
                overflowX: "auto",
                boxShadow: "0 8px 30px rgba(74,52,117,0.10)",
                background: "#fff",
              }}
            >
              <div ref={(el) => (refs.current[d.id] = el)} style={{ width: d.w }}>
                {d.render()}
              </div>
            </div>
            <button
              disabled={!fontsReady}
              onClick={() => download(d)}
              style={{
                marginTop: 10,
                background: C.primary,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "8px 16px",
                fontWeight: 700,
                cursor: "pointer",
                opacity: fontsReady ? 1 : 0.5,
                fontFamily: sans,
              }}
            >
              PNG 다운로드
            </button>
          </section>
        ))}
      </main>
    </div>
  );
}
