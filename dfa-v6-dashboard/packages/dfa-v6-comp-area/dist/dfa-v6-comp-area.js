import "dfa-v6-comp-treeview/styles.css";
import "dfa-v6-comp-list-view/styles.css";
import { jsx as u, jsxs as _, Fragment as oe } from "react/jsx-runtime";
import { useCallback as L, useMemo as $e, useState as T, useRef as F, useEffect as O } from "react";
import { TreeView as je } from "dfa-v6-comp-treeview";
import { ListView as et } from "dfa-v6-comp-list-view";
const tt = "/areas", rt = "/area-levels", nt = [
  { value: "", label: "All Levels (Tree View)" }
];
function Be(l) {
  return l ?? (typeof navigator < "u" ? navigator.language : "en");
}
function ne(l, i) {
  const p = Be(l);
  return i ? { ...i, "Accept-Language": p } : { "Accept-Language": p };
}
const st = {
  filterByLevel: "Filter by Level",
  searchPlaceholder: "Search areas...",
  expandAll: "Expand All",
  collapseAll: "Collapse All",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  emptyLabel: "No areas to display.",
  loadingLabel: "Loading...",
  summaryNone: "No areas selected",
  summaryOne: "1 area selected",
  summaryMany: "{n} areas selected",
  summarySelectedPanelTitle: "Selected areas",
  close: "Close"
};
function be(l, i) {
  var C;
  const p = l.replace(/\/$/, ""), g = typeof window < "u" ? window.location.origin : "http://localhost", v = new URL(p, g);
  return v.searchParams.set("parent", i.parent ?? "root"), i.level && v.searchParams.set("level", i.level), (C = i.search) != null && C.trim() && v.searchParams.set("search", i.search.trim()), v.pathname + v.search;
}
function ve(l) {
  return {
    id: l.id,
    label: l.label,
    type: l.type,
    hasChildren: l.hasChildren,
    path: l.path
  };
}
const De = /* @__PURE__ */ new Map(), Oe = /* @__PURE__ */ new Map();
function at(l) {
  const i = Number(l.ar_nid ?? l.a_nid ?? 0) || 0, p = l.ar_parent_nid ?? l.a_parent_nid, g = typeof p == "number" && !Number.isNaN(p) ? p : Number(p), v = p == null || typeof g == "number" && (Number.isNaN(g) || g === 0 || g === i) ? null : g, C = l.ar_id ?? l.a_id ?? String(i), x = (l.ar_name ?? l.a_name) || C, $ = Number(l.ar_level ?? l.a_level ?? 0) || 0;
  return { nid: i, parentNid: v, id: C, name: x, level: $ };
}
function lt(l, i) {
  const p = new Map(l.map((s) => [s.nid, s])), g = new Map(l.map((s) => [s.id, s])), v = /* @__PURE__ */ new Map();
  for (const s of l) {
    const f = s.parentNid ?? 0;
    v.has(f) || v.set(f, []), v.get(f).push(s);
  }
  const C = (s) => {
    var f;
    return (((f = v.get(s)) == null ? void 0 : f.length) ?? 0) > 0;
  }, x = (s) => ({
    id: s.id,
    label: s.name,
    type: i.get(s.level) ?? "Unknown",
    hasChildren: C(s.nid),
    nid: s.nid
  });
  let $ = l.filter((s) => s.parentNid == null);
  if ($.length === 0 && l.length > 0) {
    const s = Math.min(...l.map((f) => f.level));
    $ = l.filter((f) => f.level === s);
  }
  const B = $.map((s) => x(s)), j = (s) => {
    const f = g.get(s) ?? p.get(Number(s));
    return f ? (v.get(f.nid) ?? []).map((h) => x(h)) : [];
  }, W = "→", R = /* @__PURE__ */ new Map();
  function X(s) {
    const f = R.get(s);
    if (f !== void 0) return f;
    const N = g.get(s);
    if (!N) return s;
    const h = [N.name];
    let S = N.parentNid;
    for (; S != null && S !== 0; ) {
      const I = p.get(S);
      if (!I || (h.unshift(I.name), S = I.parentNid ?? 0, S === 0)) break;
    }
    const E = h.join(` ${W} `);
    return R.set(s, E), E;
  }
  const de = (s, f) => {
    let N = l.map((h) => ({ ...x(h), path: X(h.id) }));
    if (s && (N = N.filter((h) => h.type === s)), f != null && f.trim()) {
      const h = f.trim().toLowerCase();
      N = N.filter((S) => {
        var E;
        return (E = S.label) == null ? void 0 : E.toLowerCase().includes(h);
      });
    }
    return N;
  }, ee = [
    { value: "", label: "All Levels (Tree View)" },
    ...Array.from(i.entries()).sort((s, f) => s[0] - f[0]).map(([, s]) => ({ value: s, label: s }))
  ];
  return { roots: B, getChildren: j, getFlat: de, levelOptions: ee };
}
function pt({
  baseUrl: l = "/api/areas",
  multiSelect: i = !0,
  locale: p,
  headers: g,
  fetchRoots: v,
  loadChildren: C,
  fetchFlat: x,
  levelOptions: $,
  initialSelectedIds: B = [],
  initialSelectedItems: j = [],
  onReady: W,
  onChange: R,
  loadingComponent: X,
  strings: de
}) {
  const ee = L(
    (e) => {
      if (i)
        return new Set(e.map(String));
      const r = e.length > 0 ? e[e.length - 1] : void 0;
      return r == null ? /* @__PURE__ */ new Set() : /* @__PURE__ */ new Set([String(r)]);
    },
    [i]
  ), s = { ...st, ...de }, f = $e(
    () => ({
      selectAll: s.selectAll,
      deselectAll: s.deselectAll
    }),
    [s.selectAll, s.deselectAll]
  ), [N, h] = T([]), [S, E] = T(null), [I, Ke] = T(""), [q, Ae] = T(""), [Pe, K] = T(!0), [we, Y] = T(!1), [Ne, ke] = T([]), Ve = $ && $.length > 0 ? $ : Ne.length > 0 ? Ne : nt, [P, Z] = T(() => {
    const e = B.length > 0 ? B : j.map((r) => r.id);
    return ee(e);
  }), Q = F(null), ue = F(null), b = F(/* @__PURE__ */ new Map()), A = F(/* @__PURE__ */ new Map()), m = F(/* @__PURE__ */ new Map()), Le = F(/* @__PURE__ */ new Set());
  Le.current = P;
  const [M, se] = T(!1), [te, Se] = T([]), J = F([]);
  J.current = te;
  const [He, U] = T(!1), V = F(null), G = !!(l && !v && !C && !x), z = I === "" && !q.trim(), Ee = L(async () => {
    if (v) {
      K(!0);
      try {
        const r = await v();
        h(r), r.forEach((c) => {
          b.current.set(c.id, c.label), c.type && A.current.set(c.id, c.type), "nid" in c && typeof c.nid == "number" && m.current.set(c.id, c.nid);
        });
      } catch {
        h([]);
      } finally {
        K(!1);
      }
      return;
    }
    if (G) {
      const r = l.replace(/\/$/, ""), c = Be(p), o = `${r}|${c}`, n = Oe.get(o);
      if (n !== void 0) {
        V.current = n, ke(n.levelOptions), h(n.roots), n.roots.forEach((t) => {
          b.current.set(t.id, t.label), t.type && A.current.set(t.id, t.type), "nid" in t && typeof t.nid == "number" && m.current.set(t.id, t.nid);
        }), K(!1);
        return;
      }
      K(!0);
      try {
        const t = ne(p, g), a = await fetch(`${r}${tt}`, { headers: t }), d = await fetch(`${r}${rt}`, { headers: ne(p, g) }), y = await a.json(), k = await d.json(), ie = Array.isArray(y) ? y : y != null && y.success && Array.isArray(y.data) ? y.data : [], Je = Array.isArray(k) ? k : k != null && k.success && Array.isArray(k.data) ? k.data : [], Ue = ie.map(at), Ie = /* @__PURE__ */ new Map();
        for (const w of Je) {
          const Me = "al_level" in w ? w.al_level : w.level, ze = "al_name" in w ? w.al_name : w.name;
          Me != null && ze != null && Ie.set(Number(Me), String(ze));
        }
        const re = lt(Ue, Ie);
        Oe.set(o, re), V.current = re, ke(re.levelOptions), h(re.roots), re.roots.forEach((w) => {
          b.current.set(w.id, w.label), w.type && A.current.set(w.id, w.type), "nid" in w && typeof w.nid == "number" && m.current.set(w.id, w.nid);
        });
      } catch {
        h([]);
      } finally {
        K(!1);
      }
      return;
    }
    const e = De.get(l);
    if (e !== void 0) {
      h(e), e.forEach((r) => {
        b.current.set(r.id, r.label), r.type && A.current.set(r.id, r.type), "nid" in r && typeof r.nid == "number" && m.current.set(r.id, r.nid);
      }), K(!1);
      return;
    }
    K(!0);
    try {
      const r = be(l, { parent: "root" }), o = await (await fetch(r, { headers: ne(p, g) })).json(), n = Array.isArray(o) ? o.map(ve) : [];
      De.set(l, n), h(n), o.forEach((t) => {
        typeof (t == null ? void 0 : t.id) == "string" && (b.current.set(t.id, t.label ?? t.id), t.type && A.current.set(t.id, t.type), typeof t.nid == "number" && m.current.set(t.id, t.nid));
      });
    } catch {
      h([]);
    } finally {
      K(!1);
    }
  }, [l, p, g, v, G]);
  O(() => {
    Ee();
  }, [Ee]);
  const qe = L(
    async (e) => {
      if (C) {
        const t = await C(e);
        return t.forEach((a) => {
          b.current.set(a.id, a.label), a.type && A.current.set(a.id, a.type), "nid" in a && typeof a.nid == "number" && m.current.set(a.id, a.nid);
        }), t;
      }
      if (G && V.current) {
        const t = V.current.getChildren(e);
        return t.forEach((a) => {
          b.current.set(a.id, a.label), a.type && A.current.set(a.id, a.type), "nid" in a && typeof a.nid == "number" && m.current.set(a.id, a.nid);
        }), t;
      }
      const r = be(l, { parent: e }), o = await (await fetch(r, { headers: ne(p, g) })).json(), n = Array.isArray(o) ? o.map(ve) : [];
      return o.forEach((t) => {
        typeof (t == null ? void 0 : t.id) == "string" && (b.current.set(t.id, t.label ?? t.id), t.type && A.current.set(t.id, t.type), typeof t.nid == "number" && m.current.set(t.id, t.nid));
      }), n;
    },
    [l, p, g, C, G]
  ), Ce = L(async () => {
    if (x) {
      Y(!0);
      try {
        const e = await x({
          level: I || void 0,
          search: q.trim() || void 0
        });
        E(e), e.forEach((r) => {
          b.current.set(r.id, r.label), r.type && A.current.set(r.id, r.type), "nid" in r && typeof r.nid == "number" && m.current.set(r.id, r.nid);
        });
      } catch {
        E([]);
      } finally {
        Y(!1);
      }
      return;
    }
    if (G && V.current) {
      Y(!0);
      try {
        const e = V.current.getFlat(
          I || void 0,
          q.trim() || void 0
        );
        E(e), e.forEach((r) => {
          b.current.set(r.id, r.label), r.type && A.current.set(r.id, r.type), "nid" in r && typeof r.nid == "number" && m.current.set(r.id, r.nid);
        });
      } catch {
        E([]);
      } finally {
        Y(!1);
      }
      return;
    }
    Y(!0);
    try {
      const e = be(l, {
        parent: "root",
        level: I || void 0,
        search: q.trim() || void 0
      }), c = await (await fetch(e, { headers: ne(p, g) })).json(), o = Array.isArray(c) ? c.map(ve) : [];
      E(o), c.forEach((n) => {
        typeof (n == null ? void 0 : n.id) == "string" && (b.current.set(n.id, n.label ?? n.id), n.type && A.current.set(n.id, n.type), typeof n.nid == "number" && m.current.set(n.id, n.nid));
      });
    } catch {
      E([]);
    } finally {
      Y(!1);
    }
  }, [l, p, g, I, q, x, G]);
  O(() => {
    z ? E(null) : Ce();
  }, [z, Ce]);
  const fe = z ? N : S ?? [], Qe = F(fe);
  Qe.current = fe;
  const pe = z && G && V.current ? V.current.getFlat() : fe, ae = F(pe);
  ae.current = pe;
  const Re = `${z}:${pe.length}`, Ge = B.length > 0 ? B.map(String).sort().join(",") : j.map((e) => String(e.id)).sort().join(",");
  O(() => {
    const e = ae.current, r = B.length > 0 ? B.map(String) : j.map((n) => String(n.id));
    if (e.length === 0) {
      j.forEach((n) => {
        b.current.set(String(n.id), n.label), n.type && A.current.set(String(n.id), n.type);
      }), r.length > 0 && Z((n) => {
        const t = new Set(r);
        return n.size !== t.size || [...n].some((a) => !t.has(a)) ? t : n;
      });
      return;
    }
    const c = (n) => String(n).trim().toLowerCase(), o = r.map((n) => {
      const t = j.find((d) => String(d.id) === n);
      let a = e.find((d) => String(d.id) === n);
      if (!a && (t == null ? void 0 : t.label) != null) {
        const d = t.label.trim().toLowerCase();
        a = e.find(
          (y) => {
            var k;
            return ((k = y.label) == null ? void 0 : k.trim().toLowerCase()) === d;
          }
        );
      }
      if (!a && t) {
        const d = c(n);
        a = e.find((y) => c(String(y.id)) === d);
      }
      return a ? String(a.id) : n;
    });
    o.length > 0 && Z((n) => {
      const t = new Set(o);
      return n.size !== t.size || [...n].some((a) => !t.has(a)) ? t : n;
    }), o.forEach((n) => {
      const t = e.find((y) => String(y.id) === n), a = j.find((y) => String(y.id) === n), d = t ?? a;
      d && (b.current.set(n, d.label), d.type && A.current.set(n, d.type), "nid" in d && typeof d.nid == "number" ? m.current.set(n, d.nid) : (a == null ? void 0 : a.nid) != null && m.current.set(n, a.nid));
    }), j.forEach((n) => {
      b.current.set(String(n.id), n.label), n.type && A.current.set(String(n.id), n.type), n.nid != null && m.current.set(String(n.id), n.nid);
    });
  }, [Ge]), O(() => {
    ae.current.forEach((r) => {
      if (typeof (r == null ? void 0 : r.id) == "string") {
        const c = r;
        b.current.set(r.id, c.label ?? r.id), c.type && A.current.set(r.id, c.type), typeof c.nid == "number" && m.current.set(r.id, c.nid);
      }
    });
  }, [Re]), O(() => {
    const e = ae.current, r = Le.current;
    if (e.length === 0) return;
    const c = (t) => String(t).trim().toLowerCase(), o = Array.from(r).map((t) => {
      var d;
      let a = e.find((y) => String(y.id) === t);
      if (!a) {
        const y = (d = b.current.get(t)) == null ? void 0 : d.trim().toLowerCase();
        y && (a = e.find((k) => {
          var ie;
          return ((ie = k.label) == null ? void 0 : ie.trim().toLowerCase()) === y;
        }));
      }
      if (!a) {
        const y = c(t);
        a = e.find((k) => c(String(k.id)) === y);
      }
      return a ? String(a.id) : t;
    }), n = new Set(o);
    Z((t) => t.size !== n.size || [...t].some((a) => !n.has(a)) ? n : t), o.forEach((t) => {
      const a = e.find((d) => String(d.id) === t);
      if (a) {
        const d = a;
        b.current.set(t, d.label ?? t), d.type && A.current.set(t, d.type), typeof d.nid == "number" && m.current.set(t, d.nid);
      }
    });
  }, [Re]);
  const le = L(() => M ? J.current.map((e) => ({
    id: e.id,
    label: e.label ?? b.current.get(e.id) ?? e.id,
    type: e.type ?? A.current.get(e.id),
    ...e.nid != null ? { nid: e.nid } : m.current.has(e.id) ? { nid: m.current.get(e.id) } : {}
  })) : Array.from(P).map((e) => ({
    id: e,
    label: b.current.get(e) ?? e,
    type: A.current.get(e),
    ...m.current.has(e) ? { nid: m.current.get(e) } : {}
  })), [P, M]), _e = L(() => {
    var e;
    Z(/* @__PURE__ */ new Set()), (e = Q.current) == null || e.clearData(), R == null || R([]);
  }, [R]), Te = L(
    (e) => {
      Z(ee(e));
    },
    [ee]
  ), ce = L(
    (e) => {
      const r = i ? e : e.slice(-1);
      Z(new Set(r.map((o) => o.id)));
      const c = r.map((o) => ({
        id: o.id,
        label: o.label,
        type: o.type,
        ...m.current.has(o.id) ? { nid: m.current.get(o.id) } : {}
      }));
      R == null || R(c);
    },
    [i, R]
  ), me = L(() => {
    var e;
    (e = Q.current) == null || e.expandAll();
  }, []), ye = L(() => {
    var e;
    (e = Q.current) == null || e.collapseAll();
  }, []), he = L(() => {
    var e;
    (e = Q.current) == null || e.selectAll();
  }, []), ge = L(() => {
    var e;
    (e = Q.current) == null || e.deselectAll();
  }, []), We = L(() => {
    const r = J.current.map((c) => ({
      id: c.id,
      label: c.label,
      type: c.type
    }));
    ce(r), se(!1), U(!1);
  }, [ce]), Fe = L(() => {
    const e = le();
    J.current = e, Se(e), se(!0);
  }, [le]);
  O(() => {
    M ? (U(!1), requestAnimationFrame(() => U(!0))) : U(!1);
  }, [M]), O(() => {
    P.size === 0 && M && (se(!1), U(!1));
  }, [P.size, M]), O(() => {
    !i && M && (se(!1), U(!1));
  }, [i, M]);
  const H = F({
    getSelected: le,
    clear: _e,
    setSelectedIds: Te,
    expandAll: me,
    collapseAll: ye,
    selectAll: he,
    deselectAll: ge
  });
  H.current.getSelected = le, H.current.clear = _e, H.current.setSelectedIds = Te, H.current.expandAll = me, H.current.collapseAll = ye, H.current.selectAll = he, H.current.deselectAll = ge, O(() => {
    W == null || W(H.current);
  }, [W]);
  const xe = $e(() => Array.from(P), [P]), D = M ? te.length : P.size, Xe = D === 0 ? /* @__PURE__ */ u(oe, { children: s.summaryNone }) : /* @__PURE__ */ _(oe, { children: [
    /* @__PURE__ */ u("span", { className: "dtk-ar-count", children: D }),
    " ",
    D === 1 ? "area" : "areas",
    " selected"
  ] }), Ye = z ? N.length > 0 : !1, Ze = !z && (we ? !1 : ((S == null ? void 0 : S.length) ?? 0) >= 0);
  return /* @__PURE__ */ u("div", { className: "dtk-ar-root", children: /* @__PURE__ */ _("div", { className: "dtk-ar-stack", children: [
    /* @__PURE__ */ _("div", { className: "dtk-ar-controls", children: [
      /* @__PURE__ */ u("label", { className: "dtk-ar-label", children: s.filterByLevel }),
      /* @__PURE__ */ _("div", { className: "dtk-ar-select-wrap", children: [
        /* @__PURE__ */ u(
          "select",
          {
            ref: ue,
            className: "dtk-ar-select",
            value: I,
            onChange: (e) => Ke(e.target.value),
            "aria-label": s.filterByLevel,
            children: Ve.map((e) => /* @__PURE__ */ u("option", { value: e.value, children: e.label }, e.value || "all"))
          }
        ),
        /* @__PURE__ */ u(
          "span",
          {
            className: "dtk-ar-select-arrow-overlay",
            "aria-hidden": !0,
            onClick: () => {
              var e;
              return (e = ue.current) == null ? void 0 : e.click();
            },
            onKeyDown: (e) => {
              var r;
              (e.key === "Enter" || e.key === " ") && (e.preventDefault(), (r = ue.current) == null || r.click());
            }
          }
        )
      ] }),
      /* @__PURE__ */ _("div", { className: "dtk-ar-search-wrap", children: [
        /* @__PURE__ */ u("span", { className: "dtk-ar-search-icon", "aria-hidden": !0 }),
        /* @__PURE__ */ u(
          "input",
          {
            type: "text",
            className: "dtk-ar-search",
            placeholder: s.searchPlaceholder,
            value: q,
            onChange: (e) => Ae(e.target.value),
            "aria-label": s.searchPlaceholder
          }
        ),
        q.trim() ? /* @__PURE__ */ u(
          "button",
          {
            type: "button",
            className: "dtk-ar-search-clear",
            onClick: () => Ae(""),
            "aria-label": "Clear search",
            title: "Clear",
            children: "×"
          }
        ) : null
      ] })
    ] }),
    /* @__PURE__ */ _("div", { className: "dtk-ar-content", children: [
      /* @__PURE__ */ _("div", { className: "dtk-ar-actions", children: [
        z && /* @__PURE__ */ _(oe, { children: [
          /* @__PURE__ */ u("button", { type: "button", className: "dtk-ar-action-link", onClick: me, children: s.expandAll }),
          /* @__PURE__ */ u("button", { type: "button", className: "dtk-ar-action-link", onClick: ye, children: s.collapseAll })
        ] }),
        i ? /* @__PURE__ */ _(oe, { children: [
          /* @__PURE__ */ u("button", { type: "button", className: "dtk-ar-action-link", onClick: he, children: s.selectAll }),
          /* @__PURE__ */ u("button", { type: "button", className: "dtk-ar-action-link", onClick: ge, children: s.deselectAll })
        ] }) : null
      ] }),
      /* @__PURE__ */ u("div", { className: "dtk-ar-tree-wrap", children: Pe && z ? X ? /* @__PURE__ */ u("div", { className: "dtk-ar-loading-slot", children: X }) : /* @__PURE__ */ u("div", { className: "dtk-ar-empty dtk-ar-loading", children: s.loadingLabel }) : Ye ? /* @__PURE__ */ u(
        je,
        {
          ref: Q,
          roots: N,
          loadChildren: qe,
          multiSelect: i,
          selectedIds: xe,
          onSelectionChange: ce,
          childActionLabels: i ? f : void 0,
          showIdAfterLabel: !0
        }
      ) : Ze ? /* @__PURE__ */ u(
        je,
        {
          ref: Q,
          roots: [],
          flatItems: S ?? [],
          multiSelect: i,
          selectedIds: xe,
          onSelectionChange: ce,
          showIdAfterLabel: !0
        }
      ) : !z && we ? X ? /* @__PURE__ */ u("div", { className: "dtk-ar-loading-slot", children: X }) : /* @__PURE__ */ u("div", { className: "dtk-ar-empty dtk-ar-loading", children: s.loadingLabel }) : /* @__PURE__ */ u("div", { className: "dtk-ar-empty", children: s.emptyLabel }) }),
      /* @__PURE__ */ u(
        "div",
        {
          className: `dtk-ar-summary${i && D > 0 ? " dtk-ar-summary-clickable" : ""}`,
          onClick: i && D > 0 ? Fe : void 0,
          role: i && D > 0 ? "button" : void 0,
          tabIndex: i && D > 0 ? 0 : void 0,
          "aria-label": i && D > 0 ? s.summarySelectedPanelTitle : void 0,
          onKeyDown: i && D > 0 ? (e) => {
            (e.key === "Enter" || e.key === " ") && (e.preventDefault(), Fe());
          } : void 0,
          children: Xe
        }
      )
    ] }),
    i && M && /* @__PURE__ */ _(
      "div",
      {
        className: `dtk-ar-selected-panel ${He ? "dtk-ar-selected-panel-is-open" : ""}`,
        role: "dialog",
        "aria-label": s.summarySelectedPanelTitle,
        children: [
          /* @__PURE__ */ _("div", { className: "dtk-ar-selected-panel-header", children: [
            /* @__PURE__ */ u("span", { className: "dtk-ar-selected-panel-title", children: s.summarySelectedPanelTitle }),
            /* @__PURE__ */ u(
              "button",
              {
                type: "button",
                className: "dtk-ar-selected-panel-close",
                onClick: We,
                "aria-label": s.close,
                title: s.close,
                children: "×"
              }
            )
          ] }),
          /* @__PURE__ */ u("div", { className: "dtk-ar-selected-panel-list", children: te.length === 0 ? /* @__PURE__ */ u("div", { className: "dtk-ar-empty", children: s.summaryNone }) : /* @__PURE__ */ u(
            et,
            {
              items: te,
              multiSelect: i,
              selectedIds: te.map((e) => e.id),
              onSelectionChange: (e) => {
                const r = new Set(e.map((o) => String(o.id))), c = J.current.filter((o) => r.has(String(o.id)));
                J.current = c, Se(c);
              }
            }
          ) })
        ]
      }
    )
  ] }) });
}
export {
  pt as AreaSelect
};
//# sourceMappingURL=dfa-v6-comp-area.js.map
