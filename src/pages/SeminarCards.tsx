import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Link } from "react-router-dom";

/** 브랜드 색 */
const C = {
  primary: "#6B4E9E",
  deep: "#4A3475",
  lav: "#EFE9FA",
  lavBorder: "#E0D6F2",
  ink: "#24272E",
  gray: "#6B6480",
  line: "#E7E2F0",
  grayPurple: "#8B84A0",
};

const serif = "'Noto Serif KR', serif";
const sans = "'Noto Sans KR', sans-serif";

function Frame({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: "#fff",
        position: "relative",
        fontFamily: sans,
        color: C.ink,
        overflow: "hidden",
        flex: "none",
      }}
    >
      {/* 2중 테두리 프레임 */}
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: `1px solid ${C.lav}`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: `2px solid ${C.lavBorder}`,
          pointerEvents: "none",
        }}
      />
      {/* 페이지 표시 */}
      <div
        style={{
          position: "absolute",
          top: 46,
          right: 62,
          fontSize: 22,
          letterSpacing: 1,
          color: C.gray,
        }}
      >
        {index} / 5
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "96px 96px 78px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.primary,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 6,
      }}
    >
      {children}
    </div>
  );
}

function Bar({ mt = 40, mb = 40 }: { mt?: number; mb?: number }) {
  return (
    <div
      style={{
        width: 70,
        height: 4,
        background: C.primary,
        marginTop: mt,
        marginBottom: mb,
      }}
    />
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        right: 96,
        bottom: 78,
        textAlign: "center",
      }}
    >
      <div style={{ height: 1, background: C.line, marginBottom: 28 }} />
      <div style={{ fontSize: 26, color: C.gray, letterSpacing: 0.5 }}>{children}</div>
    </div>
  );
}

function Card1() {
  return (
    <Frame index={1}>
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: serif,
          fontWeight: 700,
          fontSize: 36,
          color: C.primary,
          letterSpacing: 2,
        }}
      >
        공우정바른학원
      </div>

      <Label>영어 학부모 초청 세미나</Label>

      <div
        style={{
          fontFamily: serif,
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.32,
          color: C.ink,
          marginTop: 54,
        }}
      >
        중학교 땐 A였는데,
        <br />왜 고등에서
        <br />무너질까?
      </div>

      <Bar mt={54} mb={44} />

      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 46, color: C.deep }}>
        「실패 없는 입시영어 로드맵」
      </div>
      <div style={{ fontSize: 30, color: C.gray, marginTop: 26 }}>
        『구문정독』 저자 직강 · 학부모 세미나
      </div>

      <Footer>
        <span style={{ color: C.primary, fontWeight: 700 }}>2026. 10. 17 (토) 오후 1~3시</span> ·
        구미코(GUMICO)
      </Footer>
    </Frame>
  );
}

function Card2() {
  return (
    <Frame index={2}>
      <Label>왜 무너질까요?</Label>

      <div style={{ fontSize: 28, color: C.gray, marginTop: 56 }}>중학교 영어 A등급</div>
      <div
        style={{
          fontFamily: serif,
          fontWeight: 900,
          fontSize: 132,
          color: C.grayPurple,
          lineHeight: 1.1,
          marginTop: 6,
        }}
      >
        40%↑
      </div>

      <div style={{ fontSize: 76, color: C.primary, lineHeight: 1, margin: "18px 0 14px" }}>↓</div>

      <div style={{ fontSize: 28, color: C.gray }}>수능 영어 1등급</div>
      <div
        style={{
          fontFamily: serif,
          fontWeight: 900,
          fontSize: 132,
          color: C.deep,
          lineHeight: 1.1,
          marginTop: 6,
        }}
      >
        6~7%
      </div>

      <div
        style={{
          fontSize: 32,
          lineHeight: 1.65,
          color: C.ink,
          marginTop: 52,
          maxWidth: 760,
        }}
      >
        중학 A를 받던 아이 <strong style={{ fontWeight: 700 }}>10명 중 7명 이상</strong>이 고등에서
        3등급 이하로 내려갑니다.
      </div>

      <Footer>
        <span style={{ color: C.deep, fontWeight: 700 }}>
          구미에선 '수능 최저'가 또 하나의 벽입니다
        </span>
      </Footer>
    </Frame>
  );
}

function Card3() {
  return (
    <Frame index={3}>
      <Label>공우정은 다릅니다</Label>

      <div style={{ fontSize: 34, lineHeight: 1.6, color: C.gray, marginTop: 56 }}>
        많은 곳은
        <br />중등 내신용 문법(K-문법)에
        <br />오래 머뭅니다.
      </div>

      <Bar mt={48} mb={48} />

      <div
        style={{
          fontFamily: serif,
          fontWeight: 900,
          fontSize: 74,
          lineHeight: 1.4,
          color: C.deep,
        }}
      >
        공우정은
        <br />세계 3대 저널 원문을
        <br />'정독'합니다
      </div>

      <div style={{ fontSize: 32, lineHeight: 1.65, color: C.gray, marginTop: 52 }}>
        문장 구조력 + 논리 연결력
        <br />= 진짜 입시 독해력
      </div>

      <Footer>공우정바른학원 · 언어에서 입시까지, 하나의 로드맵</Footer>
    </Frame>
  );
}

