import { useState, useMemo, useEffect, useRef, useId } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  ComposedChart,
  Area,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import katex from "katex";
import "katex/dist/katex.min.css";

// ---------- KaTeX helper ----------
function Tex({ tex, display = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      katex.render(tex, ref.current, {
        throwOnError: false,
        displayMode: display,
      });
    }
  }, [tex, display]);
  return <span ref={ref} />;
}

// ---------- Theme tokens ----------
const theme = {
  light: {
    bg: "#fafaf7",
    panel: "#ffffff",
    border: "#e5e5e0",
    text: "#1a1a1a",
    textMuted: "#6b6b6b",
    accent: "#2a6f4d",
    grow: "#2a8a5c",
    decay: "#c0392b",
    neutral: "#3b3b3b",
    grid: "#ececec",
    curveStroke: ["#2a6f4d", "#4a90c2", "#a86b2c", "#7a4a9c", "#c0392b"],
  },
  dark: {
    bg: "#0f1115",
    panel: "#161a21",
    border: "#262b35",
    text: "#e8e8e6",
    textMuted: "#9aa0aa",
    accent: "#5fd49a",
    grow: "#5fd49a",
    decay: "#e87d6f",
    neutral: "#cfcfcf",
    grid: "#222831",
    curveStroke: ["#5fd49a", "#7ab8e0", "#e0a76e", "#b894d8", "#e87d6f"],
  },
};

// ---------- Math helpers ----------
const Kstar = (s, d) => (s / d) ** 2;

// Closed form for β = 1/2:
//   K(t) = [ s/δ + (√K₀ − s/δ) e^{−δt/2} ]²
const Kof = (t, K0, s, d) => {
  const A = s / d;
  const B = Math.sqrt(Math.max(K0, 0)) - A;
  const v = A + B * Math.exp(-(d * t) / 2);
  return v * v;
};

// g(K) = sK^{1/2} − δK
const gOf = (K, s, d) => s * Math.sqrt(Math.max(K, 0)) - d * K;

const midpointTime = (K0, s, d) => {
  const Keq = Kstar(s, d);
  if (Math.abs(Keq - K0) < 1e-9) return 0;

  const A = s / d;
  const target = (K0 + Keq) / 2;
  const numerator = Math.sqrt(target) - A;
  const denominator = Math.sqrt(K0) - A;
  const ratio = numerator / denominator;

  if (ratio <= 0 || ratio >= 1 || !isFinite(ratio)) return null;
  return (-2 * Math.log(ratio)) / d;
};

const fmt = (x, p = 3) => {
  if (!isFinite(x)) return "–";
  if (Math.abs(x) >= 1000) return x.toFixed(0);
  if (Math.abs(x) >= 10) return x.toFixed(2);
  return x.toFixed(p);
};

// ---------- Slider primitive ----------
function Slider({ label, sym, value, min, max, step, onChange, t, suffix }) {
  const id = useId();

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          fontSize: 13,
          color: t.textMuted,
        }}
      >
        <label htmlFor={id}>
          <Tex tex={sym} />{" "}
          <span style={{ color: t.textMuted, marginLeft: 4 }}>{label}</span>
        </label>
        <span style={{ color: t.text, fontVariantNumeric: "tabular-nums" }}>
          {fmt(value)}
          {suffix || ""}
        </span>
      </div>
      <input
        id={id}
        aria-label={`${label} (${sym})`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%",
          accentColor: t.accent,
        }}
      />
    </div>
  );
}

