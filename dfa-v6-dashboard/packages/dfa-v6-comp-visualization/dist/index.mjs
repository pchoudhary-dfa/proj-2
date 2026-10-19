"use client";
import { init as g, getDataURL as w, destroy as x, update as R } from "./engine.mjs";
import { isHeatmapData as b, isLineBarAreaData as j, isPieChartData as N, isPyramidData as q, isRadarData as z, isScatterXYData as A, isTreemapData as B } from "./engine.mjs";
import { jsx as m } from "react/jsx-runtime";
import { useRef as y, useState as L, useImperativeHandle as v, useEffect as D } from "react";
function E(e) {
  if (e && typeof e.nodeType == "number" && e.nodeType === 1)
    return e;
  if (typeof e == "string") {
    const r = document.querySelector(e);
    if (!r) throw new Error(`createDfaChart: mount element not found for selector "${e}"`);
    return r;
  }
  throw new Error("createDfaChart: container must be an HTMLElement or a CSS selector string");
}
function p(e, r) {
  const c = E(e), { data: u, config: s, onPointClick: f, onLegendClick: d } = r;
  let t = g(c, u, s, {
    onPointClick: f,
    onLegendClick: d
  });
  return {
    update(o, n) {
      t && R(t, o, n);
    },
    destroy() {
      t && (x(t), t = null);
    },
    getDataURL(o = "png") {
      return t ? w(t, o) : "";
    }
  };
}
typeof window < "u" && (window.createDfaChart = p);
try {
  typeof module < "u" && module.exports && (module.exports.createDfaChart = p);
} catch {
}
function S({
  data: e,
  config: r,
  width: c,
  height: u,
  minHeight: s = 384,
  onPointClick: f,
  onLegendClick: d,
  chartRef: t
}) {
  const o = y(null), n = y(null), [h, C] = L(null);
  return v(t, () => ({
    getDataURL(a) {
      const i = n.current;
      return i ? i.getDataURL(a) : "";
    }
  }), []), D(() => {
    const a = o.current;
    if (!a) return;
    let i = !1;
    try {
      const l = p(a, {
        data: e,
        config: r,
        onPointClick: f,
        onLegendClick: d
      });
      i || (n.current = l);
    } catch (l) {
      i || C(l instanceof Error ? l.message : "Failed to init chart");
    }
    return () => {
      i = !0, n.current && (n.current.destroy(), n.current = null);
    };
  }, []), D(() => {
    const a = n.current;
    a && a.update(e, r);
  }, [e, r]), h ? /* @__PURE__ */ m(
    "div",
    {
      className: "flex items-center justify-center w-full h-full min-h-[200px]",
      style: { color: "var(--color-error, #dc2626)" },
      role: "alert",
      children: h
    }
  ) : /* @__PURE__ */ m(
    "div",
    {
      ref: o,
      className: "dtk-viz-chart-container w-full h-full",
      style: {
        minHeight: `${s}px`,
        ...c != null && u != null ? { width: `${c}px`, height: `${u}px` } : {}
      }
    }
  );
}
function T(e) {
  return /* @__PURE__ */ m(S, { ...e });
}
export {
  T as ChartRendererWrapper,
  p as createDfaChart,
  x as destroy,
  w as getDataURL,
  g as init,
  b as isHeatmapData,
  j as isLineBarAreaData,
  N as isPieChartData,
  q as isPyramidData,
  z as isRadarData,
  A as isScatterXYData,
  B as isTreemapData,
  R as update
};
//# sourceMappingURL=index.mjs.map
