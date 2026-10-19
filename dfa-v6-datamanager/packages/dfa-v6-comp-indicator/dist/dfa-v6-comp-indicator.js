import "dfa-v6-comp-list-view/styles.css";
import { jsx as y, jsxs as X, Fragment as Tt } from "react/jsx-runtime";
import { useCallback as W, useMemo as Oe, useState as U, useRef as _e, useEffect as fe } from "react";
import { ListView as rt } from "dfa-v6-comp-list-view";
function xt(c, d) {
  if (c.subgroups.length === 0)
    return { allSelected: !1, someSelected: !1, isIndeterminate: !1 };
  let f = 0;
  for (const v of c.subgroups) {
    const C = `${c.indicatorGid}|${c.unitGid}|${v.sgGid}`;
    d.has(C) && f++;
  }
  const p = f === c.subgroups.length, _ = f > 0;
  return { allSelected: p, someSelected: _, isIndeterminate: _ && !p };
}
function an({
  checked: c,
  onClick: d,
  ariaLabel: f
}) {
  return /* @__PURE__ */ y(
    "input",
    {
      type: "checkbox",
      className: "dtk-iu-checkbox",
      checked: c,
      onChange: () => {
      },
      onClick: d,
      "aria-label": f
    }
  );
}
function At({
  iuRows: c,
  selectedGids: d,
  expandedIus: f,
  onToggleExpand: p,
  onIuCheck: _,
  onSubgroupCheck: I
}) {
  const v = W((h, G) => {
    h.stopPropagation();
    const { allSelected: g } = xt(G, d);
    _(G, !g);
  }, [d, _]), C = W((h, G) => {
    h.stopPropagation(), I(G, !d.has(G));
  }, [d, I]);
  return /* @__PURE__ */ y("div", { className: "dtk-iu-tree-root", children: /* @__PURE__ */ y("div", { className: "dtk-iu-tree-list", children: c.map((h) => {
    const G = f.has(h.iuKey), { allSelected: g, someSelected: B } = xt(h, d), ee = `${h.indicatorName}, ${h.unitName}`;
    return /* @__PURE__ */ X("div", { className: "dtk-iu-tree-item", children: [
      /* @__PURE__ */ X("div", { className: `dtk-iu-row ${B ? "dtk-iu-row-has-selection" : ""}`, children: [
        /* @__PURE__ */ y(
          "button",
          {
            type: "button",
            className: `dtk-iu-chevron ${G ? "dtk-iu-chevron-open" : ""}`,
            onClick: () => p(h.iuKey),
            "aria-label": G ? "Collapse" : "Expand",
            "aria-expanded": G,
            children: G ? /* @__PURE__ */ y("svg", { className: "dtk-iu-chevron-svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ y("polyline", { points: "6 9 12 15 18 9" }) }) : /* @__PURE__ */ y("svg", { className: "dtk-iu-chevron-svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ y("polyline", { points: "9 18 15 12 9 6" }) })
          }
        ),
        /* @__PURE__ */ y(
          an,
          {
            checked: g,
            onClick: (b) => v(b, h),
            ariaLabel: ee
          }
        ),
        /* @__PURE__ */ y(
          "span",
          {
            className: "dtk-iu-label",
            onClick: (b) => v(b, h),
            style: { cursor: "pointer" },
            children: ee
          }
        )
      ] }),
      G && /* @__PURE__ */ y("div", { className: "dtk-iu-subgroup-list", children: h.subgroups.map((b) => {
        const ne = `${h.indicatorGid}|${h.unitGid}|${b.sgGid}`, Y = d.has(ne);
        return /* @__PURE__ */ X("div", { className: "dtk-iu-subgroup-row", children: [
          /* @__PURE__ */ y(
            "input",
            {
              type: "checkbox",
              className: "dtk-iu-subgroup-checkbox",
              checked: Y,
              onChange: () => {
              },
              onClick: (M) => C(M, ne),
              "aria-label": b.sgName
            }
          ),
          /* @__PURE__ */ X(
            "span",
            {
              className: "dtk-iu-subgroup-label",
              onClick: (M) => C(M, ne),
              style: { cursor: "pointer" },
              children: [
                b.sgName,
                b.isDefault && /* @__PURE__ */ y("span", { className: "dtk-iu-subgroup-default-badge", children: " (default)" })
              ]
            }
          )
        ] }, b.sgGid);
      }) })
    ] }, h.iuKey);
  }) }) });
}
const lt = "|";
function on(c, d, f) {
  return `${c.trim()}${lt}${d.trim()}${lt}${f.trim()}`;
}
function Ln(c) {
  const d = c.split(lt);
  if (d.length !== 3) return null;
  const [f, p, _] = d;
  return !f.trim() || !p.trim() || !_.trim() ? null : [f.trim(), p.trim(), _.trim()];
}
const ln = [
  { id: "1", indicator_gid: "1", indicator_name: "GDP Growth Rate", unit_gid: ["PERCENT"] },
  { id: "2", indicator_gid: "2", indicator_name: "GDP Per Capita", unit_gid: ["USD", "PPP"] },
  { id: "3", indicator_gid: "3", indicator_name: "Consumer Price Index (CPI)", unit_gid: ["INDEX"] },
  { id: "4", indicator_gid: "4", indicator_name: "Wholesale Price Index (WPI)", unit_gid: ["INDEX"] },
  { id: "5", indicator_gid: "5", indicator_name: "Unemployment Rate", unit_gid: ["PERCENT"] },
  { id: "6", indicator_gid: "6", indicator_name: "Government Expenditure", unit_gid: ["USD", "INR"] },
  { id: "7", indicator_gid: "7", indicator_name: "Fiscal Deficit", unit_gid: ["PERCENT"] },
  { id: "8", indicator_gid: "8", indicator_name: "Labor Force Participation Rate", unit_gid: ["PERCENT"] }
], Pt = {
  USD: { unit_gid: "USD", unit_name: "US dollars", unit_nid: 1 },
  PPP: { unit_gid: "PPP", unit_name: "Purchasing power parity", unit_nid: 2 },
  PERCENT: { unit_gid: "PERCENT", unit_name: "Percent", unit_nid: 3 },
  INDEX: { unit_gid: "INDEX", unit_name: "Index", unit_nid: 4 },
  INR: { unit_gid: "INR", unit_name: "Indian Rupees", unit_nid: 5 }
}, Mt = {
  economic_growth: ["1", "2", "6", "7"],
  public_finance: ["6", "7", "8"],
  labor_market: ["5", "8"],
  trade_commerce: ["1", "2", "3", "4"],
  social_development: ["5", "6", "7", "8"]
}, Dt = {
  macroeconomic: ["1", "2", "3", "4"],
  government_finance: ["6", "7"],
  employment_wages: ["5", "8"]
}, Ot = {
  no_poverty: ["1", "2", "5"],
  zero_hunger: ["3", "4"],
  good_health: ["5", "6"],
  quality_education: ["7", "8"]
}, dn = [
  { id: "economic_growth", label: "Economic Growth" },
  { id: "public_finance", label: "Public Finance" },
  { id: "labor_market", label: "Labor Market" },
  { id: "trade_commerce", label: "Trade & Commerce" },
  { id: "social_development", label: "Social Development" }
], un = [
  { id: "macroeconomic", label: "Macroeconomic Indicators" },
  { id: "government_finance", label: "Government Finance" },
  { id: "employment_wages", label: "Employment & Wages" }
], fn = [
  { id: "no_poverty", label: "No Poverty" },
  { id: "zero_hunger", label: "Zero Hunger" },
  { id: "good_health", label: "Good Health and Well-being" },
  { id: "quality_education", label: "Quality Education" }
];
function Rt(c) {
  return new Promise((d) => {
    setTimeout(() => {
      let f = [...ln];
      const { search: p, sector: _, theme: I, goal: v } = c;
      if (_ && Mt[_]) {
        const C = new Set(Mt[_]);
        f = f.filter((h) => C.has(String(h.id)));
      }
      if (I && Dt[I]) {
        const C = new Set(Dt[I]);
        f = f.filter((h) => C.has(String(h.id)));
      }
      if (v && Ot[v]) {
        const C = new Set(Ot[v]);
        f = f.filter((h) => C.has(String(h.id)));
      }
      if (p != null && p.trim()) {
        const C = p.trim().toLowerCase();
        f = f.filter(
          (h) => h.indicator_name.toLowerCase().includes(C)
        );
      }
      d(f);
    }, 150);
  });
}
const je = "/indicators", mn = "/indicator-classifications", hn = "/indicator-classifications/type", Ft = [
  { code: "SC", label: "Sector" },
  { code: "GL", label: "Goal" },
  { code: "TH", label: "Theme" }
], $e = {
  IC_TYPE_SECTOR: "SC",
  IC_TYPE_GOAL: "GL",
  IC_TYPE_THEME: "TH",
  sort_field: "ic_order",
  sort_order: "asc"
};
function Ke(c) {
  return c === $e.IC_TYPE_SECTOR ? "sector" : c === $e.IC_TYPE_GOAL ? "goal" : c === $e.IC_TYPE_THEME ? "theme" : null;
}
function jt(c) {
  const d = Ke(c);
  return d === "sector" ? dn : d === "goal" ? fn : d === "theme" ? un : [];
}
function gn(c, d, f) {
  if (c === "all")
    return { search: d };
  const p = c, _ = f[p], I = Ke(p);
  return {
    icType: p,
    icIdentifier: _,
    sector: I === "sector" ? _ : void 0,
    goal: I === "goal" ? _ : void 0,
    theme: I === "theme" ? _ : void 0
  };
}
function pn(c) {
  const d = c.icType, f = c.icIdentifier ?? c.sector ?? c.goal ?? c.theme;
  return d === $e.IC_TYPE_SECTOR ? { search: c.search, sector: f } : d === $e.IC_TYPE_GOAL ? { search: c.search, goal: f } : d === $e.IC_TYPE_THEME ? { search: c.search, theme: f } : {
    search: c.search,
    sector: c.sector,
    goal: c.goal,
    theme: c.theme
  };
}
function Re(c, d, f = !0) {
  const p = c.indicator_nid ?? c.i_nid ?? (typeof c.nid == "number" ? c.nid : void 0), _ = c.indicator_gid ?? c.i_gid ?? (p != null ? String(p) : ""), I = c.indicator_name ?? c.i_name ?? c.short_name ?? _;
  if (!f)
    return [{
      id: _,
      label: I,
      ...p != null ? { nid: p } : {}
    }];
  const v = c.u_gid ?? c.unit_gid;
  return !v || v.length === 0 ? [{
    id: _,
    label: I,
    ...p != null ? { nid: p } : {}
  }] : v.map((C) => {
    const h = d == null ? void 0 : d[C], G = (h == null ? void 0 : h.unit_name) ?? (h == null ? void 0 : h.u_name) ?? C;
    (h == null ? void 0 : h.unit_nid) ?? (h == null || h.u_nid);
    const g = `${_}_${C}`, B = `${I}, ${G}`;
    return {
      id: g,
      label: B,
      ...p != null ? { nid: p } : {},
      unitGid: C,
      unitName: G
    };
  });
}
function ct(c, d, f) {
  const p = [];
  for (const _ of c) {
    const I = _.indicator_nid ?? _.i_nid ?? (typeof _.nid == "number" ? _.nid : void 0), v = _.indicator_gid ?? _.i_gid ?? (I != null ? String(I) : ""), C = _.indicator_name ?? _.i_name ?? _.short_name ?? v, h = _.s_gid ?? {};
    for (const [G, g] of Object.entries(h)) {
      const B = d == null ? void 0 : d[G], ee = (B == null ? void 0 : B.unit_name) ?? (B == null ? void 0 : B.u_name) ?? G, b = g.sg_gid ?? [], ne = g.ius_nid ?? [], Y = new Set(g.default_sg_gids ?? []), M = b.map((ae, oe) => {
        const de = f[ae], E = ne[oe];
        return {
          sgGid: ae,
          sgName: (de == null ? void 0 : de.sg_name) ?? ae,
          isDefault: Y.has(ae),
          ...E != null ? { iusNid: E } : {}
        };
      });
      M.length > 0 && p.push({
        iuKey: `${v}_${G}`,
        indicatorGid: v,
        indicatorName: C,
        unitGid: G,
        unitName: ee,
        ...I != null ? { nid: I } : {},
        subgroups: M
      });
    }
  }
  return p;
}
function at(c, d, f, p = {}) {
  var C;
  const _ = (C = p.restrictUnitGid) == null ? void 0 : C.trim(), I = p.excludeGids ?? /* @__PURE__ */ new Set(), v = [];
  for (const h of c) {
    const G = h.indicator_nid ?? h.i_nid ?? (typeof h.nid == "number" ? h.nid : void 0), g = h.indicator_gid ?? h.i_gid ?? (G != null ? String(G) : ""), B = h.indicator_name ?? h.i_name ?? h.short_name ?? g;
    if (!g) continue;
    const ee = h.s_gid ?? {};
    for (const [b, ne] of Object.entries(ee)) {
      const Y = String(b ?? "").trim();
      if (!Y || _ && Y !== _) continue;
      const M = d == null ? void 0 : d[Y], ae = (M == null ? void 0 : M.unit_name) ?? (M == null ? void 0 : M.u_name) ?? Y, oe = ne.sg_gid ?? [], de = ne.ius_nid ?? [];
      for (let E = 0; E < oe.length; E += 1) {
        const V = String(oe[E] ?? "").trim();
        if (!V) continue;
        const te = on(g, Y, V);
        if (I.has(te)) continue;
        const Ae = f[V], ue = (Ae == null ? void 0 : Ae.sg_name) ?? V, Se = de[E], me = [B, ae, ue].filter(Boolean).join(", ");
        v.push({
          id: te,
          label: me,
          ...G != null ? { nid: G } : {},
          unitGid: Y,
          unitName: ae,
          subgroupGid: V,
          subgroupName: ue,
          ...Se != null ? { iusNid: Se } : {}
        });
      }
    }
  }
  return v;
}
async function ot(c, d, f, p) {
  var g, B, ee;
  const _ = c.replace(/\/$/, ""), I = [], v = {}, C = {};
  let h = 1, G = 1;
  for (; h <= G; ) {
    const b = new URLSearchParams({
      subgroup: "true",
      ius: "true",
      default_subgroup_only: "false",
      sort_field: "i_order",
      sort_order: "asc",
      ...p
    }), ne = `${_}${je}?${b.toString()}`, M = await (await fetch(ne, { headers: Ce(d, f) })).json();
    if (!M || !M.success || !Array.isArray(M.data)) break;
    I.push(...M.data), Object.assign(v, ((g = M.meta) == null ? void 0 : g.unit) ?? {}), Object.assign(C, ((B = M.meta) == null ? void 0 : B.subgroup) ?? {}), G = ((ee = M.meta) == null ? void 0 : ee.total_pages) ?? 1, h += 1;
  }
  return { data: I, unitMeta: v, subgroupMeta: C };
}
function Ht(c) {
  return c.map((d) => ({
    ...d,
    expanded: !1,
    children: d.children.length > 0 ? Ht(d.children) : d.children
  }));
}
function _n(c, d, f, p) {
  const _ = [];
  function I(C) {
    let h = !1;
    return { nodes: C.map((g) => {
      const B = String(g.ic.id);
      if (g.isLeaf) {
        const b = f(B), ne = p(B), Y = b ?? g.items, M = ne ?? g.iuRows, ae = Y.some((oe) => d.has(String(oe.id))) || M.some(
          (oe) => d.has(oe.iuKey) || oe.subgroups.some((de) => d.has(de.sgGid))
        );
        return ae && (h = !0, Y.length === 0 && M.length === 0 && _.push(B)), {
          ...g,
          items: Y,
          iuRows: M,
          loading: !1,
          expanded: ae ? !0 : g.expanded
        };
      }
      const ee = I(g.children);
      return ee.hasSelected && (h = !0), {
        ...g,
        children: ee.nodes,
        expanded: ee.hasSelected ? !0 : g.expanded
      };
    }), hasSelected: h };
  }
  return { groups: I(c).nodes, pendingLeafIds: _ };
}
function zt(c, d, f) {
  let p = !1;
  const _ = c.map((I) => {
    if (String(I.ic.id) === d)
      return p = !0, f(I);
    if (I.children.length > 0) {
      const v = zt(I.children, d, f);
      if (v !== I.children)
        return p = !0, { ...I, children: v };
    }
    return I;
  });
  return p ? _ : c;
}
function Yt(c) {
  return c.map((d) => {
    const f = d, p = Array.isArray(f.children) ? f.children : [], _ = p.length === 0;
    return {
      ic: { id: d.id, label: d.label },
      expanded: !1,
      loading: !1,
      items: [],
      iuRows: [],
      expandedIus: /* @__PURE__ */ new Set(),
      children: _ ? [] : Yt(p),
      isLeaf: _,
      isEmpty: !1,
      ic_ius_subtree_union_count: typeof f.ic_ius_subtree_union_count == "number" ? f.ic_ius_subtree_union_count : void 0
    };
  });
}
function qt(c) {
  const d = c.ic_nid ?? c.ic_gid ?? "", f = c.ic_name ?? String(d), _ = (Array.isArray(c.children) ? c.children : []).map(qt);
  return {
    id: d,
    label: f,
    children: _,
    isLeaf: _.length === 0,
    ic_ius_subtree_union_count: typeof c.ic_ius_subtree_union_count == "number" ? c.ic_ius_subtree_union_count : void 0
  };
}
function Be(c) {
  return c ?? (typeof navigator < "u" ? navigator.language : "en");
}
function Ce(c, d) {
  const f = Be(c);
  return d ? { ...d, "Accept-Language": f } : { "Accept-Language": f };
}
const Nn = {
  searchPlaceholder: "Search indicators...",
  allTabLabel: "All",
  selectClassification: "Select {type}",
  pleaseSelectClassification: "Please select a {type} from the dropdown above",
  chooseClassificationOption: "— Choose {type} —",
  selectSector: "Select Sector",
  selectTheme: "Select Theme",
  selectGoal: "Select Goal",
  pleaseSelectSector: "Please select a sector from the dropdown above",
  pleaseSelectTheme: "Please select a theme from the dropdown above",
  pleaseSelectGoal: "Please select a goal from the dropdown above",
  loadingLabel: "Loading...",
  emptyLabel: "No indicators available.",
  summaryNone: "No indicators selected",
  summaryOne: "1 indicator selected",
  summaryMany: "{n} indicators selected",
  summarySelectedPanelTitle: "Selected indicators",
  close: "Close",
  selectAll: "Select All",
  deselectAll: "Deselect All"
}, ke = /* @__PURE__ */ new Map(), Bt = /* @__PURE__ */ new Map(), be = /* @__PURE__ */ new Map(), Fe = /* @__PURE__ */ new Map(), Kt = /* @__PURE__ */ new Map(), yn = "__fetchIndicators__";
function En({
  baseUrl: c,
  multiSelect: d = !0,
  locale: f,
  headers: p,
  fetchIndicators: _,
  fetchIndicatorsCacheKey: I,
  fetchClassificationOptions: v,
  initialSelectedIds: C = [],
  initialSelectedItems: h = [],
  onReady: G,
  onChange: g,
  loadingComponent: B,
  enableUnit: ee = !0,
  enableSubgroup: b = !1,
  flatIusList: ne = !1,
  restrictUnitGid: Y,
  excludeIusGids: M = [],
  strings: ae
}) {
  var wt;
  const oe = !!(c && !_), de = !!(c != null && c.trim() || v), E = { ...Nn, ...ae }, V = ne && !b, te = b ? !0 : ee, Ae = M.join(","), ue = Oe(
    () => new Set(M.map(String)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Ae]
  ), Se = Oe(
    () => ({
      restrictUnitGid: Y,
      excludeGids: ue
    }),
    [Y, ue]
  ), me = W(
    (e) => {
      const s = Array.from(new Set(Array.from(e).map((u) => String(u))));
      if (d || b)
        return new Set(s);
      const a = s.length > 0 ? s[s.length - 1] : void 0;
      return a == null ? /* @__PURE__ */ new Set() : /* @__PURE__ */ new Set([a]);
    },
    [b, d]
  ), [$, dt] = U("all"), [he, ut] = U(""), [He, ze] = U([]), [Wt, ft] = U(!1), [Ue, mt] = U({}), [Pe, bn] = U(
    {}
  ), [Xt, Ye] = U(!1), [qe, Ie] = U({}), et = W(
    (e) => Yt(e),
    []
  ), Le = W(
    (e, s, a) => zt(e, s, a),
    []
  ), We = W(async (e, s) => {
    var k, m, S;
    const a = String(s), u = (l, N) => {
      for (const H of l) {
        if (String(H.ic.id) === N) return H;
        if (H.children.length > 0) {
          const K = u(H.children, N);
          if (K) return K;
        }
      }
      return null;
    }, r = tt.current[e];
    if (!r) return;
    const t = u(r, a);
    if (!t || !t.isLeaf || t.loading || t.items.length > 0 || t.iuRows.length > 0 || t.isEmpty) return;
    Ie((l) => {
      const N = l[e];
      if (!N) return l;
      const H = Le(N, a, (K) => !K.isLeaf || K.loading || K.items.length > 0 || K.iuRows.length > 0 || K.isEmpty ? K : { ...K, loading: !0 });
      return { ...l, [e]: H };
    });
    let n = [], i = [];
    try {
      if (_) {
        const l = Ke(e);
        n = await _({
          icType: e,
          icIdentifier: a,
          sector: l === "sector" ? a : void 0,
          goal: l === "goal" ? a : void 0,
          theme: l === "theme" ? a : void 0
        });
      } else if (c != null && c.trim()) {
        const l = c.replace(/\/$/, ""), N = Be(f), K = `${b ? `${l}|${N}|sg` : V ? `${l}|${N}|flat-ius|${Y ?? ""}|${[...ue].sort().join(",")}` : te ? `${l}|${N}|iu` : `${l}|${N}|i`}|${a}`;
        if (V) {
          const T = be.get(K);
          if (T)
            n = T;
          else {
            const ce = { ic_identifier: a };
            ce.ic_type = e;
            const { data: xe, unitMeta: L, subgroupMeta: q } = await ot(
              l,
              f,
              p,
              ce
            ), w = at(xe, L, q, Se);
            w.sort((R, le) => R.label.localeCompare(le.label, void 0, { sensitivity: "base" })), be.set(K, w), n = w;
          }
        } else if (b) {
          const T = Fe.get(K);
          if (T)
            i = T;
          else {
            const ce = `${l}${je}?ic_identifier=${encodeURIComponent(a)}&subgroup=true&ius=true`, L = await (await fetch(ce, { headers: Ce(f, p) })).json(), q = L.success ? ((k = L.meta) == null ? void 0 : k.unit) ?? {} : {}, w = L.success ? ((m = L.meta) == null ? void 0 : m.subgroup) ?? {} : {}, R = L && L.success && Array.isArray(L.data) ? ct(L.data, q, w) : [];
            Fe.set(K, R), i = R;
          }
        } else {
          const T = be.get(K);
          if (T)
            n = T;
          else {
            const ce = `${l}${je}?ic_identifier=${encodeURIComponent(a)}`, L = await (await fetch(ce, { headers: Ce(f, p) })).json(), q = L.success ? ((S = L.meta) == null ? void 0 : S.unit) ?? {} : {}, w = L && L.success && Array.isArray(L.data) ? L.data.flatMap((R) => Re(R, q, te)) : [];
            be.set(K, w), n = w;
          }
        }
      } else {
        const l = Ke(e);
        n = (await Rt(l === "sector" ? { sector: a } : l === "goal" ? { goal: a } : l === "theme" ? { theme: a } : {})).flatMap((K) => Re(K, Pt, te));
      }
    } catch {
      n = [], i = [];
    }
    n.forEach((l) => {
      D.current.set(String(l.id), l.label), A.current.set(String(l.id), l);
    });
    const o = n.length > 0 || i.length > 0;
    Ie((l) => {
      const N = l[e];
      if (!N) return l;
      const H = Le(N, a, (K) => ({
        ...K,
        loading: !1,
        items: n,
        iuRows: i,
        // Always expand after fetch resolves (whether data or empty) so the chevron points down.
        expanded: !0,
        isEmpty: !o
      }));
      return { ...l, [e]: H };
    });
  }, [
    c,
    f,
    p,
    _,
    b,
    V,
    te,
    Se,
    Y,
    ue,
    Le
  ]), [ge, J] = U([]), [ie, Ee] = U([]), [Qt, Vt] = U(/* @__PURE__ */ new Set()), [Ge, Z] = U(!0), [Q, re] = U(
    () => me(
      C.length > 0 ? C.map(String) : h.map((e) => String(e.id))
    )
  ), ht = _e(null), [pe, Xe] = U(!1), [Me, gt] = U([]), we = _e([]);
  we.current = Me;
  const [Zt, Te] = U(!1), D = _e(/* @__PURE__ */ new Map()), A = _e(/* @__PURE__ */ new Map()), De = _e([]);
  De.current = ge;
  const Ne = _e(/* @__PURE__ */ new Set());
  Ne.current = Q;
  const tt = _e({});
  tt.current = qe;
  const nt = Oe(() => He.length > 0 ? He : de ? [] : Ft, [He, de]), pt = Oe(() => {
    var e;
    return $ === "all" ? "" : ((e = nt.find((s) => s.code === $)) == null ? void 0 : e.label) ?? $;
  }, [$, nt]), _t = W((e, s) => e.replace(/\{type\}/g, s), []), Nt = _e(0), yt = W(async () => {
    var i, o, k, m, S, l, N, H, K, T, ce, xe;
    const e = ++Nt.current, s = () => e !== Nt.current, a = gn(
      $,
      he,
      Pe
    );
    if (_) {
      const L = (I == null ? void 0 : I.trim()) || yn;
      if ($ === "all") {
        const q = ke.get(L);
        if (q !== void 0) {
          if (s()) return;
          let w = q;
          if ((i = a.search) != null && i.trim()) {
            const R = a.search.trim().toLowerCase();
            w = w.filter((le) => le.label.toLowerCase().includes(R));
          }
          J(w), w.forEach((R) => {
            D.current.set(String(R.id), R.label), A.current.set(String(R.id), R);
          }), Z(!1);
          return;
        }
      }
      Z(!0);
      try {
        const q = await _(
          $ === "all" ? { ...a, search: void 0 } : a
        );
        if (s()) return;
        $ === "all" && ke.set(L, q);
        let w = q;
        if ($ === "all" && ((o = a.search) != null && o.trim())) {
          const R = a.search.trim().toLowerCase();
          w = w.filter((le) => le.label.toLowerCase().includes(R));
        }
        J(w), w.forEach((R) => {
          D.current.set(String(R.id), R.label), A.current.set(String(R.id), R);
        });
      } catch {
        if (s()) return;
        J([]);
      } finally {
        s() || Z(!1);
      }
      return;
    }
    if (oe && c) {
      const L = c.replace(/\/$/, ""), q = Be(f), w = b ? `${L}|${q}|sg` : V ? `${L}|${q}|flat-ius|${Y ?? ""}|${[...ue].sort().join(",")}` : te ? `${L}|${q}|iu` : `${L}|${q}|i`;
      if ($ === "all") {
        if (b) {
          const O = Bt.get(w);
          if (O !== void 0) {
            if (s()) return;
            Ee(O), Z(!1);
            return;
          }
        } else if (V) {
          const O = ke.get(w);
          if (O !== void 0) {
            if (s()) return;
            let F = O;
            if ((k = a.search) != null && k.trim()) {
              const x = a.search.trim().toLowerCase();
              F = F.filter((z) => z.label.toLowerCase().includes(x));
            }
            J(F), F.forEach((x) => {
              D.current.set(String(x.id), x.label), A.current.set(String(x.id), x);
            }), Z(!1);
            return;
          }
        } else {
          const O = ke.get(w);
          if (O !== void 0) {
            if (s()) return;
            let F = O;
            if ((m = a.search) != null && m.trim()) {
              const x = a.search.trim().toLowerCase();
              F = F.filter((z) => z.label.toLowerCase().includes(x));
            }
            J(F), F.forEach((x) => {
              D.current.set(String(x.id), x.label), A.current.set(String(x.id), x);
            }), Z(!1);
            return;
          }
        }
        Z(!0);
        try {
          if (V) {
            const { data: O, unitMeta: F, subgroupMeta: x } = await ot(
              L,
              f,
              p,
              {}
            );
            if (s()) return;
            const z = at(
              O,
              F,
              x,
              Se
            );
            z.sort(
              (j, P) => j.label.localeCompare(P.label, void 0, { sensitivity: "base" })
            ), ke.set(w, z);
            let se = z;
            if ((S = a.search) != null && S.trim()) {
              const j = a.search.trim().toLowerCase();
              se = se.filter((P) => P.label.toLowerCase().includes(j));
            }
            J(se), se.forEach((j) => {
              D.current.set(String(j.id), j.label), A.current.set(String(j.id), j);
            });
          } else {
            const O = `${L}${je}${b ? "?subgroup=true&ius=true" : ""}`, x = await (await fetch(O, { headers: Ce(f, p) })).json();
            if (s()) return;
            const z = x.success ? ((l = x.meta) == null ? void 0 : l.unit) ?? {} : {};
            if (b) {
              const se = x.success ? ((N = x.meta) == null ? void 0 : N.subgroup) ?? {} : {}, j = x && x.success && Array.isArray(x.data) ? ct(x.data, z, se) : [];
              Bt.set(w, j), Ee(j);
            } else {
              const se = x && x.success && Array.isArray(x.data) ? x.data.flatMap((P) => Re(P, z, te)) : [];
              ke.set(w, se);
              let j = se;
              if ((H = a.search) != null && H.trim()) {
                const P = a.search.trim().toLowerCase();
                j = j.filter((it) => it.label.toLowerCase().includes(P));
              }
              J(j), j.forEach((P) => {
                D.current.set(String(P.id), P.label), A.current.set(String(P.id), P);
              });
            }
          }
        } catch {
          if (s()) return;
          b ? Ee([]) : J([]);
        } finally {
          s() || Z(!1);
        }
        return;
      }
      const R = $ === "all" ? void 0 : Pe[$];
      if (!R) {
        b ? Ee([]) : J([]), Z(!1);
        return;
      }
      const le = `${w}|${R}`;
      if (b) {
        const O = Fe.get(le);
        if (O !== void 0) {
          Ee(O), Z(!1);
          return;
        }
      } else if (V) {
        const O = be.get(le);
        if (O !== void 0) {
          J(O), O.forEach((F) => {
            D.current.set(String(F.id), F.label), A.current.set(String(F.id), F);
          }), Z(!1);
          return;
        }
      } else {
        const O = be.get(le);
        if (O !== void 0) {
          J(O), O.forEach((F) => {
            D.current.set(String(F.id), F.label), A.current.set(String(F.id), F);
          }), Z(!1);
          return;
        }
      }
      Z(!0);
      try {
        if (V) {
          const O = $ === "all" ? void 0 : $, F = {
            ic_identifier: String(R)
          };
          O && (F.ic_type = O);
          const { data: x, unitMeta: z, subgroupMeta: se } = await ot(
            L,
            f,
            p,
            F
          );
          if (s()) return;
          const j = at(
            x,
            z,
            se,
            Se
          );
          j.sort(
            (P, it) => P.label.localeCompare(it.label, void 0, { sensitivity: "base" })
          ), be.set(le, j), J(j), j.forEach((P) => {
            D.current.set(String(P.id), P.label), A.current.set(String(P.id), P);
          });
        } else {
          const O = b ? "&subgroup=true&ius=true" : "", F = `${L}${je}?ic_identifier=${encodeURIComponent(R)}${O}`, z = await (await fetch(F, { headers: Ce(f, p) })).json();
          if (s()) return;
          const se = z.success ? ((K = z.meta) == null ? void 0 : K.unit) ?? {} : {};
          if (b) {
            const j = z.success ? ((T = z.meta) == null ? void 0 : T.subgroup) ?? {} : {}, P = z && z.success && Array.isArray(z.data) ? ct(z.data, se, j) : [];
            Fe.set(le, P), Ee(P);
          } else {
            const j = z && z.success && Array.isArray(z.data) ? z.data.flatMap((P) => Re(P, se, te)) : [];
            be.set(le, j), J(j), j.forEach((P) => {
              D.current.set(String(P.id), P.label), A.current.set(String(P.id), P);
            });
          }
        }
      } catch {
        if (s()) return;
        b ? Ee([]) : J([]);
      } finally {
        s() || Z(!1);
      }
      return;
    }
    const u = te ? "mock_iu" : "mock_i";
    if ($ === "all") {
      const L = ke.get(u);
      if (L !== void 0) {
        if (s()) return;
        let q = L;
        if ((ce = a.search) != null && ce.trim()) {
          const w = a.search.trim().toLowerCase();
          q = q.filter((R) => R.label.toLowerCase().includes(w));
        }
        J(q), q.forEach((w) => {
          D.current.set(String(w.id), w.label), A.current.set(String(w.id), w);
        }), Z(!1);
        return;
      }
    }
    Z(!0);
    const r = await Rt(
      $ === "all" ? { search: a.search } : pn(a)
    );
    if (s()) return;
    const t = r.flatMap((L) => Re(L, Pt, te));
    $ === "all" && ke.set(u, t);
    let n = t;
    if ($ === "all" && ((xe = a.search) != null && xe.trim())) {
      const L = a.search.trim().toLowerCase();
      n = n.filter((q) => q.label.toLowerCase().includes(L));
    }
    J(n), n.forEach((L) => {
      D.current.set(String(L.id), L.label), A.current.set(String(L.id), L);
    }), Z(!1);
  }, [
    c,
    f,
    p,
    _,
    I,
    oe,
    b,
    V,
    Se,
    Y,
    ue,
    te,
    $,
    he,
    Pe
  ]);
  fe(() => {
    yt();
  }, [yt]), fe(() => {
    if (!(c != null && c.trim())) {
      ze(v ? [] : Ft);
      return;
    }
    let e = !1;
    ft(!0);
    const a = `${c.replace(/\/$/, "")}${hn}`;
    return fetch(a, { headers: Ce(f, p) }).then((u) => u.json()).then((u) => {
      if (e) return;
      const r = u, t = r != null && r.success && r.data && typeof r.data == "object" ? r.data : {};
      ze(
        Object.entries(t).map(([n, i]) => ({
          code: n,
          label: String(i)
        }))
      );
    }).catch(() => {
      e || ze([]);
    }).finally(() => {
      e || ft(!1);
    }), () => {
      e = !0;
    };
  }, [c, f, p, v]), fe(() => {
    const e = $;
    if (e === "all" || Ue[e] !== void 0) return;
    const a = (t, n) => {
      if (n()) return;
      mt((o) => ({ ...o, [e]: t }));
      const i = t.map((o) => ({
        ...o,
        children: [],
        isLeaf: !0
      }));
      Ie((o) => o[e] ? o : { ...o, [e]: et(i) });
    }, u = (t, n) => {
      if (n()) return;
      const i = t.map((o) => ({ id: o.id, label: o.label }));
      mt((o) => ({ ...o, [e]: i })), Ie((o) => o[e] ? o : { ...o, [e]: et(t) });
    };
    if (v) {
      let t = !1;
      return Ye(!0), v(e).then((n) => a(n, () => t)).finally(() => {
        t || Ye(!1);
      }), () => {
        t = !0;
      };
    }
    if (c != null && c.trim()) {
      const t = c.replace(/\/$/, ""), n = Be(f), i = `${t}|${n}|${e}|hierarchical`, o = Kt.get(i);
      if (o !== void 0) {
        u(o, () => !1);
        return;
      }
      let k = !1;
      Ye(!0);
      const m = new URLSearchParams({
        ic_type: e,
        hierarchical: "true",
        include_ic_ius_counts: "true",
        sort_field: $e.sort_field,
        sort_order: $e.sort_order
      }), S = `${t}${mn}?${m.toString()}`;
      return fetch(S, { headers: Ce(f, p) }).then((l) => l.json()).then((l) => {
        const N = l, H = N != null && N.success && Array.isArray(N.data) ? N.data.map(qt) : [];
        Kt.set(i, H), u(H, () => k);
      }).finally(() => {
        k || Ye(!1);
      }), () => {
        k = !0;
      };
    }
    const r = jt(e);
    a(r, () => !1);
  }, [
    $,
    c,
    f,
    p,
    v,
    Ue,
    Pe,
    et
  ]);
  const bt = _e(/* @__PURE__ */ new Set());
  fe(() => {
    const e = $;
    if (e === "all") return;
    const s = qe[e];
    if (!s || s.length === 0 || Ne.current.size === 0 || bt.current.has(e)) return;
    bt.current.add(e);
    const a = c != null && c.trim() ? c.replace(/\/$/, "") : "", u = Be(f), r = (m) => `${b ? `${a}|${u}|sg` : V ? `${a}|${u}|flat-ius|${Y ?? ""}|${[...ue].sort().join(",")}` : te ? `${a}|${u}|iu` : `${a}|${u}|i`}|${m}`, t = (m) => be.get(r(m)), n = (m) => Fe.get(r(m)), { groups: i, pendingLeafIds: o } = _n(
      s,
      Ne.current,
      t,
      n
    ), k = (m) => {
      for (const S of m)
        S.isLeaf ? S.items.forEach((l) => {
          D.current.set(String(l.id), l.label), A.current.set(String(l.id), l);
        }) : k(S.children);
    };
    k(i), Ie((m) => ({ ...m, [e]: i }));
    for (const m of o)
      We(e, m);
  }, [$, qe, c, f, b, V, te, Y, ue, We]);
  const Jt = C.length > 0 ? [...C].map(String).sort().join(",") : h.map((e) => String(e.id)).sort().join(",");
  fe(() => {
    const e = C.length > 0 ? C.map(String) : h.map((r) => String(r.id)), s = De.current;
    if (s.length === 0) {
      e.length > 0 && re(me(e)), h.forEach((r) => {
        D.current.set(String(r.id), r.label), A.current.set(String(r.id), r);
      });
      return;
    }
    const a = e.map((r) => {
      const t = h.find((i) => String(i.id) === r);
      let n = s.find(
        (i) => String(i.id) === r || i.nid != null && (String(i.nid) === r || i.nid === Number(r))
      );
      if (!n && (t == null ? void 0 : t.label) != null) {
        const i = t.label.trim().toLowerCase();
        n = s.find(
          (o) => {
            var k;
            return ((k = o.label) == null ? void 0 : k.trim().toLowerCase()) === i;
          }
        );
      }
      return n ? String(n.id) : r;
    }), u = me(a);
    u.size > 0 && re((r) => {
      if (r.size !== u.size) return u;
      for (const t of u) if (!r.has(t)) return u;
      return r;
    }), a.forEach((r) => {
      const t = s.find((n) => String(n.id) === r) ?? h.find((n) => String(n.id) === r);
      t && (D.current.set(r, t.label), A.current.set(r, t));
    }), h.forEach((r) => {
      D.current.set(String(r.id), r.label), A.current.set(String(r.id), r);
    });
  }, [Jt, me]), fe(() => {
    ge.forEach((e) => {
      D.current.set(String(e.id), e.label), A.current.set(String(e.id), e);
    });
  }, [ge]);
  const Ut = ge.length;
  fe(() => {
    const e = De.current;
    if (e.length === 0) return;
    const s = Ne.current, a = (t) => String(t).trim().toLowerCase(), u = Array.from(s).map((t) => {
      var i;
      let n = e.find(
        (o) => String(o.id) === t || o.nid != null && (String(o.nid) === t || o.nid === Number(t))
      );
      if (!n) {
        const o = (i = D.current.get(t)) == null ? void 0 : i.trim().toLowerCase();
        o && (n = e.find((k) => {
          var m;
          return ((m = k.label) == null ? void 0 : m.trim().toLowerCase()) === o;
        }));
      }
      if (!n) {
        const o = a(t);
        n = e.find((k) => a(String(k.id)) === o);
      }
      return n ? String(n.id) : t;
    }), r = me(u);
    re((t) => t.size !== r.size || [...t].some((n) => !r.has(n)) ? r : t), u.forEach((t) => {
      const n = e.find((i) => String(i.id) === t);
      n && (D.current.set(t, n.label), A.current.set(t, n));
    });
  }, [Ut, me]);
  const Qe = W(() => {
    if (pe)
      return we.current.map((e) => ({
        id: e.id,
        label: e.label ?? D.current.get(String(e.id)) ?? String(e.id),
        ..."nid" in e && e.nid != null ? { nid: e.nid } : {},
        ..."unitGid" in e && e.unitGid != null ? { unitGid: e.unitGid } : {},
        ..."unitName" in e && e.unitName != null ? { unitName: e.unitName } : {},
        ..."subgroupGid" in e && e.subgroupGid != null ? { subgroupGid: e.subgroupGid } : {},
        ..."subgroupName" in e && e.subgroupName != null ? { subgroupName: e.subgroupName } : {},
        ..."iusNid" in e && e.iusNid != null ? { iusNid: e.iusNid } : {}
      }));
    if (b) {
      const e = [];
      return Q.forEach((s) => {
        const a = s.split("|");
        if (a.length === 3) {
          const [u, r, t] = a, n = ie.find((o) => o.indicatorGid === u && o.unitGid === r), i = n == null ? void 0 : n.subgroups.find((o) => o.sgGid === t);
          e.push({
            id: s,
            label: `${(n == null ? void 0 : n.indicatorName) ?? u}, ${(n == null ? void 0 : n.unitName) ?? r} - ${(i == null ? void 0 : i.sgName) ?? t}`,
            ...(n == null ? void 0 : n.nid) != null ? { nid: n.nid } : {},
            unitGid: r,
            unitName: n == null ? void 0 : n.unitName,
            subgroupGid: t,
            subgroupName: i == null ? void 0 : i.sgName,
            ...(i == null ? void 0 : i.iusNid) != null ? { iusNid: i.iusNid } : {}
          });
        }
      }), e;
    }
    return Array.from(Q).map((e) => {
      const s = A.current.get(e) ?? ge.find((a) => String(a.id) === e);
      return {
        id: e,
        label: (s == null ? void 0 : s.label) ?? D.current.get(e) ?? e,
        ...(s == null ? void 0 : s.nid) != null ? { nid: s.nid } : {},
        ...(s == null ? void 0 : s.unitGid) != null ? { unitGid: s.unitGid } : {},
        ...(s == null ? void 0 : s.unitName) != null ? { unitName: s.unitName } : {},
        ...(s == null ? void 0 : s.subgroupGid) != null ? { subgroupGid: s.subgroupGid } : {},
        ...(s == null ? void 0 : s.subgroupName) != null ? { subgroupName: s.subgroupName } : {},
        ...(s == null ? void 0 : s.iusNid) != null ? { iusNid: s.iusNid } : {}
      };
    });
  }, [Q, ge, pe, b, ie]), St = W(() => {
    var e;
    re(/* @__PURE__ */ new Set()), (e = ht.current) == null || e.clearData(), g == null || g([]);
  }, [g]), kt = W(
    (e) => {
      re(me(e.map(String)));
    },
    [me]
  ), Ve = _e({
    getSelected: Qe,
    clear: St,
    setSelectedIds: kt
  });
  Ve.current.getSelected = Qe, Ve.current.clear = St, Ve.current.setSelectedIds = kt, fe(() => {
    G == null || G(Ve.current);
  }, [G]);
  const $t = W((e) => {
    ht.current = e;
  }, []), st = W(
    (e) => {
      const s = d ? e : e.slice(-1);
      re(new Set(s.map((u) => String(u.id))));
      const a = s.map((u) => {
        const r = String(u.id), t = A.current.get(r);
        return De.current.find((i) => String(i.id) === r) ?? t ?? u;
      });
      g == null || g(a);
    },
    [d, g]
  ), en = W((e) => {
    Vt((s) => {
      const a = new Set(s);
      return a.has(e) ? a.delete(e) : a.add(e), a;
    });
  }, []), It = W((e, s) => {
    const a = e.subgroups.map((u) => `${e.indicatorGid}|${e.unitGid}|${u.sgGid}`);
    re((u) => {
      let r;
      return d ? r = new Set(u) : s ? r = /* @__PURE__ */ new Set() : r = new Set(u), s ? a.forEach((t) => r.add(t)) : a.forEach((t) => r.delete(t)), r;
    }), queueMicrotask(() => {
      const u = [];
      let r;
      d ? r = new Set(Q) : s ? r = /* @__PURE__ */ new Set() : r = new Set(Q), s ? a.forEach((t) => r.add(t)) : a.forEach((t) => r.delete(t)), r.forEach((t) => {
        const n = t.split("|");
        if (n.length === 3) {
          const [i, o, k] = n, m = ie.find((l) => l.indicatorGid === i && l.unitGid === o), S = m == null ? void 0 : m.subgroups.find((l) => l.sgGid === k);
          u.push({
            id: t,
            label: `${(m == null ? void 0 : m.indicatorName) ?? i}, ${(m == null ? void 0 : m.unitName) ?? o} - ${(S == null ? void 0 : S.sgName) ?? k}`,
            ...(m == null ? void 0 : m.nid) != null ? { nid: m.nid } : {},
            unitGid: o,
            unitName: m == null ? void 0 : m.unitName,
            subgroupGid: k,
            subgroupName: S == null ? void 0 : S.sgName,
            ...(S == null ? void 0 : S.iusNid) != null ? { iusNid: S.iusNid } : {}
          });
        }
      }), g == null || g(u);
    });
  }, [ie, Q, d, g]), Lt = W((e, s) => {
    const a = e.split("|"), u = a.length >= 2 ? `${a[0]}|${a[1]}` : "";
    re((r) => {
      let t;
      if (d)
        t = new Set(r);
      else {
        const n = Array.from(r).filter((i) => {
          const o = i.split("|");
          return (o.length >= 2 ? `${o[0]}|${o[1]}` : "") === u;
        });
        t = new Set(n);
      }
      return s ? t.add(e) : t.delete(e), t;
    }), queueMicrotask(() => {
      const r = [];
      let t;
      if (d)
        t = s ? /* @__PURE__ */ new Set([...Q, e]) : new Set(Array.from(Q).filter((n) => n !== e));
      else {
        const n = Array.from(Q).filter((i) => {
          const o = i.split("|");
          return (o.length >= 2 ? `${o[0]}|${o[1]}` : "") === u;
        });
        t = new Set(n), s ? t.add(e) : t.delete(e);
      }
      t.forEach((n) => {
        const i = n.split("|");
        if (i.length === 3) {
          const [o, k, m] = i, S = ie.find((N) => N.indicatorGid === o && N.unitGid === k), l = S == null ? void 0 : S.subgroups.find((N) => N.sgGid === m);
          r.push({
            id: n,
            label: `${(S == null ? void 0 : S.indicatorName) ?? o}, ${(S == null ? void 0 : S.unitName) ?? k} - ${(l == null ? void 0 : l.sgName) ?? m}`,
            ...(S == null ? void 0 : S.nid) != null ? { nid: S.nid } : {},
            unitGid: k,
            unitName: S == null ? void 0 : S.unitName,
            subgroupGid: m,
            subgroupName: l == null ? void 0 : l.sgName,
            ...(l == null ? void 0 : l.iusNid) != null ? { iusNid: l.iusNid } : {}
          });
        }
      }), g == null || g(r);
    });
  }, [ie, d, Q, g]), Et = W((e, s) => {
    const a = String(s), u = tt.current[e], r = (i, o) => {
      for (const k of i) {
        if (String(k.ic.id) === o) return k;
        if (k.children.length > 0) {
          const m = r(k.children, o);
          if (m) return m;
        }
      }
      return null;
    }, t = u ? r(u, a) : null;
    (t == null ? void 0 : t.isLeaf) && !t.isEmpty && !t.loading && t.items.length === 0 && t.iuRows.length === 0 ? We(e, s) : Ie((i) => {
      const o = i[e];
      if (!o) return i;
      const k = Le(o, a, (m) => m.expanded ? { ...m, expanded: !1, children: Ht(m.children) } : { ...m, expanded: !0 });
      return { ...i, [e]: k };
    });
  }, [We, Le]), tn = W((e, s, a) => {
    const u = String(s);
    Ie((r) => {
      const t = r[e];
      if (!t) return r;
      const n = Le(t, u, (i) => {
        const o = new Set(i.expandedIus);
        return o.has(a) ? o.delete(a) : o.add(a), { ...i, expandedIus: o };
      });
      return { ...r, [e]: n };
    });
  }, [Le]), nn = W(
    (e, s) => {
      const a = d ? s : s.slice(-1), u = new Set(a.map((n) => String(n.id)));
      a.forEach((n) => {
        D.current.set(String(n.id), n.label), A.current.has(String(n.id)) || A.current.set(String(n.id), n);
      });
      let r;
      if (!d)
        r = u;
      else {
        r = new Set(Ne.current);
        for (const n of e) r.delete(n);
        for (const n of u) r.add(n);
      }
      re(r);
      const t = Array.from(r).map((n) => A.current.get(n) ?? { id: n, label: D.current.get(n) ?? n });
      g == null || g(t);
    },
    [d, g]
  ), Ze = W(
    (e) => {
      if (b) {
        const s = he.trim().toLowerCase(), u = (s ? ie.filter((i) => {
          const o = i.indicatorName.toLowerCase().includes(s) || i.unitName.toLowerCase().includes(s), k = i.subgroups.some(
            (m) => m.sgName.toLowerCase().includes(s)
          );
          return o || k;
        }) : ie).flatMap(
          (i) => i.subgroups.map((o) => `${i.indicatorGid}|${i.unitGid}|${o.sgGid}`)
        ), r = new Set(Ne.current);
        e ? u.forEach((i) => r.add(i)) : u.forEach((i) => r.delete(i)), re(r);
        const t = new Map(
          ie.map((i) => [`${i.indicatorGid}|${i.unitGid}`, i])
        ), n = [];
        r.forEach((i) => {
          const o = i.split("|");
          if (o.length === 3) {
            const [k, m, S] = o, l = t.get(`${k}|${m}`), N = l == null ? void 0 : l.subgroups.find((H) => H.sgGid === S);
            n.push({
              id: i,
              label: `${(l == null ? void 0 : l.indicatorName) ?? k}, ${(l == null ? void 0 : l.unitName) ?? m} - ${(N == null ? void 0 : N.sgName) ?? S}`,
              ...(l == null ? void 0 : l.nid) != null ? { nid: l.nid } : {},
              unitGid: m,
              unitName: l == null ? void 0 : l.unitName,
              subgroupGid: S,
              subgroupName: N == null ? void 0 : N.sgName,
              ...(N == null ? void 0 : N.iusNid) != null ? { iusNid: N.iusNid } : {}
            });
          }
        }), g == null || g(n);
      } else {
        const s = De.current, a = s.map((t) => String(t.id)), u = new Set(Ne.current);
        e ? a.forEach((t) => {
          u.add(t);
          const n = s.find((i) => String(i.id) === t);
          n && (D.current.set(t, n.label), A.current.set(t, n));
        }) : a.forEach((t) => u.delete(t)), re(u);
        const r = Array.from(u).map((t) => A.current.get(t) ?? { id: t, label: D.current.get(t) ?? t });
        g == null || g(r);
      }
    },
    [b, he, ie, g]
  ), vt = W(
    (e, s, a) => {
      if (b) {
        const u = s.iuRows.flatMap(
          (i) => i.subgroups.map((o) => `${i.indicatorGid}|${i.unitGid}|${o.sgGid}`)
        ), r = new Set(Ne.current);
        a ? u.forEach((i) => r.add(i)) : u.forEach((i) => r.delete(i)), re(r);
        const t = new Map(
          s.iuRows.map((i) => [`${i.indicatorGid}|${i.unitGid}`, i])
        ), n = [];
        r.forEach((i) => {
          const o = i.split("|");
          if (o.length === 3) {
            const [k, m, S] = o, l = t.get(`${k}|${m}`), N = l == null ? void 0 : l.subgroups.find((H) => H.sgGid === S);
            n.push({
              id: i,
              label: `${(l == null ? void 0 : l.indicatorName) ?? k}, ${(l == null ? void 0 : l.unitName) ?? m} - ${(N == null ? void 0 : N.sgName) ?? S}`,
              ...(l == null ? void 0 : l.nid) != null ? { nid: l.nid } : {},
              unitGid: m,
              unitName: l == null ? void 0 : l.unitName,
              subgroupGid: S,
              subgroupName: N == null ? void 0 : N.sgName,
              ...(N == null ? void 0 : N.iusNid) != null ? { iusNid: N.iusNid } : {}
            });
          }
        }), g == null || g(n);
      } else {
        const u = s.items.map((n) => String(n.id)), r = new Set(Ne.current);
        a ? u.forEach((n) => {
          r.add(n);
          const i = s.items.find((o) => String(o.id) === n);
          i && (D.current.set(n, i.label), A.current.set(n, i));
        }) : u.forEach((n) => r.delete(n)), re(r);
        const t = Array.from(r).map((n) => A.current.get(n) ?? { id: n, label: D.current.get(n) ?? n });
        g == null || g(t);
      }
    },
    [b, g]
  ), sn = W(() => {
    st(we.current), Xe(!1), Te(!1);
  }, [st]), Ct = W(() => {
    const e = Qe();
    we.current = e, gt(e), Xe(!0);
  }, [Qe]);
  fe(() => {
    pe ? (Te(!1), requestAnimationFrame(() => Te(!0))) : Te(!1);
  }, [pe]), fe(() => {
    Q.size === 0 && pe && (Xe(!1), Te(!1));
  }, [Q.size, pe]), fe(() => {
    !d && pe && (Xe(!1), Te(!1));
  }, [d, pe]);
  const ye = pe ? Me.length : Q.size, rn = ye === 0 ? /* @__PURE__ */ y(Tt, { children: E.summaryNone }) : /* @__PURE__ */ X(Tt, { children: [
    /* @__PURE__ */ y("span", { className: "dtk-ind-count", children: ye }),
    " ",
    ye === 1 ? "indicator" : "indicators",
    " selected"
  ] }), ve = $ === "all" || !!((wt = Pe[$]) != null && wt.trim()), cn = $ === "all" ? E.emptyLabel : _t(E.pleaseSelectClassification, pt);
  de || v ? Ue[$] : jt($), (() => {
    if ($ === "all") return "";
    const e = Ke($);
    return e === "sector" ? E.selectSector : e === "goal" ? E.selectGoal : e === "theme" ? E.selectTheme : _t(E.selectClassification, pt);
  })();
  const Je = Oe(() => {
    if (!b || !he.trim())
      return ie;
    const e = he.trim().toLowerCase();
    return ie.filter((s) => {
      const a = s.indicatorName.toLowerCase().includes(e) || s.unitName.toLowerCase().includes(e), u = s.subgroups.some(
        (r) => r.sgName.toLowerCase().includes(e)
      );
      return a || u;
    });
  }, [ie, he, b]), Gt = $ === "all" && d && ve && !Ge && (b ? Je.length > 0 : ge.length > 0);
  return /* @__PURE__ */ X("div", { className: "dtk-ind-root", children: [
    /* @__PURE__ */ X("aside", { className: "dtk-ind-sidebar", children: [
      /* @__PURE__ */ y(
        "button",
        {
          type: "button",
          className: `dtk-ind-tab ${$ === "all" ? "dtk-ind-tab-active" : ""}`,
          onClick: () => dt("all"),
          children: E.allTabLabel
        }
      ),
      nt.map((e) => /* @__PURE__ */ y(
        "button",
        {
          type: "button",
          className: `dtk-ind-tab ${$ === e.code ? "dtk-ind-tab-active" : ""}`,
          onClick: () => dt(e.code),
          disabled: Wt && He.length === 0,
          children: e.label
        },
        e.code
      ))
    ] }),
    /* @__PURE__ */ X("div", { className: "dtk-ind-main", children: [
      /* @__PURE__ */ X("div", { className: "dtk-ind-content", children: [
        /* @__PURE__ */ y("div", { className: "dtk-ind-controls", children: $ === "all" && /* @__PURE__ */ X("div", { className: "dtk-ind-search-wrap", children: [
          /* @__PURE__ */ y("span", { className: "dtk-ind-search-icon", "aria-hidden": !0 }),
          /* @__PURE__ */ y(
            "input",
            {
              type: "text",
              className: "dtk-ind-search",
              placeholder: E.searchPlaceholder,
              value: he,
              onChange: (e) => ut(e.target.value),
              "aria-label": E.searchPlaceholder
            }
          ),
          he.trim() ? /* @__PURE__ */ y(
            "button",
            {
              type: "button",
              className: "dtk-ind-search-clear",
              onClick: () => ut(""),
              "aria-label": "Clear search",
              title: "Clear",
              children: "×"
            }
          ) : null
        ] }) }),
        /* @__PURE__ */ X("div", { className: "dtk-ind-list-wrap", children: [
          $ === "all" && !ve && /* @__PURE__ */ y("div", { className: "dtk-ind-empty", children: cn }),
          $ === "all" && ve && Ge && (B ? /* @__PURE__ */ y("div", { className: "dtk-ind-loading-slot", children: B }) : /* @__PURE__ */ y("div", { className: "dtk-ind-empty dtk-ind-loading", children: E.loadingLabel })),
          $ === "all" && ve && !Ge && b && Je.length === 0 && /* @__PURE__ */ y("div", { className: "dtk-ind-empty", children: E.emptyLabel }),
          $ === "all" && ve && !Ge && !b && ge.length === 0 && /* @__PURE__ */ y("div", { className: "dtk-ind-empty", children: E.emptyLabel }),
          $ === "all" && ve && !Ge && b && Je.length > 0 && /* @__PURE__ */ X("div", { className: "dtk-ind-all-list-block", children: [
            Gt && /* @__PURE__ */ X("div", { className: "dtk-ic-group-select-all-row", children: [
              /* @__PURE__ */ y(
                "button",
                {
                  type: "button",
                  className: "dtk-ic-group-select-all",
                  onClick: () => Ze(!0),
                  children: E.selectAll
                }
              ),
              /* @__PURE__ */ y(
                "button",
                {
                  type: "button",
                  className: "dtk-ic-group-select-all",
                  onClick: () => Ze(!1),
                  children: E.deselectAll
                }
              )
            ] }),
            /* @__PURE__ */ y("div", { className: "dtk-ind-all-list-content", children: /* @__PURE__ */ y(
              At,
              {
                iuRows: Je,
                selectedGids: Q,
                expandedIus: Qt,
                onToggleExpand: en,
                onIuCheck: It,
                onSubgroupCheck: Lt
              }
            ) })
          ] }),
          $ === "all" && ve && !Ge && !b && ge.length > 0 && /* @__PURE__ */ X("div", { className: "dtk-ind-all-list-block", children: [
            Gt && /* @__PURE__ */ X("div", { className: "dtk-ic-group-select-all-row", children: [
              /* @__PURE__ */ y(
                "button",
                {
                  type: "button",
                  className: "dtk-ic-group-select-all",
                  onClick: () => Ze(!0),
                  children: E.selectAll
                }
              ),
              /* @__PURE__ */ y(
                "button",
                {
                  type: "button",
                  className: "dtk-ic-group-select-all",
                  onClick: () => Ze(!1),
                  children: E.deselectAll
                }
              )
            ] }),
            /* @__PURE__ */ y("div", { className: "dtk-ind-all-list-content", children: /* @__PURE__ */ y(
              rt,
              {
                items: ge,
                multiSelect: d,
                selectedIds: Array.from(Q),
                onSelectionChange: st,
                onReady: $t
              }
            ) })
          ] }),
          $ !== "all" && (() => {
            const e = qe[$];
            if (!e)
              return Xt ? B ? /* @__PURE__ */ y("div", { className: "dtk-ind-loading-slot", children: B }) : /* @__PURE__ */ y("div", { className: "dtk-ind-empty dtk-ind-loading", children: E.loadingLabel }) : /* @__PURE__ */ y("div", { className: "dtk-ind-empty", children: E.emptyLabel });
            const s = he.trim().toLowerCase(), a = (t) => {
              if (b) {
                let i = 0;
                for (const o of t.iuRows)
                  for (const k of o.subgroups)
                    Q.has(`${o.indicatorGid}|${o.unitGid}|${k.sgGid}`) && i++;
                return i;
              }
              let n = 0;
              for (const i of t.items)
                Q.has(String(i.id)) && n++;
              return n;
            }, u = (t) => t.isLeaf ? a(t) : t.children.reduce((n, i) => n + u(i), 0), r = (t, n) => {
              const i = String(t.ic.id), o = t.expanded, k = u(t);
              let m = t.items, S = t.iuRows;
              t.isLeaf && s && (b ? S = S.filter(
                (T) => T.indicatorName.toLowerCase().includes(s) || T.unitName.toLowerCase().includes(s) || T.subgroups.some((ce) => ce.sgName.toLowerCase().includes(s))
              ) : m = m.filter(
                (T) => T.label.toLowerCase().includes(s)
              ));
              const l = new Set(t.items.map((T) => String(T.id))), N = t.isLeaf && t.loading, H = !N, K = d && t.isLeaf && o && !t.loading && !t.isEmpty && (t.items.length > 0 || t.iuRows.length > 0);
              return /* @__PURE__ */ X("div", { className: "dtk-ic-group", "data-depth": n, children: [
                /* @__PURE__ */ X(
                  "div",
                  {
                    className: `dtk-ic-group-header${o ? " dtk-ic-group-header-open" : ""}${n > 0 ? " dtk-ic-group-header-nested" : ""}`,
                    style: { paddingLeft: `calc(var(--spacing-panel-x, 1rem) + ${n} * 1rem)` },
                    children: [
                      /* @__PURE__ */ y(
                        "button",
                        {
                          type: "button",
                          className: "dtk-ic-group-toggle",
                          onClick: H ? () => Et($, t.ic.id) : void 0,
                          "aria-expanded": o,
                          "aria-label": N ? E.loadingLabel : o ? "Collapse" : "Expand",
                          disabled: N,
                          children: N ? /* @__PURE__ */ y("svg", { className: "dtk-ic-group-chevron-svg dtk-ic-group-chevron-spin", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ y("path", { d: "M12 2a10 10 0 1 0 10 10" }) }) : /* @__PURE__ */ y(
                            "svg",
                            {
                              className: `dtk-ic-group-chevron-svg${o ? " dtk-ic-group-chevron-open" : ""}`,
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2.5",
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                              children: /* @__PURE__ */ y("polyline", { points: "9 18 15 12 9 6" })
                            }
                          )
                        }
                      ),
                      /* @__PURE__ */ y(
                        "span",
                        {
                          className: "dtk-ic-group-label",
                          onClick: H ? () => Et($, t.ic.id) : void 0,
                          style: { cursor: H ? "pointer" : "default" },
                          children: t.ic.label
                        }
                      ),
                      k > 0 && /* @__PURE__ */ y("span", { className: "dtk-ic-group-badge", children: k })
                    ]
                  }
                ),
                K && /* @__PURE__ */ X(
                  "div",
                  {
                    className: "dtk-ic-group-select-all-row",
                    style: { paddingLeft: `calc(var(--spacing-panel-x, 0.75rem) + ${n + 1} * 1rem)` },
                    children: [
                      /* @__PURE__ */ y(
                        "button",
                        {
                          type: "button",
                          className: "dtk-ic-group-select-all",
                          onClick: (T) => {
                            T.stopPropagation(), vt($, t, !0);
                          },
                          children: E.selectAll
                        }
                      ),
                      /* @__PURE__ */ y(
                        "button",
                        {
                          type: "button",
                          className: "dtk-ic-group-select-all",
                          onClick: (T) => {
                            T.stopPropagation(), vt($, t, !1);
                          },
                          children: E.deselectAll
                        }
                      )
                    ]
                  }
                ),
                o && !N && /* @__PURE__ */ X("div", { className: "dtk-ic-group-children", children: [
                  !t.isLeaf && t.children.map((T) => r(T, n + 1)),
                  t.isLeaf && /* @__PURE__ */ X("div", { style: { paddingLeft: `${(n + 1) * 1.25}rem` }, children: [
                    t.loading && /* @__PURE__ */ y("div", { className: "dtk-ic-leaf-loading", children: B || /* @__PURE__ */ y("span", { className: "dtk-ind-empty dtk-ind-loading", children: E.loadingLabel }) }),
                    !t.loading && b && S.length > 0 && /* @__PURE__ */ y(
                      At,
                      {
                        iuRows: S,
                        selectedGids: Q,
                        expandedIus: t.expandedIus,
                        onToggleExpand: (T) => tn($, t.ic.id, T),
                        onIuCheck: It,
                        onSubgroupCheck: Lt
                      }
                    ),
                    !t.loading && !b && m.length > 0 && /* @__PURE__ */ y(
                      rt,
                      {
                        items: m,
                        multiSelect: d,
                        selectedIds: Array.from(Q).filter(
                          (T) => m.some((ce) => String(ce.id) === T)
                        ),
                        onSelectionChange: (T) => nn(l, T),
                        onReady: $t
                      }
                    )
                  ] })
                ] })
              ] }, i);
            };
            return /* @__PURE__ */ y("div", { className: "dtk-ic-tree-root", children: e.map((t) => r(t, 0)) });
          })()
        ] }),
        d && pe && /* @__PURE__ */ X(
          "div",
          {
            className: `dtk-ind-selected-panel ${Zt ? "dtk-ind-selected-panel-is-open" : ""}`,
            role: "dialog",
            "aria-label": E.summarySelectedPanelTitle,
            children: [
              /* @__PURE__ */ X("div", { className: "dtk-ind-selected-panel-header", children: [
                /* @__PURE__ */ y("span", { className: "dtk-ind-selected-panel-title", children: E.summarySelectedPanelTitle }),
                /* @__PURE__ */ y(
                  "button",
                  {
                    type: "button",
                    className: "dtk-ind-selected-panel-close",
                    onClick: sn,
                    "aria-label": E.close,
                    title: E.close,
                    children: "×"
                  }
                )
              ] }),
              /* @__PURE__ */ y("div", { className: "dtk-ind-selected-panel-list", children: Me.length === 0 ? /* @__PURE__ */ y("div", { className: "dtk-ind-empty", children: E.summaryNone }) : /* @__PURE__ */ y(
                rt,
                {
                  items: Me,
                  multiSelect: d,
                  selectedIds: Me.map((e) => e.id),
                  onSelectionChange: (e) => {
                    const s = we.current, a = e.map((u) => {
                      const r = String(u.id);
                      return s.find((t) => String(t.id) === r) ?? A.current.get(r) ?? u;
                    });
                    we.current = a, gt(a);
                  }
                }
              ) })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ y(
        "div",
        {
          className: `dtk-ind-summary${d && ye > 0 ? " dtk-ind-summary-clickable" : ""}`,
          onClick: d && ye > 0 ? Ct : void 0,
          role: d && ye > 0 ? "button" : void 0,
          tabIndex: d && ye > 0 ? 0 : void 0,
          "aria-label": d && ye > 0 ? E.summarySelectedPanelTitle : void 0,
          onKeyDown: d && ye > 0 ? (e) => {
            (e.key === "Enter" || e.key === " ") && (e.preventDefault(), Ct());
          } : void 0,
          children: rn
        }
      )
    ] })
  ] });
}
export {
  lt as IUS_GID_SEP,
  En as IndicatorSelect,
  At as IuTreeView,
  on as buildIusGid,
  Ln as parseIusGid
};
//# sourceMappingURL=dfa-v6-comp-indicator.js.map