// ---------- Main component ----------
export default function PortfolioDynamics() {
  const [dark, setDark] = useState(false);
  const t = dark ? theme.dark : theme.light;

  const [K0, setK0] = useState(1);
  const [s, setS] = useState(0.3);
  const [d, setD] = useState(0.1);
  const [tMax, setTMax] = useState(50);

  const Keq = useMemo(() => Kstar(s, d), [s, d]);

  // Family of K0 values around the user's choice — shows convergence from above and below.
  const k0Family = useMemo(() => {
    const set = new Set([
      Math.max(0.05, K0 * 0.1),
      Math.max(0.1, K0 * 0.5),
      K0,
      Keq * 1.5,
      Keq * 2.5,
    ]);
    return [...set]
      .filter((v) => v > 0 && v <= 25)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }, [K0, Keq]);

  // Solution curve data
  const curveData = useMemo(() => {
    const N = 220;
    const rows = [];
    for (let i = 0; i <= N; i++) {
      const tt = (i / N) * tMax;
      const row = { t: tt };
      k0Family.forEach((k0, idx) => {
        row[`k${idx}`] = Kof(tt, k0, s, d);
      });
      rows.push(row);
    }
    return rows;
  }, [k0Family, s, d, tMax]);

  // g(K) phase plot data — extended a bit past K* to show decay region
  const gData = useMemo(() => {
    const Kmax = Math.max(Keq * 2.2, K0 * 1.2, 1);
    const N = 200;
    const rows = [];
    for (let i = 0; i <= N; i++) {
      const K = (i / N) * Kmax;
      const g = gOf(K, s, d);
      rows.push({ K, g, gPos: g >= 0 ? g : 0, gNeg: g < 0 ? g : 0 });
    }
    return rows;
  }, [s, d, Keq, K0]);

  const currentMidpointTime = midpointTime(K0, s, d);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        fontFamily:
          '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        transition: "background 200ms ease, color 200ms ease",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        input[type=range] { height: 4px; }
        .panel-title {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: ${t.textMuted};
          margin: 0 0 14px;
          font-weight: 500;
        }
        .hero-equation-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
          gap: 20px;
        }
        .main-grid {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          gap: 24px;
        }
        .split-heading {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
        }
        @media (max-width: 820px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
          .parameter-panel {
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
          }
          .split-heading {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "32px 28px 80px",
        }}
      >
        {/* Top utility strip (just the theme toggle) */}
        <header
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <button
            onClick={() => setDark((v) => !v)}
            style={{
              background: "transparent",
              color: t.text,
              border: `1px solid ${t.border}`,
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {dark ? "Light" : "Dark"} mode
          </button>
        </header>

        {/* §1 Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            padding: "36px 0 44px",
            borderBottom: `1px solid ${t.border}`,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: t.accent,
              marginBottom: 14,
            }}
          >
            Interactive Solow-style reinvestment model
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 5vw, 52px)",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
              fontWeight: 600,
              color: t.text,
            }}
          >
            Portfolio Reinvestment Dynamics
          </h1>
          <div
            style={{
              fontSize: "clamp(15px, 1.6vw, 19px)",
              color: t.textMuted,
              maxWidth: 720,
              lineHeight: 1.5,
              marginBottom: 32,
            }}
          >
            A Solow-inspired capital accumulation equation reinterpreted for
            portfolio reinvestment, drag, stability, and long-run wealth.
          </div>

          <div
            className="hero-equation-grid"
            style={{
            }}
          >
            <div
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "18px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: t.textMuted,
                  marginBottom: 10,
                }}
              >
                Governing ODE
              </div>
              <Tex display tex="\dfrac{dK}{dt} = sK^{\beta} - \delta K" />
              <div
                style={{
                  fontSize: 12,
                  color: t.textMuted,
                  marginTop: 10,
                  lineHeight: 1.6,
                }}
              >
                <Tex tex="K(t)" /> is investable wealth,{" "}
                <Tex tex="s\in(0,1)" /> the reinvestment ratio,{" "}
                <Tex tex="\delta>0" /> the drag rate, and{" "}
                <Tex tex="\beta\in(0,1)" /> the diminishing-returns exponent.
              </div>
            </div>

            <div
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "18px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: t.textMuted,
                  marginBottom: 10,
                }}
              >
                Model origin
              </div>
              <Tex display tex="Y = K^{\alpha}L^{1-\alpha}" />
              <div
                style={{
                  fontSize: 12,
                  color: t.textMuted,
                  marginTop: 10,
                  lineHeight: 1.6,
                }}
              >
                The model starts with Cobb-Douglas production, follows Solow's
                reduction to a one-variable dynamic system, then replaces
                economic output with portfolio wealth and investment drag.
              </div>
            </div>

            <div
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "18px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: t.textMuted,
                  marginBottom: 10,
                }}
              >
                Closed form (β = 1/2)
              </div>
              <Tex
                display
                tex="K(t) = \!\left[\dfrac{s}{\delta} + \!\left(\sqrt{K_{0}} - \dfrac{s}{\delta}\right)\!e^{-\delta t/2}\right]^{\!2}"
              />
              <div
                style={{
                  fontSize: 12,
                  color: t.textMuted,
                  marginTop: 10,
                  lineHeight: 1.6,
                }}
              >
                For the tractable case <Tex tex="\beta=1/2" />, the substitution{" "}
                <Tex tex="u = K^{1/2}" /> gives this closed form and confirms
                convergence to <Tex tex="K^{*} = (s/\delta)^{2}" />.
              </div>
            </div>
          </div>
        </motion.section>

        {/* Live values strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            alignItems: "baseline",
            padding: "0 4px",
            marginBottom: 28,
            fontSize: 13,
            color: t.textMuted,
          }}
        >
          <span>
            current equilibrium{" "}
            <span style={{ color: t.text, marginLeft: 6 }}>
              <Tex
                tex={`K^{*} = \\left(\\tfrac{s}{\\delta}\\right)^{2} = ${fmt(Keq)}`}
              />
            </span>
          </span>
          <span>
            midpoint time{" "}
            <span style={{ color: t.text, marginLeft: 6 }}>
              {currentMidpointTime === null ? (
                "not defined"
              ) : (
                <Tex tex={`t_{mid} = ${fmt(currentMidpointTime, 2)}`} />
              )}
            </span>
          </span>
        </motion.div>

        {/* Layout: controls + plots */}
        <div
          className="main-grid"
          style={{
          }}
        >
          {/* ---- Controls ---- */}
          <aside
            className="parameter-panel"
            style={{
              background: t.panel,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: 20,
              alignSelf: "start",
              position: "sticky",
              top: 16,
              zIndex: 50,
              isolation: "isolate",
            }}
          >
            <h3 className="panel-title">Parameters</h3>
            <Slider
              label="initial wealth"
              sym="K_{0}"
              value={K0}
              min={0.05}
              max={25}
              step={0.05}
              onChange={setK0}
              t={t}
            />
            <Slider
              label="reinvestment ratio"
              sym="s"
              value={s}
              min={0.05}
              max={0.95}
              step={0.01}
              onChange={setS}
              t={t}
            />
            <Slider
              label="drag rate"
              sym="\\delta"
              value={d}
              min={0.05}
              max={0.5}
              step={0.005}
              onChange={setD}
              t={t}
            />
            <Slider
              label="time horizon"
              sym="t_{\\max}"
              value={tMax}
              min={5}
              max={100}
              step={1}
              onChange={setTMax}
              t={t}
            />

            <div
              style={{
                borderTop: `1px solid ${t.border}`,
                marginTop: 18,
                paddingTop: 14,
                fontSize: 12,
                color: t.textMuted,
                lineHeight: 1.7,
              }}
            >
              <div>
                <Tex tex="K^{*}" /> is the wealth level where reinvestment
                exactly offsets drag.
              </div>
              <div>
                <Tex tex="t_{mid}" /> measures the time to move halfway from{" "}
                <Tex tex="K_{0}" /> to <Tex tex="K^{*}" />.
              </div>
            </div>
          </aside>

          {/* ---- Right column: plots ---- */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* §2 Solution curves */}
            <section
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 12,
                }}
              >
                <h3
                  className="panel-title"
                  style={{ margin: 0, textTransform: "none" }}
                >
                  §2 · Solution curves <Tex tex="K(t)" />
                </h3>
                <div style={{ fontSize: 12, color: t.textMuted }}>
                  curves from a family of <Tex tex="K_{0}" />, all converging
                  to <Tex tex="K^{*}" />
                </div>
              </div>

              <div style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={curveData}
                    margin={{ top: 10, right: 28, left: 8, bottom: 28 }}
                  >
                    <CartesianGrid stroke={t.grid} strokeDasharray="2 4" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[0, tMax]}
                      tickFormatter={(v) => v.toFixed(0)}
                      stroke={t.textMuted}
                      tick={{ fill: t.textMuted, fontSize: 11 }}
                      label={{
                        value: "t",
                        position: "insideBottom",
                        offset: -10,
                        fill: t.textMuted,
                        fontStyle: "italic",
                      }}
                    />
                    <YAxis
                      stroke={t.textMuted}
                      tick={{ fill: t.textMuted, fontSize: 11 }}
                      tickFormatter={(v) => fmt(v, 1)}
                      label={{
                        value: "K(t)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 18,
                        fill: t.textMuted,
                        fontStyle: "italic",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: t.panel,
                        border: `1px solid ${t.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        color: t.text,
                      }}
                      labelFormatter={(v) => `t = ${fmt(v, 2)}`}
                      formatter={(v, n) => [fmt(v), n]}
                    />
                    <ReferenceLine
                      y={Keq}
                      stroke={t.neutral}
                      strokeDasharray="6 4"
                      label={{
                        value: `K* = ${fmt(Keq)}`,
                        position: "right",
                        fill: t.neutral,
                        fontSize: 11,
                      }}
                    />
                    {k0Family.map((k0, idx) => (
                      <Line
                        key={idx}
                        type="monotone"
                        dataKey={`k${idx}`}
                        name={`K₀ = ${fmt(k0, 2)}`}
                        stroke={t.curveStroke[idx % t.curveStroke.length]}
                        strokeWidth={k0 === K0 ? 2.4 : 1.4}
                        dot={false}
                        isAnimationActive={false}
                        opacity={k0 === K0 ? 1 : 0.75}
                      />
                    ))}
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: 11, color: t.textMuted }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* §3 Phase line */}
            <section
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 12,
                }}
              >
                <h3 className="panel-title" style={{ margin: 0 }}>
                  §3 · Phase line on <Tex tex="K" />
                </h3>
                <div style={{ fontSize: 12, color: t.textMuted }}>
                  arrows show sign of <Tex tex="dK/dt" />
                </div>
              </div>

              <PhaseLine Keq={Keq} K0={K0} t={t} />
            </section>

            {/* §4 g(K) phase plot */}
            <section
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 12,
                }}
              >
                <h3
                  className="panel-title"
                  style={{ margin: 0, textTransform: "none" }}
                >
                  §4 · <Tex tex="\dfrac{dK}{dt} = sK^{1/2} - \delta K" />
                </h3>
                <div style={{ fontSize: 12, color: t.textMuted }}>
                  zero crossing locates <Tex tex="K^{*}" />
                </div>
              </div>

              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={gData}
                    margin={{ top: 28, right: 28, left: 8, bottom: 28 }}
                  >
                    <CartesianGrid stroke={t.grid} strokeDasharray="2 4" />
                    <XAxis
                      dataKey="K"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => fmt(v, 1)}
                      stroke={t.textMuted}
                      tick={{ fill: t.textMuted, fontSize: 11 }}
                      label={{
                        value: "K",
                        position: "insideBottom",
                        offset: -10,
                        fill: t.textMuted,
                        fontStyle: "italic",
                      }}
                    />
                    <YAxis
                      stroke={t.textMuted}
                      tick={{ fill: t.textMuted, fontSize: 11 }}
                      tickFormatter={(v) => fmt(v, 2)}
                      label={{
                        value: "dK/dt",
                        angle: -90,
                        position: "insideLeft",
                        offset: 18,
                        fill: t.textMuted,
                        fontStyle: "italic",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: t.panel,
                        border: `1px solid ${t.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        color: t.text,
                      }}
                      labelFormatter={(v) => `K = ${fmt(v, 2)}`}
                      formatter={(v, n) => {
                        if (n === "gPos" || n === "gNeg") return [null, null];
                        return [fmt(v, 3), "dK/dt"];
                      }}
                    />
                    <ReferenceLine y={0} stroke={t.textMuted} />
                    <ReferenceLine
                      x={Keq}
                      stroke={t.neutral}
                      strokeDasharray="6 4"
                      label={{
                        value: `K* = ${fmt(Keq)}`,
                        position: "top",
                        fill: t.neutral,
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="gPos"
                      stroke="none"
                      fill={t.grow}
                      fillOpacity={0.18}
                      isAnimationActive={false}
                      legendType="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="gNeg"
                      stroke="none"
                      fill={t.decay}
                      fillOpacity={0.18}
                      isAnimationActive={false}
                      legendType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="g"
                      stroke={t.text}
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 18,
                  fontSize: 12,
                  color: t.textMuted,
                  marginTop: 6,
                }}
              >
                <span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      background: t.grow,
                      opacity: 0.6,
                      borderRadius: 2,
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  dK/dt &gt; 0 — capital accumulates
                </span>
                <span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      background: t.decay,
                      opacity: 0.6,
                      borderRadius: 2,
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  dK/dt &lt; 0 — capital decays
                </span>
              </div>
            </section>
          </div>
        </div>

        {/* §5 Derivation — full width below the grid */}
        <Derivation t={t} Keq={Keq} s={s} d={d} K0={K0} />

        {/* §6 Financial interpretation */}
        <Interpretation t={t} s={s} d={d} />
      </div>
    </div>
  );
}

