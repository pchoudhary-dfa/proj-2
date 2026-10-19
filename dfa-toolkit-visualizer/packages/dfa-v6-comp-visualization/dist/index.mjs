"use client";
import { i as E, g as R, d as S, u as b, a as k, c as A } from "./index-DO4DObT6.mjs";
import { E as _, b as F, f as W, e as q, h as V, j as X, k as z, l as Y, m as G, n as J, o as K, p as Q, q as Z, r as ee, s as re, t as te, v as ae, w as se, x as ne } from "./index-DO4DObT6.mjs";
import { jsx as d, jsxs as B } from "react/jsx-runtime";
import { useRef as C, useState as U, useMemo as h, useImperativeHandle as g, useEffect as T } from "react";
function L(t) {
  if (t && typeof t.nodeType == "number" && t.nodeType === 1)
    return t;
  if (typeof t == "string") {
    const e = document.querySelector(t);
    if (!e) throw new Error(`createDfaChart: mount element not found for selector "${t}"`);
    return e;
  }
  throw new Error("createDfaChart: container must be an HTMLElement or a CSS selector string");
}
function D(t, e) {
  const l = L(t), { data: i, config: c, onPointClick: f, onLegendClick: p } = e;
  let s = E(l, i, c, {
    onPointClick: f,
    onLegendClick: p
  });
  return {
    update(o, n) {
      s && b(s, o, n);
    },
    destroy() {
      s && (S(s), s = null);
    },
    getDataURL(o = "png") {
      return s ? R(s, o) : "";
    }
  };
}
typeof window < "u" && (window.createDfaChart = D);
try {
  typeof module < "u" && module.exports && (module.exports.createDfaChart = D);
} catch {
}
function N({
  data: t,
  config: e,
  width: l,
  height: i,
  minHeight: c = 384,
  onPointClick: f,
  onLegendClick: p,
  chartRef: s
}) {
  const o = C(null), n = C(null), [y, m] = U(null), v = h(() => k(t), [t]) && !!e.noDataText, x = h(() => A(e), [e]), w = h(() => {
    const a = {
      minHeight: `${c}px`,
      position: "relative",
      ...l != null && i != null ? { width: `${l}px`, height: `${i}px` } : {}
    };
    if (e.chartAreaBorder) {
      const r = e.chartAreaBorder;
      r.width != null && (a.borderWidth = `${r.width}px`), r.color && (a.borderColor = r.color), (r.width != null || r.color) && (a.borderStyle = "solid"), r.radius != null && (a.borderRadius = `${r.radius}px`);
    }
    return e.chartAreaBackgroundColor && !e.chartAreaBackgroundImageUrl && (a.backgroundColor = e.chartAreaBackgroundColor), a;
  }, [
    c,
    l,
    i,
    e.chartAreaBorder,
    e.chartAreaBackgroundColor,
    e.chartAreaBackgroundImageUrl
  ]);
  return g(s, () => ({
    getDataURL(a) {
      const r = n.current;
      return r ? r.getDataURL(a) : "";
    }
  }), []), T(() => {
    const a = o.current;
    if (!a) return;
    let r = !1;
    try {
      const u = D(a, {
        data: t,
        config: e,
        onPointClick: f,
        onLegendClick: p
      });
      r || (n.current = u);
    } catch (u) {
      r || m(u instanceof Error ? u.message : "Failed to init chart");
    }
    return () => {
      r = !0, n.current && (n.current.destroy(), n.current = null);
    };
  }, []), T(() => {
    const a = n.current;
    if (a)
      try {
        a.update(t, e), m(null);
      } catch (r) {
        m(r instanceof Error ? r.message : "Failed to update chart");
      }
  }, [t, e]), y ? /* @__PURE__ */ d(
    "div",
    {
      className: "flex items-center justify-center w-full h-full min-h-[200px]",
      style: { color: "var(--color-error, #dc2626)" },
      role: "alert",
      children: y
    }
  ) : /* @__PURE__ */ B(
    "div",
    {
      className: "dtk-viz-chart-container w-full h-full",
      style: w,
      children: [
        /* @__PURE__ */ d("div", { ref: o, className: "w-full h-full", style: { minHeight: `${c}px` } }),
        v && /* @__PURE__ */ d(
          "div",
          {
            className: "absolute inset-0 flex items-center justify-center pointer-events-none text-sm px-4 text-center",
            style: {
              paddingTop: x > 0 ? x : void 0,
              color: "var(--color-text-muted, #6b7280)"
            },
            role: "status",
            "aria-label": e.noDataText,
            children: e.noDataText
          }
        )
      ]
    }
  );
}
function M(t) {
  return /* @__PURE__ */ d(N, { ...t });
}
export {
  M as ChartRendererWrapper,
  _ as ECHARTS_CANVAS_SUPPORTS_TEXT_DECORATION,
  F as applyCanvasUnderline,
  D as createDfaChart,
  S as destroy,
  W as formatCanvasText,
  q as formatValueByUnitFormatCode,
  R as getDataURL,
  E as init,
  V as isDotMatrixData,
  X as isHeatmapData,
  z as isHundredMinusData,
  Y as isLineBarAreaData,
  G as isMapChartData,
  J as isPieChartData,
  K as isPyramidData,
  Q as isRadarData,
  Z as isScatterXYData,
  ee as isSliceDiceTreemapData,
  re as isStripesTreemapData,
  te as isSunburstData,
  ae as isTreemapData,
  se as measureTextWidth,
  ne as resolveUnderlineColor,
  b as update
};
//# sourceMappingURL=index.mjs.map
