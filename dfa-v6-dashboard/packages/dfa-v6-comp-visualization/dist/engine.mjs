import * as k from "echarts";
const S = 56, F = 120, z = 10, _ = 0.55, Y = 22;
function H(t, e, o) {
  var u;
  const s = Math.max(20, e - Y), i = _ * o.size, r = Math.max(1, Math.floor(s / i)), n = t.split(/\s+/);
  if (n.length <= 1)
    return t.length <= r ? t : ((u = t.match(new RegExp(`(.{1,${r}})`, "g"))) == null ? void 0 : u.join(`
`)) ?? t;
  const h = [];
  let m = "";
  for (const b of n) {
    const l = m ? `${m} ${b}` : b;
    if (l.length <= r)
      m = l;
    else if (m && (h.push(m), m = ""), b.length > r) {
      const d = b.match(new RegExp(`(.{1,${r}})`, "g")) ?? [b];
      for (let a = 0; a < d.length - 1; a++) h.push(d[a]);
      m = d[d.length - 1];
    } else
      m = b;
  }
  return m && h.push(m), h.join(`
`);
}
function O(t) {
  if (!(t === void 0 || t === ""))
    return Number(t);
}
function R(t) {
  return t != null;
}
function $(t, e) {
  const o = t.showLegend && R(e), s = t.legendPosition;
  let i = t.showYAxis ? 62 : 15, r = 15, n = 20, h = t.showXAxis ? 56 : 15;
  return t.showLegend && (o && (s === "top" ? n = S + 5 : s === "bottom" && (h = (t.showXAxis ? 56 : 15) + S)), s === "left" ? i = F + (t.showYAxis ? 62 : 15) : s === "right" && (r = F + 15), !o && s === "top" && (n = 45), !o && s === "bottom" && (h = (t.showXAxis ? 56 : 15) + 30)), t.grid && (t.grid.left !== void 0 && (i = t.grid.left), t.grid.right !== void 0 && (r = t.grid.right), t.grid.top !== void 0 && (n = t.grid.top), t.grid.bottom !== void 0 && (h = t.grid.bottom)), {
    grid: {
      left: i,
      right: r,
      top: n,
      bottom: h,
      containLabel: !1
    }
  };
}
function P(t, e) {
  return e.showXAxis ? {
    xAxis: {
      show: !0,
      type: "category",
      data: t.categories,
      axisLine: { show: !0 },
      axisTick: { show: !0 },
      axisLabel: {
        rotate: e.labelOrientation === "vertical" ? 45 : 0,
        fontSize: e.labelFont.size,
        fontFamily: e.labelFont.family
      }
    }
  } : { xAxis: { show: !1 } };
}
function W(t) {
  if (!t.showYAxis)
    return { yAxis: { show: !1 } };
  const e = O(t.yAxisMin), o = O(t.yAxisMax), s = O(t.yAxisInterval);
  return {
    yAxis: {
      show: !0,
      type: "value",
      ...e !== void 0 || o !== void 0 ? {
        scale: !1,
        ...e !== void 0 && { min: e },
        ...o !== void 0 && { max: o },
        ...s !== void 0 && { interval: s }
      } : { scale: !0 },
      splitLine: t.showGrid ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 },
      axisLine: { show: !0 },
      axisLabel: {
        fontSize: t.labelFont.size,
        fontFamily: t.labelFont.family
      }
    }
  };
}
function B(t, e) {
  return e.showYAxis ? {
    yAxis: {
      show: !0,
      type: "category",
      data: t.categories,
      axisLine: { show: !0 },
      axisLabel: {
        fontSize: e.labelFont.size,
        fontFamily: e.labelFont.family
      }
    }
  } : { yAxis: { show: !1 } };
}
function j(t) {
  return t.showXAxis ? {
    xAxis: {
      show: !0,
      type: "value",
      splitLine: t.showGrid ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 },
      axisLabel: {
        fontSize: t.labelFont.size,
        fontFamily: t.labelFont.family
      }
    }
  } : { xAxis: { show: !1 } };
}
function g(t, e) {
  if (!t.showLegend)
    return { legend: { show: !1 } };
  const o = t.legendPosition, s = o === "left" || o === "right", i = R(e), r = {
    show: !0,
    orient: s ? "vertical" : "horizontal",
    textStyle: {
      fontSize: t.legendFont.size,
      fontFamily: t.legendFont.family,
      fontWeight: t.legendFont.bold ? "bold" : "normal"
    }
  };
  return o === "top" ? (r.top = 0, r.left = "center") : o === "bottom" ? (r.bottom = 0, r.left = "center") : o === "left" ? (r.left = z, r.top = "center") : (r.right = z, r.top = "center"), s && (r.width = F, r.formatter = (n) => H(n, F, t.legendFont)), i && (r.type = "scroll", r.pageFormatter = "{current}/{total}", s || (r.height = S)), { legend: r };
}
function E() {
  return {
    tooltip: {
      trigger: "axis",
      confine: !0
    }
  };
}
function w(t, e) {
  switch (e || "1,000[.00]") {
    case "1,000[.00]":
      return t % 1 === 0 ? t.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : t.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "1000.00":
      return t.toFixed(2);
    case "1,000.00":
      return t.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "1000":
      return Math.round(t).toString();
    case "1,000":
      return Math.round(t).toLocaleString("en-US");
    case "1.00K":
      return Math.abs(t) >= 1e6 ? (t / 1e6).toFixed(2) + "M" : Math.abs(t) >= 1e3 ? (t / 1e3).toFixed(2) + "K" : t.toFixed(2);
    case "1K":
      return Math.abs(t) >= 1e6 ? Math.round(t / 1e6) + "M" : Math.abs(t) >= 1e3 ? Math.round(t / 1e3) + "K" : Math.round(t).toString();
    default:
      return t.toFixed(2);
  }
}
function G(t, e = "top") {
  const o = t.dataLabelPosition === "inside" ? "inside" : e, s = t.dataLabelNumberFormat ?? "1,000[.00]", i = {
    fontSize: t.labelFont.size,
    fontFamily: t.labelFont.family,
    fontWeight: t.labelFont.bold ? "bold" : "normal",
    fontStyle: t.labelFont.italic ? "italic" : "normal",
    formatter: (r) => w(Number((r == null ? void 0 : r.value) ?? 0), s)
  };
  return t.dataLabelVisibility === "onHover" ? {
    label: { show: !1 },
    emphasis: {
      label: {
        show: !0,
        position: o,
        ...i
      }
    }
  } : {
    label: {
      show: !0,
      position: o,
      ...i
    }
  };
}
function U(t, e) {
  const o = e.chartVariant === "curved", s = e.chartVariant === "stepped" ? "end" : !1, i = e.lineThickness ?? 2, r = e.showLabels ? G(e, "top") : { label: { show: !1 } }, n = t.series.length, h = t.series.map((m, u) => ({
    name: m.name,
    type: "line",
    data: m.values,
    smooth: !!o,
    step: s,
    lineStyle: { width: i },
    itemStyle: {
      color: m.values.length ? e.palette[u % e.palette.length] ?? e.primaryColor : e.primaryColor
    },
    showSymbol: !0,
    symbol: "circle",
    symbolSize: 6,
    label: r.label,
    ...r.emphasis ? { emphasis: r.emphasis } : {}
  }));
  return {
    ...$(e, n),
    ...P(t, e),
    ...W(e),
    series: h,
    ...g(e, n),
    ...E()
  };
}
function K(t, e) {
  const o = e.chartVariant === "horizontal" || e.chartVariant === "stacked-horizontal", s = e.chartVariant === "stacked-vertical" || e.chartVariant === "stacked-horizontal", i = typeof e.columnSpacing == "number" ? `${e.columnSpacing}%` : "43%", r = o ? "right" : "top", n = e.showLabels ? G(e, r) : { label: { show: !1 } }, h = t.series.length, m = t.series.map((l, d) => ({
    name: l.name,
    type: "bar",
    data: l.values,
    ...s ? { stack: l.stack ?? "default" } : {},
    itemStyle: { color: e.palette[d % e.palette.length] ?? e.primaryColor },
    barCategoryGap: i,
    label: n.label,
    ...n.emphasis ? { emphasis: n.emphasis } : {}
  })), u = o ? j(e) : P(t, e), b = o ? B(t, e) : W(e);
  return {
    ...$(e, h),
    ...u,
    ...b,
    series: m,
    ...g(e, h),
    ...E()
  };
}
function q(t, e) {
  const o = e.chartVariant === "curved", s = e.chartVariant === "stepped" ? "end" : !1, i = e.lineThickness ?? 2, r = e.showLabels ? G(e, "top") : { label: { show: !1 } }, n = t.series.length, h = t.series.map((m, u) => {
    const b = e.palette[u % e.palette.length] ?? e.primaryColor;
    return {
      name: m.name,
      type: "line",
      data: m.values,
      smooth: !!o,
      step: s,
      lineStyle: { width: i, color: b },
      itemStyle: { color: b },
      areaStyle: { color: b, opacity: 0.3 },
      showSymbol: !0,
      symbol: "circle",
      symbolSize: 6,
      label: r.label,
      ...r.emphasis ? { emphasis: r.emphasis } : {}
    };
  });
  return {
    ...$(e, n),
    ...P(t, e),
    ...W(e),
    series: h,
    ...g(e, n),
    ...E()
  };
}
function J(t, e) {
  const o = e.pieDonut ? ["40%", "70%"] : "65%", s = e.pieSemi ? "70%" : "50%", i = e.pieSemi ? 180 : 90, r = e.pieSemi ? 0 : 450, n = t.segments.map((a, y) => ({
    name: a.label,
    value: a.value,
    itemStyle: {
      color: e.palette[y % e.palette.length] ?? e.primaryColor
    }
  })), m = t.segments.length != null, u = e.legendPosition, b = u === "left" || u === "right", l = e.showLegend ? {
    show: !0,
    orient: b ? "vertical" : "horizontal",
    textStyle: {
      fontSize: e.legendFont.size,
      fontFamily: e.legendFont.family,
      fontWeight: e.legendFont.bold ? "bold" : "normal"
    }
  } : { show: !1 };
  return e.showLegend && (u === "top" ? (l.top = 0, l.left = "center") : u === "bottom" ? (l.bottom = 0, l.left = "center") : u === "left" ? (l.left = z, l.top = "center") : (l.right = z, l.top = "center"), b && (l.width = F, l.formatter = (a) => H(a, F, e.legendFont)), m && (l.type = "scroll", l.pageFormatter = "{current}/{total}", b || (l.height = S))), {
    tooltip: { trigger: "item", confine: !0 },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    legend: l,
    series: [
      {
        type: "pie",
        radius: o,
        center: ["50%", s],
        startAngle: i,
        endAngle: r,
        data: n,
        label: {
          show: e.pieLabelsInside || e.pieLabelsOutside,
          position: e.pieLabelsInside ? "inside" : "outside",
          fontSize: e.labelFont.size,
          fontFamily: e.labelFont.family,
          fontWeight: e.labelFont.bold ? "bold" : "normal"
        },
        labelLine: e.pieLabelsOutside ? { show: !0 } : { show: !1 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.2)" }
        }
      }
    ]
  };
}
function Q(t, e) {
  const o = e.scatterSymbolSize ?? 10, s = e.scatterSymbol ?? "circle", i = e.dataLabelNumberFormat ?? "1,000[.00]", r = t.series.length, n = t.series.map((l, d) => ({
    name: l.name,
    type: "scatter",
    data: l.points.map((a) => ({
      value: [a.x, a.y],
      name: a.label
    })),
    symbolSize: o,
    symbol: s,
    itemStyle: {
      color: e.palette[d % e.palette.length] ?? e.primaryColor
    },
    label: e.showLabels ? {
      show: e.dataLabelVisibility !== "onHover",
      position: "top",
      formatter: (a) => a.name ?? "",
      fontSize: e.labelFont.size,
      fontFamily: e.labelFont.family
    } : { show: !1 },
    ...e.showLabels && e.dataLabelVisibility === "onHover" ? { emphasis: { label: { show: !0, position: "top", formatter: (a) => a.name ?? "", fontSize: e.labelFont.size, fontFamily: e.labelFont.family } } } : {}
  })), h = t.xAxisLabel, m = t.yAxisLabel, u = e.showXAxis ? {
    show: !0,
    type: "value",
    name: h,
    nameLocation: "middle",
    nameGap: 30,
    nameTextStyle: { fontSize: e.labelFont.size, fontFamily: e.labelFont.family },
    axisLine: { show: !0 },
    splitLine: e.showGrid ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 },
    axisLabel: { fontSize: e.labelFont.size, fontFamily: e.labelFont.family }
  } : { show: !1 }, b = e.showYAxis ? {
    show: !0,
    type: "value",
    name: m,
    nameLocation: "middle",
    nameGap: 50,
    nameTextStyle: { fontSize: e.labelFont.size, fontFamily: e.labelFont.family },
    axisLine: { show: !0 },
    splitLine: e.showGrid ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 },
    axisLabel: { fontSize: e.labelFont.size, fontFamily: e.labelFont.family }
  } : { show: !1 };
  return {
    ...$(e, r),
    xAxis: u,
    yAxis: b,
    series: n,
    ...g(e, r),
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (l) => {
        const d = l.value;
        if (!d) return "";
        const a = w(d[0], i), y = w(d[1], i), L = l.name ? `<strong>${l.name}</strong><br/>` : "";
        return `${r > 1 && l.seriesName ? `${l.seriesName}<br/>` : ""}${L}${h}: ${a}<br/>${m}: ${y}`;
      }
    }
  };
}
function Z(t) {
  const e = t.trim().replace("#", "");
  return e.length === 3 ? [
    parseInt(e[0] + e[0], 16),
    parseInt(e[1] + e[1], 16),
    parseInt(e[2] + e[2], 16)
  ] : e.length === 6 ? [parseInt(e.slice(0, 2), 16), parseInt(e.slice(2, 4), 16), parseInt(e.slice(4, 6), 16)] : null;
}
function I(t) {
  const e = Z(t);
  if (!e) return 0.5;
  const [o, s, i] = e.map((r) => {
    const n = r / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * o + 0.7152 * s + 0.0722 * i;
}
function ee(t) {
  return t.length === 0 ? ["#f5f5f5", "#4a90d9"] : t.length === 1 ? ["#f5f5f5", t[0]] : [...t].sort((e, o) => I(o) - I(e));
}
function te(t, e) {
  const o = e.dataLabelNumberFormat ?? "1,000[.00]", s = e.legendPosition, i = s === "left" || s === "right";
  let r = (e.showYAxis, 10), n = 15, h = 20, m = e.showXAxis ? 40 : 10;
  e.showLegend && (s === "top" ? h = S + 5 : s === "bottom" ? m = (e.showXAxis ? 40 : 10) + S : s === "left" ? r = F + 10 : n = F + 15), e.grid && (e.grid.left !== void 0 && (r = e.grid.left), e.grid.right !== void 0 && (n = e.grid.right), e.grid.top !== void 0 && (h = e.grid.top), e.grid.bottom !== void 0 && (m = e.grid.bottom));
  const u = e.palette.length > 0 ? e.palette : [e.primaryColor], b = ee(u), l = {
    type: "continuous",
    calculable: !0,
    min: t.min,
    max: t.max,
    inRange: { color: b },
    show: e.showLegend,
    text: [
      w(t.max, o),
      w(t.min, o)
    ],
    textStyle: {
      fontSize: e.legendFont.size,
      fontFamily: e.legendFont.family,
      fontWeight: e.legendFont.bold ? "bold" : "normal"
    },
    orient: i ? "vertical" : "horizontal"
  };
  s === "top" ? (l.top = 0, l.left = "center") : s === "bottom" ? (l.bottom = 0, l.left = "center") : s === "left" ? (l.left = z, l.top = "center") : (l.right = z, l.top = "center");
  const d = {
    fontSize: e.labelFont.size,
    fontFamily: e.labelFont.family,
    fontWeight: e.labelFont.bold ? "bold" : "normal"
  }, a = {
    show: e.showXAxis,
    type: "category",
    data: t.xCategories,
    splitArea: { show: !0 },
    axisLabel: {
      ...d,
      rotate: e.labelOrientation === "vertical" ? 45 : 0
    }
  }, y = {
    show: e.showYAxis,
    type: "category",
    data: t.yCategories,
    splitArea: { show: !0 },
    axisLabel: d
  }, L = e.showLabels && e.dataLabelVisibility !== "onHover", C = e.showLabels && e.dataLabelVisibility === "onHover", c = {
    fontSize: e.labelFont.size,
    fontFamily: e.labelFont.family,
    fontWeight: e.labelFont.bold ? "bold" : "normal",
    fontStyle: e.labelFont.italic ? "italic" : "normal"
  }, A = (v) => {
    var f;
    return w(Number(((f = v.data) == null ? void 0 : f[2]) ?? 0), o);
  }, M = L ? { show: !0, position: "inside", formatter: A, ...c } : { show: !1 }, p = C ? { show: !0, position: "inside", formatter: A, ...c } : { show: !1 }, x = (v) => {
    const f = v;
    if (!Array.isArray(f == null ? void 0 : f.data) || f.data.length < 3) return "";
    const D = t.xCategories[f.data[0]] ?? String(f.data[0]), V = t.yCategories[f.data[1]] ?? String(f.data[1]), N = w(f.data[2], o);
    return `<strong>${V}</strong><br/>${D}: <strong>${N}</strong>`;
  };
  return {
    grid: {
      left: r,
      right: n,
      top: h,
      bottom: m,
      containLabel: !0
    },
    xAxis: a,
    yAxis: y,
    visualMap: [l],
    series: [
      {
        type: "heatmap",
        data: t.cells,
        label: M,
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.3)" },
          label: p
        }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: x
    }
  };
}
function oe(t, e) {
  const o = e.dataLabelNumberFormat ?? "1,000[.00]", s = e.palette.length > 0 ? e.palette : [e.primaryColor], i = t.nodes.map((b, l) => {
    var d;
    return {
      ...b,
      itemStyle: { color: s[l % s.length] },
      ...(d = b.children) != null && d.length ? {
        children: b.children.map((a) => ({ ...a }))
      } : {}
    };
  }), r = {
    fontSize: e.labelFont.size,
    fontFamily: e.labelFont.family,
    fontWeight: e.labelFont.bold ? "bold" : "normal",
    fontStyle: e.labelFont.italic ? "italic" : "normal"
  }, n = e.showLabels && e.dataLabelVisibility !== "onHover", h = e.showLabels && e.dataLabelVisibility === "onHover", m = (b) => {
    const l = w(Number((b == null ? void 0 : b.value) ?? 0), o);
    return `${(b == null ? void 0 : b.name) ?? ""}
${l}`;
  }, u = (b) => {
    var y;
    const l = b, d = ((y = l == null ? void 0 : l.treePathInfo) == null ? void 0 : y.map((L) => L.name).filter(Boolean).join(" → ")) ?? (l == null ? void 0 : l.name) ?? "", a = w(Number((l == null ? void 0 : l.value) ?? 0), o);
    return `<strong>${d}</strong><br/>Value: <strong>${a}</strong>`;
  };
  return {
    series: [
      {
        type: "treemap",
        data: i,
        roam: !1,
        nodeClick: !1,
        breadcrumb: { show: !1 },
        levels: [
          {
            itemStyle: {
              borderColor: "#fff",
              borderWidth: 2,
              gapWidth: 2
            },
            upperLabel: { show: !1 }
          },
          {
            itemStyle: {
              borderColor: "rgba(255,255,255,0.6)",
              borderWidth: 1,
              gapWidth: 1
            },
            colorSaturation: [0.35, 0.5]
          }
        ],
        label: n ? { show: !0, formatter: m, ...r } : { show: !1 },
        upperLabel: n ? {
          show: !0,
          height: 24,
          formatter: (b) => (b == null ? void 0 : b.name) ?? "",
          ...r
        } : { show: !1 },
        emphasis: {
          label: h ? { show: !0, formatter: m, ...r } : { show: !1 }
        },
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 1
        }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: u
    }
  };
}
function re(t) {
  if (!(t === void 0 || t === ""))
    return Number(t);
}
function se(t, e) {
  const o = e.dataLabelNumberFormat ?? "1,000[.00]", s = re(e.yAxisMax), i = e.palette.length > 0 ? e.palette : [e.primaryColor], r = e.legendPosition, n = r === "left" || r === "right", h = e.showLegend ? {
    show: !0,
    orient: n ? "vertical" : "horizontal",
    textStyle: {
      fontSize: e.legendFont.size,
      fontFamily: e.legendFont.family,
      fontWeight: e.legendFont.bold ? "bold" : "normal"
    }
  } : { show: !1 };
  e.showLegend && (r === "top" ? (h.top = 0, h.left = "center") : r === "bottom" ? (h.bottom = 0, h.left = "center") : r === "left" ? (h.left = z, h.top = "center") : (h.right = z, h.top = "center"), n && (h.width = F, h.formatter = (a) => H(a, F, e.legendFont)), t.series.length > 1 && (h.type = "scroll", h.pageFormatter = "{current}/{total}", n || (h.height = S)));
  const m = e.showLabels && e.dataLabelVisibility !== "onHover", u = e.showLabels && e.dataLabelVisibility === "onHover", b = {
    fontSize: e.labelFont.size,
    fontFamily: e.labelFont.family,
    fontWeight: e.labelFont.bold ? "bold" : "normal",
    fontStyle: e.labelFont.italic ? "italic" : "normal"
  }, l = t.series.map((d, a) => {
    const y = i[a % i.length] ?? e.primaryColor;
    return {
      value: d.values,
      name: d.name,
      lineStyle: { width: e.lineThickness ?? 2, color: y },
      itemStyle: { color: y },
      areaStyle: { opacity: 0.12 }
    };
  });
  return {
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (d) => {
        var c, A;
        const a = d, y = ((c = a == null ? void 0 : a.data) == null ? void 0 : c.name) ?? (a == null ? void 0 : a.name) ?? "", L = (A = a == null ? void 0 : a.data) == null ? void 0 : A.value;
        if (!Array.isArray(L)) return "";
        const C = L.map((M, p) => {
          var v;
          return `${((v = t.indicators[p]) == null ? void 0 : v.name) ?? String(p)}: ${w(Number(M), o)}`;
        }).join("<br/>");
        return `<strong>${y}</strong><br/>${C}`;
      }
    },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    legend: h,
    radar: {
      indicator: t.indicators.map((d) => ({
        name: d.name,
        max: s !== void 0 ? s : d.max > 0 ? d.max : 1
      })),
      center: ["50%", "55%"],
      radius: "62%",
      axisName: {
        fontSize: e.labelFont.size,
        fontFamily: e.labelFont.family,
        fontWeight: e.labelFont.bold ? "bold" : "normal"
      },
      splitArea: { show: e.showGrid },
      splitLine: { show: e.showGrid }
    },
    series: [
      {
        type: "radar",
        data: l,
        symbol: "circle",
        symbolSize: 6,
        label: {
          show: m,
          formatter: (d) => {
            const a = d;
            return w(Number((a == null ? void 0 : a.value) ?? 0), o);
          },
          ...b
        },
        emphasis: {
          label: u ? {
            show: !0,
            formatter: (d) => {
              const a = d;
              return w(Number((a == null ? void 0 : a.value) ?? 0), o);
            },
            ...b
          } : { show: !1 }
        }
      }
    ]
  };
}
function le(t) {
  const e = t.legendPosition;
  let o = 20, s = t.showXAxis ? 40 : 15, i = 10, r = 10;
  return t.showLegend && (e === "top" ? o = S + 5 : e === "bottom" ? s = (t.showXAxis ? 40 : 15) + S : e === "left" ? i = F + 10 : e === "right" && (r = F + 10)), t.grid && (t.grid.left !== void 0 && (i = t.grid.left), t.grid.right !== void 0 && (r = t.grid.right), t.grid.top !== void 0 && (o = t.grid.top), t.grid.bottom !== void 0 && (s = t.grid.bottom)), { left: i, right: r, top: o, bottom: s, containLabel: !0 };
}
function ae(t, e) {
  if (t.categories.length === 0)
    return {};
  const o = e.dataLabelNumberFormat ?? "1,000[.00]", s = e.palette.length > 0 ? e.palette : [e.primaryColor], i = s[0] ?? e.primaryColor, r = s[1] ?? s[0] ?? e.primaryColor, n = e.yAxisMax !== void 0 && e.yAxisMax !== "" ? Number(e.yAxisMax) : null, h = Math.max(
    ...t.leftSeries.values.map((p) => Math.abs(p)),
    ...t.rightSeries.values,
    0
  ), m = h > 0 ? h * 1.1 : 1, u = n !== null && n > 0 ? n : m, b = le(e), { legend: l } = g(e, 2), d = e.showLabels && e.dataLabelVisibility !== "onHover", a = e.showLabels && e.dataLabelVisibility === "onHover", y = e.dataLabelPosition === "inside", L = {
    fontSize: e.labelFont.size,
    fontFamily: e.labelFont.family,
    fontWeight: e.labelFont.bold ? "bold" : "normal",
    fontStyle: e.labelFont.italic ? "italic" : "normal"
  }, C = (p) => {
    const x = (p == null ? void 0 : p.value) ?? 0;
    return w(Math.abs(x), o);
  }, c = (p) => {
    const x = (p == null ? void 0 : p.value) ?? 0;
    return w(x, o);
  }, A = (p, x) => ({
    show: d,
    position: y ? "inside" : x,
    formatter: p,
    ...L
  }), M = (p, x) => ({
    label: a ? { show: !0, position: y ? "inside" : x, formatter: p, ...L } : { show: !1 }
  });
  return {
    grid: b,
    legend: l,
    tooltip: {
      trigger: "axis",
      confine: !0,
      axisPointer: { type: "shadow" },
      formatter: (p) => {
        var V;
        const x = p;
        if (!x || x.length === 0) return "";
        const v = ((V = x[0]) == null ? void 0 : V.dataIndex) ?? 0, f = t.categories[v] ?? "", D = x.map((N) => {
          const X = w(Math.abs(N.value ?? 0), o);
          return `${N.marker ?? ""}${N.seriesName ?? ""}: ${X}`;
        }).join("<br/>");
        return `<strong>${f}</strong><br/>${D}`;
      }
    },
    xAxis: {
      type: "value",
      min: -u,
      max: u,
      show: e.showXAxis,
      splitLine: e.showGrid ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 },
      axisLabel: {
        show: e.showXAxis,
        formatter: (p) => w(Math.abs(p), o),
        fontSize: e.labelFont.size,
        fontFamily: e.labelFont.family
      }
    },
    yAxis: {
      type: "category",
      data: t.categories,
      show: e.showYAxis,
      axisLabel: {
        show: e.showYAxis,
        fontSize: e.labelFont.size,
        fontFamily: e.labelFont.family
      }
    },
    series: [
      {
        name: t.leftSeries.name,
        type: "bar",
        data: t.leftSeries.values,
        itemStyle: { color: i },
        label: A(C, "insideLeft"),
        emphasis: M(C, "insideLeft")
      },
      {
        name: t.rightSeries.name,
        type: "bar",
        data: t.rightSeries.values,
        itemStyle: { color: r },
        label: A(c, "right"),
        emphasis: M(c, "right")
      }
    ]
  };
}
function ne(t) {
  return "categories" in t && "series" in t;
}
function he(t) {
  return "segments" in t;
}
function me(t) {
  return "xAxisLabel" in t && "yAxisLabel" in t;
}
function be(t) {
  return t.kind === "pyramid" && "categories" in t && Array.isArray(t.categories);
}
function de(t) {
  return "xCategories" in t && "yCategories" in t && "cells" in t;
}
function ue(t) {
  return "nodes" in t;
}
function pe(t) {
  return "indicators" in t && Array.isArray(t.indicators);
}
function ie(t, e) {
  var n;
  const o = ((n = t.plotAreaBackgroundColor) == null ? void 0 : n.trim()) ?? "", s = o.length > 0 && !/^transparent$/i.test(o) && o !== "rgba(0,0,0,0)", i = {
    ...e,
    backgroundColor: "transparent"
  }, r = e.grid;
  return r && typeof r == "object" && !Array.isArray(r) ? i.grid = {
    ...r,
    show: s,
    backgroundColor: s ? o : "transparent",
    // Default grid model uses borderWidth: 1; hide border when showing a plot fill.
    ...s ? { borderWidth: 0 } : {}
  } : s && (i.backgroundColor = o), i;
}
function T(t, e) {
  let o;
  switch (e.type) {
    case "line":
      o = U(t, e);
      break;
    case "bar":
      o = K(t, e);
      break;
    case "area":
      o = q(t, e);
      break;
    case "pie":
      o = J(t, e);
      break;
    case "scatter":
      o = Q(t, e);
      break;
    case "heatmap":
      o = te(t, e);
      break;
    case "treemap":
      o = oe(t, e);
      break;
    case "radar":
      o = se(t, e);
      break;
    case "pyramid":
      o = ae(t, e);
      break;
    default:
      o = {};
  }
  return ie(e, o);
}
function ye(t, e, o, s) {
  const i = k.init;
  if (!i) throw new Error("echarts.init is not available");
  const r = i(t, void 0, { renderer: "canvas" }), n = T(e, o);
  r.setOption(n), s != null && s.onPointClick && r.on("click", (m) => {
    var u;
    m.componentType === "series" && ((u = s.onPointClick) == null || u.call(s, {
      seriesName: m.seriesName,
      name: m.name,
      value: m.value,
      dataIndex: m.dataIndex
    }));
  }), s != null && s.onLegendClick && r.on("legendselectchanged", (m) => {
    var b;
    const u = m;
    (u == null ? void 0 : u.name) != null && ((b = s.onLegendClick) == null || b.call(s, { name: u.name }));
  });
  const h = new ResizeObserver(() => {
    var m;
    (m = r == null ? void 0 : r.resize) == null || m.call(r);
  });
  return h.observe(t), r._resizeObserver = h, r;
}
function we(t, e, o) {
  var i;
  const s = T(e, o);
  (i = t == null ? void 0 : t.setOption) == null || i.call(t, s, {
    replaceMerge: ["series", "legend", "grid", "visualMap", "xAxis", "yAxis", "radar"]
  });
}
function xe(t) {
  var o, s;
  const e = t._resizeObserver;
  e && ((o = t == null ? void 0 : t.getDom) != null && o.call(t)) && e.disconnect(), (s = t == null ? void 0 : t.dispose) == null || s.call(t);
}
function fe(t, e = "png") {
  var o;
  return ((o = t == null ? void 0 : t.getDataURL) == null ? void 0 : o.call(t, { type: e, pixelRatio: 2 })) ?? "";
}
export {
  xe as destroy,
  fe as getDataURL,
  ye as init,
  de as isHeatmapData,
  ne as isLineBarAreaData,
  he as isPieChartData,
  be as isPyramidData,
  pe as isRadarData,
  me as isScatterXYData,
  ue as isTreemapData,
  we as update
};
//# sourceMappingURL=engine.mjs.map