// ---------- §5 Derivation (collapsible) ----------
const STEPS = [
  {
    title: "Step 1 — Equilibrium analysis",
    summary: "Solve the general beta model before specializing to beta = 1/2.",
    body: (
      <>
        <p>
          To find equilibrium, set <Tex tex="\dfrac{dK}{dt}=0" />. Economically,
          this is the wealth level where reinvestment gains are exactly offset
          by drag.
        </p>
        <Tex
          display
          tex="\dfrac{dK}{dt}=sK^{\beta}-\delta K=K\!\left(sK^{\beta-1}-\delta\right)."
        />
        <p>
          This gives two critical values: <Tex tex="K=0" /> or{" "}
          <Tex tex="\delta=sK^{\beta-1}" />. Because wealth is restricted to{" "}
          <Tex tex="K\in\mathbb{R}^{+}" />, <Tex tex="K=0" /> is excluded from
          the model. Solving the remaining condition gives
        </p>
        <Tex
          display
          tex="sK^{\beta-1}=\delta
          \quad\Longrightarrow\quad
          K^{\beta-1}=\dfrac{\delta}{s}
          \quad\Longrightarrow\quad
          K^{*}=\left(\dfrac{\delta}{s}\right)^{\frac{1}{\beta-1}}."
        />
        <p>
          This is the positive equilibrium point. When{" "}
          <Tex tex="\beta=\tfrac12" />, it simplifies to{" "}
          <Tex tex="K^{*}=(s/\delta)^2" />.
        </p>
      </>
    ),
  },
  {
    title: "Step 2 — Sign analysis & stability",
    summary: "Show dK/dt is positive below K* and negative above K*.",
    body: (
      <>
        <p>
          For <Tex tex="K<K^{*}" />, use the definition{" "}
          <Tex tex="K^{*}=(\delta/s)^{1/(\beta-1)}" />. Since{" "}
          <Tex tex="\beta-1<0" />, raising both sides to{" "}
          <Tex tex="\beta-1" /> flips the inequality:
        </p>
        <Tex
          display
          tex="K<K^{*}
          \quad\Longrightarrow\quad
          K^{\beta-1}>\dfrac{\delta}{s}
          \quad\Longrightarrow\quad
          sK^{\beta}-\delta K>0
          \quad\Longrightarrow\quad
          \dfrac{dK}{dt}>0."
        />
        <p>
          For <Tex tex="K>K^{*}" />, the same inequality reversal gives the
          opposite sign:
        </p>
        <Tex
          display
          tex="K>K^{*}
          \quad\Longrightarrow\quad
          K^{\beta-1}<\dfrac{\delta}{s}
          \quad\Longrightarrow\quad
          sK^{\beta}-\delta K<0
          \quad\Longrightarrow\quad
          \dfrac{dK}{dt}<0."
        />
        <p>
          Thus the model increases below <Tex tex="K^{*}" /> and decreases
          above <Tex tex="K^{*}" />, so the positive equilibrium is stable and
          trajectories converge to <Tex tex="K^{*}" />.
        </p>
      </>
    ),
  },
  {
    title: "Step 3 — Specialize to beta = 1/2",
    summary: "Use the tractable case from the analytical solution section.",
    body: (
      <>
        <p>
          The general equation is separable. Setting{" "}
          <Tex tex="\beta=\tfrac12" /> produces a clean closed form:
        </p>
        <Tex display tex="\dfrac{dK}{dt}=sK^{1/2}-\delta K." />
        <p>
          Let <Tex tex="u=K^{1/2}" />, so <Tex tex="K=u^2" /> and{" "}
          <Tex tex="\dfrac{dK}{dt}=2u\,\dfrac{du}{dt}" />. Substitution gives
        </p>
        <Tex display tex="2u\,\dfrac{du}{dt}=su-\delta u^2." />
        <p>
          For <Tex tex="u>0" />, divide by <Tex tex="2u" /> and rearrange:
        </p>
        <Tex
          display
          tex="\dfrac{du}{dt}=\dfrac{s}{2}-\dfrac{\delta u}{2}
          \quad\Longrightarrow\quad
          \dfrac{du}{dt}+\dfrac{\delta}{2}u=\dfrac{s}{2}."
        />
      </>
    ),
  },
  {
    title: "Step 4 — Integrating factor",
    summary: "Solve the linear ODE for u(t).",
    body: (
      <>
        <p>
          The integrating factor is <Tex tex="e^{\int \delta/2\,dt}=e^{\delta t/2}" />.
          Multiplying through,
        </p>
        <Tex
          display
          tex="e^{\delta t/2}\!\left(\dfrac{du}{dt}+\dfrac{\delta}{2}u\right)
          =e^{\delta t/2}\dfrac{s}{2}."
        />
        <p>Integrating both sides,</p>
        <Tex
          display
          tex="ue^{\delta t/2}=\dfrac{s}{\delta}e^{\delta t/2}+C
          \quad\Longrightarrow\quad
          u=\dfrac{s}{\delta}+Ce^{-\delta t/2}."
        />
        <Tex
          display
          tex="K^{1/2}=\dfrac{s}{\delta}+Ce^{-\delta t/2}
          \quad\Longrightarrow\quad
          K=\left(\dfrac{s}{\delta}+Ce^{-\delta t/2}\right)^2."
        />
      </>
    ),
  },
  {
    title: "Step 5 — Initial condition",
    summary: "Solve for C using K(0) = K0.",
    body: (
      <>
        <p>
          Apply <Tex tex="K(0)=K_0" /> to solve for the constant:
        </p>
        <Tex
          display
          tex="K_0=\left(\dfrac{s}{\delta}+C\right)^2
          \quad\Longrightarrow\quad
          \sqrt{K_0}=\dfrac{s}{\delta}+C
          \quad\Longrightarrow\quad
          C=\sqrt{K_0}-\dfrac{s}{\delta}."
        />
        <p>The closed-form solution is therefore</p>
        <Tex
          display
          tex="\boxed{K(t)=\left(\dfrac{s}{\delta}
          +\left(\sqrt{K_0}-\dfrac{s}{\delta}\right)e^{-\delta t/2}\right)^2.}"
        />
        <p>
          As <Tex tex="t\to\infty" />, the exponential term vanishes and{" "}
          <Tex tex="K(t)\to(s/\delta)^2=K^{*}" />, confirming the positive
          equilibrium.
        </p>
      </>
    ),
  },
  {
    title: "Step 6 — Numerical example",
    summary: "Use s = 0.30, delta = 0.10, beta = 0.50, and K0 = 1.",
    body: (
      <>
        <p>
          For the baseline numerical example,{" "}
          <Tex tex="s=0.30,\ \delta=0.10,\ \beta=0.50,\ K_0=1" />. The
          equilibrium is computed from the general formula:
        </p>
        <Tex
          display
          tex="K^{*}=\left(\dfrac{0.10}{0.30}\right)^{\frac{1}{0.5-1}}
          =\left(\dfrac{1}{3}\right)^{-2}=9."
        />
        <p>
          Setting <Tex tex="K(t)=9" /> gives{" "}
          <Tex tex="3=3-2e^{-0.05t}" />, so the model approaches equilibrium
          asymptotically and never reaches it in finite time. A useful finite
          benchmark is the halfway wealth level <Tex tex="K=5" />:
        </p>
        <Tex
          display
          tex="\sqrt{5}=3-2e^{-0.05t}
          \quad\Longrightarrow\quad
          t=\dfrac{\ln\!\left((3-\sqrt{5})/2\right)}{-0.05}
          \approx 19.25."
        />
        <p>
          This is the midpoint time shown in the takeaway section.
        </p>
      </>
    ),
  },
];