function Card4() {
  return (
    <Frame index={4}>
      <Label>강연자</Label>

      <div
        style={{
          fontFamily: serif,
          fontWeight: 900,
          fontSize: 78,
          color: C.ink,
          marginTop: 48,
          lineHeight: 1.25,
        }}
      >
        윤영희 <span style={{ fontSize: 38, color: C.gray, fontWeight: 700 }}>선생님</span>
      </div>

      <div style={{ fontSize: 30, color: C.gray, marginTop: 22 }}>
        『구문정독』 저자 · TIME to TOP 대표
      </div>
      <div style={{ fontSize: 26, color: C.gray, marginTop: 18, lineHeight: 1.7 }}>
        목동에서 수많은 학생을 영재학교·SKY·의예과
        <br />합격과 수능 영어 최상위권으로 이끈 전문가
      </div>

      <Bar mt={52} mb={52} />

      <div
        style={{
          fontFamily: serif,
          fontWeight: 700,
          fontSize: 62,
          lineHeight: 1.45,
          color: C.deep,
        }}
      >
        "우리 구미의 아이들도
        <br />수능 최저의 벽을
        <br />넘을 수 있습니다"
      </div>

      <Footer>저자가 구미까지 직접 걸음 해 주십니다</Footer>
    </Frame>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 28, alignItems: "baseline", justifyContent: "center" }}>
      <div style={{ width: 80, textAlign: "left", fontWeight: 700, fontSize: 30, color: C.primary }}>
        {label}
      </div>
      <div style={{ fontSize: 32, color: C.ink, textAlign: "left" }}>{value}</div>
    </div>
  );
}

function Card5() {
  return (
    <Frame index={5}>
      <Label>지금 신청하세요</Label>

      <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 22 }}>
        <InfoRow label="일시" value="2026. 10. 17 (토) 오후 1~3시" />
        <InfoRow label="장소" value="구미코(GUMICO)" />
        <InfoRow label="대상" value="초4~중3 학부모 · 사전 예약제" />
      </div>

      <div
        style={{
          width: 300,
          height: 300,
          marginTop: 48,
          border: `1px solid ${C.lavBorder}`,
          borderRadius: 20,
          background: "#F4F2F8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 46,
          fontWeight: 700,
          color: C.gray,
          letterSpacing: 4,
        }}
      >
        QR
      </div>

      <div style={{ fontSize: 30, fontWeight: 700, color: C.deep, marginTop: 34 }}>
        휴대폰으로 스캔 · 온라인 간편 신청
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.primary, marginTop: 14 }}>
        gwj-orbit.vercel.app/seminar
      </div>

      <Footer>문의 054-474-0704 · 카카오채널 「공우정」</Footer>
    </Frame>
  );
}

const CARDS = [
  { id: 1, node: <Card1 /> },
  { id: 2, node: <Card2 /> },
  { id: 3, node: <Card3 /> },
  { id: 4, node: <Card4 /> },
  { id: 5, node: <Card5 /> },
];

export default function SeminarCards() {
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "학부모 세미나 카드뉴스 — 공우정바른학원";
    let alive = true;
    const done = () => alive && setFontsReady(true);
    if (document.fonts?.ready) document.fonts.ready.then(done).catch(done);
    else done();
    return () => {
      alive = false;
    };
  }, []);

  const download = async (i: number) => {
    const node = refs.current[i];
    if (!node) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        width: 1080,
        height: 1350,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `공우정_세미나_카드${i + 1}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < CARDS.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await download(i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <div style={{ background: "#F7F6FB", minHeight: "100vh", padding: "24px 12px 80px" }}>
      <header style={{ maxWidth: 1080, margin: "0 auto 20px", fontFamily: sans }}>
        <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, color: C.deep }}>
          학부모 세미나 카드뉴스 (4:5 · 1080×1350)
        </h1>
        <p style={{ fontSize: 14, color: C.gray, marginTop: 6 }}>
          {fontsReady ? "폰트 준비 완료 — 2160×2700 PNG로 저장됩니다." : "폰트 불러오는 중…"}
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            disabled={!fontsReady || busy}
            onClick={downloadAll}
            style={{
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 700,
              cursor: "pointer",
              opacity: !fontsReady || busy ? 0.5 : 1,
            }}
          >
            전체 다운로드
          </button>
          <Link
            to="/blog-skin"
            style={{
              background: "#fff",
              color: C.deep,
              border: `1px solid ${C.lavBorder}`,
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            블로그 배경 디자인 →
          </Link>
        </div>
      </header>

      <main style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        {CARDS.map((c, i) => (
          <section key={c.id} style={{ width: "min(1080px, 100%)" }}>
            <div
              style={{
                width: "100%",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 1080,
                  transformOrigin: "top center",
                  boxShadow: "0 8px 30px rgba(74,52,117,0.10)",
                }}
                className="card-scale"
              >
                <div ref={(el) => (refs.current[i] = el)}>{c.node}</div>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                disabled={!fontsReady || busy}
                onClick={() => download(i)}
                style={{
                  background: "#fff",
                  color: C.deep,
                  border: `1px solid ${C.lavBorder}`,
                  borderRadius: 10,
                  padding: "8px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: !fontsReady || busy ? 0.5 : 1,
                }}
              >
                카드 {c.id} PNG 다운로드
              </button>
            </div>
          </section>
        ))}
      </main>

      <style>{`
        @media (max-width: 1120px) {
          .card-scale { transform: scale(calc((100vw - 32px) / 1080)); height: calc(1350px * (100vw - 32px) / 1080); }
        }
      `}</style>
    </div>
  );
}