function Derivation({ t, Keq, s, d, K0 }) {
  const [open, setOpen] = useState(() => new Set([0]));
  const allOpen = open.size === STEPS.length;
  const midTime = midpointTime(K0, s, d);

  const toggle = (i) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const expandAll = () =>
    setOpen(allOpen ? new Set() : new Set(STEPS.map((_, i) => i)));

  return (
    <section
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: 24,
        marginTop: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 18,
        }}
      >
        <h3 className="panel-title" style={{ margin: 0 }}>
          §5 · Mathematical derivation
        </h3>
        <button
          onClick={expandAll}
          style={{
            background: "transparent",
            color: t.textMuted,
            border: `1px solid ${t.border}`,
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 11,
            letterSpacing: 0.4,
            cursor: "pointer",
          }}
        >
          {allOpen ? "collapse all" : "expand all"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {STEPS.map((step, i) => {
          const isOpen = open.has(i);
          return (
            <div
              key={i}
              style={{
                borderTop: i === 0 ? `1px solid ${t.border}` : "none",
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <button
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  color: t.text,
                  border: "none",
                  padding: "14px 4px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 15,
                  fontFamily: "inherit",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500 }}>{step.title}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: t.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {step.summary}
                  </span>
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    color: t.textMuted,
                    fontSize: 14,
                    display: "inline-block",
                    marginLeft: 12,
                  }}
                >
                  ▸
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        padding: "4px 4px 18px",
                        color: t.text,
                        lineHeight: 1.7,
                        fontSize: 15,
                      }}
                    >
                      <style>{`
                        .deriv-body p { margin: 0 0 10px; }
                        .deriv-body p:last-child { margin-bottom: 0; }
                      `}</style>
                      <div className="deriv-body">{step.body}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Numerical sanity-check chip */}
      <div
        style={{
          marginTop: 18,
          padding: "10px 14px",
          background: "transparent",
          border: `1px dashed ${t.border}`,
          borderRadius: 8,
          fontSize: 12,
          color: t.textMuted,
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <span>
          current parameters · <Tex tex={`s=${fmt(s, 2)}`} />,{" "}
          <Tex tex={`\\delta=${fmt(d, 2)}`} />,{" "}
          <Tex tex={`K_{0}=${fmt(K0, 2)}`} />
        </span>
        <span>
          ⇒ <Tex tex={`K^{*}=(s/\\delta)^{2}=${fmt(Keq)}`} />
        </span>
        <span>
          ⇒{" "}
          {midTime === null ? (
            <Tex tex="t_{mid}\text{ not defined}" />
          ) : (
            <Tex tex={`t_{mid}=${fmt(midTime, 2)}`} />
          )}
        </span>
      </div>
    </section>
  );
}

// ---------- Phase line (SVG) ----------
function PhaseLine({ Keq, K0, t }) {
  // axis range: 0 → max(2·K*, 1.5·K0, 1)
  const Kmax = Math.max(Keq * 2, K0 * 1.5, 1);
  const W = 880;
  const H = 130;
  const padX = 40;
  const axisY = 78;

  const xOf = (K) => padX + (K / Kmax) * (W - 2 * padX);

  // Sample arrow positions in (0, K*) and (K*, Kmax)
  const left = [0.15, 0.35, 0.6, 0.85].map((f) => f * Keq);
  const right = [1.15, 1.4, 1.7].map((f) => f * Keq).filter((K) => K < Kmax);

  const Arrow = ({ K, dir }) => {
    const x = xOf(K);
    const len = 22;
    const x0 = dir > 0 ? x - len / 2 : x + len / 2;
    const x1 = dir > 0 ? x + len / 2 : x - len / 2;
    const color = dir > 0 ? t.grow : t.decay;
    return (
      <g>
        <line
          x1={x0}
          y1={axisY}
          x2={x1}
          y2={axisY}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <polygon
          points={
            dir > 0
              ? `${x1},${axisY} ${x1 - 6},${axisY - 4} ${x1 - 6},${axisY + 4}`
              : `${x1},${axisY} ${x1 + 6},${axisY - 4} ${x1 + 6},${axisY + 4}`
          }
          fill={color}
        />
      </g>
    );
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        aria-labelledby="phase-line-title phase-line-desc"
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", maxWidth: "100%" }}
      >
        <title id="phase-line-title">Phase line for capital dynamics</title>
        <desc id="phase-line-desc">
          Arrows point right below the positive equilibrium and left above it.
          K equals zero is shown only as the excluded boundary of the positive
          wealth state space.
        </desc>
        {/* shaded growth/decay regions */}
        <rect
          x={xOf(0)}
          y={axisY - 16}
          width={xOf(Keq) - xOf(0)}
          height={32}
          fill={t.grow}
          opacity={0.08}
        />
        <rect
          x={xOf(Keq)}
          y={axisY - 16}
          width={xOf(Kmax) - xOf(Keq)}
          height={32}
          fill={t.decay}
          opacity={0.08}
        />

        {/* axis */}
        <line
          x1={padX}
          y1={axisY}
          x2={W - padX}
          y2={axisY}
          stroke={t.textMuted}
          strokeWidth={1}
        />

        {/* tick markers + labels along axis */}
        {[0, Keq / 2, Keq, (Keq + Kmax) / 2, Kmax].map((K, i) => (
          <g key={i}>
            <line
              x1={xOf(K)}
              y1={axisY - 4}
              x2={xOf(K)}
              y2={axisY + 4}
              stroke={t.textMuted}
              strokeWidth={1}
            />
            <text
              x={xOf(K)}
              y={axisY + 22}
              fill={t.textMuted}
              fontSize={10}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {fmt(K, 2)}
            </text>
          </g>
        ))}

        {/* arrows */}
        {left.map((K, i) => (
          <Arrow key={`l${i}`} K={K} dir={+1} />
        ))}
        {right.map((K, i) => (
          <Arrow key={`r${i}`} K={K} dir={-1} />
        ))}

        {/* K = 0 boundary marker */}
        <g>
          <circle
            cx={xOf(0)}
            cy={axisY}
            r={6}
            fill={t.bg}
            stroke={t.decay}
            strokeWidth={2}
          />
          <text
            x={xOf(0)}
            y={axisY - 22}
            fill={t.text}
            fontSize={11}
            textAnchor="middle"
          >
            K = 0
          </text>
          <text
            x={xOf(0)}
            y={axisY - 36}
            fill={t.decay}
            fontSize={10}
            textAnchor="middle"
            fontStyle="italic"
          >
            boundary
          </text>
        </g>

        {/* K* (stable) */}
        <g>
          <circle cx={xOf(Keq)} cy={axisY} r={6} fill={t.accent} />
          <text
            x={xOf(Keq)}
            y={axisY - 22}
            fill={t.text}
            fontSize={11}
            textAnchor="middle"
          >
            K* = {fmt(Keq)}
          </text>
          <text
            x={xOf(Keq)}
            y={axisY - 36}
            fill={t.accent}
            fontSize={10}
            textAnchor="middle"
            fontStyle="italic"
          >
            stable
          </text>
        </g>

        {/* current K0 marker */}
        {K0 <= Kmax && (
          <g>
            <line
              x1={xOf(K0)}
              y1={axisY - 12}
              x2={xOf(K0)}
              y2={axisY + 12}
              stroke={t.text}
              strokeWidth={1.5}
            />
            <text
              x={xOf(K0)}
              y={axisY + 38}
              fill={t.text}
              fontSize={10}
              textAnchor="middle"
            >
              K₀
            </text>
          </g>
        )}
      </svg>

      <div
        style={{
          display: "flex",
          gap: 18,
          fontSize: 12,
          color: t.textMuted,
          marginTop: 8,
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: t.grow,
              borderRadius: 2,
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          dK/dt &gt; 0 (growth)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: t.decay,
              borderRadius: 2,
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          dK/dt &lt; 0 (decay)
        </span>
      </div>
    </div>
  );
}

// ---------- §6 Findings ----------
function Interpretation({ t, s, d }) {
  const baselineK0 = 1;
  const sensitivityRows = [
    { s: 0.3, d: 0.1 },
    { s: 0.4, d: 0.1 },
    { s: 0.3, d: 0.05 },
    { s: 0.2, d: 0.1 },
  ].map((row) => ({
    ...row,
    K: Kstar(row.s, row.d),
    midpoint: midpointTime(baselineK0, row.s, row.d),
  }));

  const activeMidpointTime = midpointTime(baselineK0, s, d);

  return (
    <section
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: 24,
        marginTop: 24,
      }}
    >
      <h3 className="panel-title" style={{ marginTop: 0 }}>
        §6 · Numerical example and takeaways
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          gap: 24,
          marginBottom: 26,
        }}
      >
        <div
          style={{
            borderLeft: `3px solid ${t.grow}`,
            paddingLeft: 14,
            color: t.text,
            lineHeight: 1.7,
            fontSize: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: t.grow,
              marginBottom: 6,
              }}
            >
            Baseline example
          </div>
          With <Tex tex="s=0.30" />, <Tex tex="\delta=0.10" />,{" "}
          <Tex tex="\beta=0.50" />, and <Tex tex="K_{0}=1" />, the stable
          equilibrium is <Tex tex="K^{*}=9" />. The portfolio does not reach
          equilibrium in finite time, so a finite benchmark is the midpoint
          from <Tex tex="K_{0}=1" /> to <Tex tex="K^{*}=9" />, which is{" "}
          <Tex tex="K=5" /> and occurs at about <Tex tex="t_{mid}=19.25" /> years.
        </div>

        <div
          style={{
            borderLeft: `3px solid ${t.decay}`,
            paddingLeft: 14,
            color: t.text,
            lineHeight: 1.7,
            fontSize: 14,
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: t.decay,
              marginBottom: 6,
              }}
            >
            Current slider version
          </div>
          The controls above let the same calculation vary. Your current
          settings give <Tex tex={`K^{*}=${fmt(Kstar(s, d), 2)}`} />. Starting
          from <Tex tex="K_{0}=1" />, the midpoint time is{" "}
          {activeMidpointTime === null ? (
            "not defined for this parameter combination"
          ) : (
            <Tex tex={`t_{mid}=${fmt(activeMidpointTime, 2)}`} />
          )}
          . Larger <Tex tex="s" /> raises terminal wealth; larger{" "}
          <Tex tex="\delta" /> lowers terminal wealth by making drag stronger.
        </div>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, color: t.textMuted }}>
        Sensitivity table for <Tex tex="K_{0}=1" />. The midpoint time solves
        for halfway from the initial wealth to the new equilibrium.
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            width: "100%",
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 500,
                  color: t.textMuted,
                  borderBottom: `1px solid ${t.border}`,
                  fontSize: 12,
                }}
              >
                <Tex tex="s" />
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  fontWeight: 500,
                  color: t.textMuted,
                  borderBottom: `1px solid ${t.border}`,
                  fontSize: 12,
                }}
              >
                <Tex tex="\delta" />
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  fontWeight: 500,
                  color: t.textMuted,
                  borderBottom: `1px solid ${t.border}`,
                  fontSize: 12,
                }}
              >
                <Tex tex="K^{*}" />
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  fontWeight: 500,
                  color: t.textMuted,
                  borderBottom: `1px solid ${t.border}`,
                  fontSize: 12,
                }}
              >
                <Tex tex="t_{mid}" /> years
              </th>
            </tr>
          </thead>
          <tbody>
            {sensitivityRows.map((row) => (
              <tr key={`${row.s}-${row.d}`}>
                <td
                  style={{
                    padding: "8px 12px",
                    color: t.text,
                    fontWeight: 500,
                    borderBottom: `1px solid ${t.border}`,
                    fontSize: 12,
                  }}
                >
                  {fmt(row.s, 2)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "center",
                    color: t.text,
                    borderBottom: `1px solid ${t.border}`,
                  }}
                >
                  {fmt(row.d, 2)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "center",
                    color: t.text,
                    borderBottom: `1px solid ${t.border}`,
                    background: row.d === 0.05 ? `${t.grow}22` : "transparent",
                  }}
                >
                  {fmt(row.K, 1)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "center",
                    color: t.text,
                    borderBottom: `1px solid ${t.border}`,
                  }}
                >
                  {fmt(row.midpoint, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 12,
          color: t.textMuted,
          lineHeight: 1.6,
        }}
      >
        Reducing drag from <Tex tex="0.10" /> to <Tex tex="0.05" /> has the
        largest effect in the table: terminal wealth rises from{" "}
        <Tex tex="9" /> to <Tex tex="36" />, though the midpoint takes longer
        because the destination is much farther away.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
          gap: 18,
          marginTop: 24,
        }}
      >
        {[
          {
            title: "Strengths",
            body:
              "The model is analytically tractable, has a stable equilibrium, and reduces the long-run behavior to the interpretable ratio s/delta.",
          },
          {
            title: "Limitations",
            body:
              "The model keeps s, delta, and beta fixed. That leaves out changing reinvestment behavior, fluctuating fees, inflation, withdrawals, volatility, and market shocks.",
          },
          {
            title: "Extensions",
            body:
              "Natural next steps include making s depend on K, adding stochastic drag with white noise, or comparing two strategies with a two-wealth-variable system.",
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              borderTop: `2px solid ${t.accent}`,
              paddingTop: 12,
              color: t.text,
              lineHeight: 1.65,
              fontSize: 14,
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: t.accent,
                marginBottom: 6,
              }}
            >
              {item.title}
            </div>
            {item.body}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: `1px solid ${t.border}`,
          color: t.text,
          lineHeight: 1.7,
          fontSize: 14,
        }}
      >
        Bottom line: the model is a simplified benchmark, but it clearly
        isolates the core mechanism. Reinvestment pushes wealth upward, drag
        pulls it down, and their balance determines the stable long-run capital
        level.
      </div>
    </section>
  );
}
