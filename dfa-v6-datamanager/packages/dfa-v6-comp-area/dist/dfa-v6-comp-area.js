import "dfa-v6-comp-treeview/styles.css";
import "dfa-v6-comp-list-view/styles.css";
import { jsx as p, jsxs as I, Fragment as be } from "react/jsx-runtime";
import { useState as C, useMemo as ve, useCallback as E, useRef as F, useEffect as V } from "react";
import { TreeView as We } from "dfa-v6-comp-treeview";
import { ListView as ot } from "dfa-v6-comp-list-view";
const dt = "/areas", Xe = "/area-levels", ut = [
  { value: "", label: "All Levels (Tree View)" }
];
function Pe(c) {
  return c ?? (typeof navigator < "u" ? navigator.language : "en");
}
function ie(c, d) {
  const y = Pe(c);
  return d ? { ...d, "Accept-Language": y } : { "Accept-Language": y };
}
const ft = {
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
function Ce(c, d) {
  var _;
  const y = c.replace(/\/$/, ""), b = typeof window < "u" ? window.location.origin : "http://localhost", L = new URL(y, b);
  return L.searchParams.set("parent", d.parent ?? "root"), d.level && L.searchParams.set("level", d.level), (_ = d.search) != null && _.trim() && L.searchParams.set("search", d.search.trim()), L.pathname + L.search;
}
function Re(c) {
  return {
    id: c.id,
    label: c.label,
    type: c.type,
    hasChildren: c.hasChildren,
    path: c.path
  };
}
const Ye = /* @__PURE__ */ new Map(), Ze = /* @__PURE__ */ new Map();
function mt(c) {
  const d = Number(c.ar_nid ?? c.a_nid ?? 0) || 0, y = c.ar_parent_nid ?? c.a_parent_nid, b = typeof y == "number" && !Number.isNaN(y) ? y : Number(y), L = y == null || typeof b == "number" && (Number.isNaN(b) || b === 0 || b === d) ? null : b, _ = c.ar_id ?? c.a_id ?? String(d), M = (c.ar_name ?? c.a_name) || _, $ = Number(c.ar_level ?? c.a_level ?? 0) || 0;
  return { nid: d, parentNid: L, id: _, name: M, level: $ };
}
function pt(c, d) {
  const y = new Map(c.map((l) => [l.nid, l])), b = new Map(c.map((l) => [l.id, l])), L = /* @__PURE__ */ new Map();
  for (const l of c) {
    const f = l.parentNid ?? 0;
    L.has(f) || L.set(f, []), L.get(f).push(l);
  }
  const _ = (l) => {
    var f;
    return (((f = L.get(l)) == null ? void 0 : f.length) ?? 0) > 0;
  }, M = (l) => ({
    id: l.id,
    label: l.name,
    type: d.get(l.level) ?? "Unknown",
    hasChildren: _(l.nid),
    nid: l.nid
  });
  let $ = c.filter((l) => l.parentNid == null);
  if ($.length === 0 && c.length > 0) {
    const l = Math.min(...c.map((f) => f.level));
    $ = c.filter((f) => f.level === l);
  }
  const T = $.map((l) => M(l)), te = (l) => {
    const f = b.get(l) ?? y.get(Number(l));
    return f ? (L.get(f.nid) ?? []).map((A) => M(A)) : [];
  }, q = "→", x = /* @__PURE__ */ new Map();
  function re(l) {
    const f = x.get(l);
    if (f !== void 0) return f;
    const k = b.get(l);
    if (!k) return l;
    const A = [k.name];
    let R = k.parentNid;
    for (; R != null && R !== 0; ) {
      const oe = y.get(R);
      if (!oe || (A.unshift(oe.name), R = oe.parentNid ?? 0, R === 0)) break;
    }
    const m = A.join(` ${q} `);
    return x.set(l, m), m;
  }
  const z = (l, f) => {
    let k = c.map((A) => ({ ...M(A), path: re(A.id) }));
    if (l && (k = k.filter((A) => A.type === l)), f != null && f.trim()) {
      const A = f.trim().toLowerCase();
      k = k.filter((R) => {
        var m;
        return (m = R.label) == null ? void 0 : m.toLowerCase().includes(A);
      });
    }
    return k;
  }, ne = [
    { value: "", label: "All Levels (Tree View)" },
    ...Array.from(d.entries()).sort((l, f) => l[0] - f[0]).map(([, l]) => ({ value: l, label: l }))
  ], me = /* @__PURE__ */ new Map();
  for (const l of c) me.set(l.id, l.level);
  return { roots: T, getChildren: te, getFlat: z, levelOptions: ne, idToLevel: me };
}
function wt({
  baseUrl: c = "/api/areas",
  multiSelect: d = !0,
  locale: y,
  headers: b,
  preloadedData: L,
  fetchRoots: _,
  loadChildren: M,
  fetchFlat: $,
  levelOptions: T,
  allowSelectionAtLevel: te,
  initialSelectedIds: q = [],
  initialSelectedItems: x = [],
  onReady: re,
  onChange: z,
  loadingComponent: ne,
  strings: me
}) {
  const l = Array.isArray(L) && L.length > 0, [f, k] = C([]), A = ve(() => {
    var h;
    if (!l) return null;
    const e = L, t = T && T.length > 0 ? T : f, a = ((h = t.find((i) => String(i.value).trim() === "")) == null ? void 0 : h.label) ?? "All Levels (Tree View)", o = /* @__PURE__ */ new Map();
    for (const i of t) {
      const S = Number(i.value);
      !Number.isInteger(S) || S <= 0 || o.set(S, i.label);
    }
    const n = /* @__PURE__ */ new Set();
    for (const i of e)
      i.ar_level > 0 && n.add(i.ar_level);
    const r = [
      { value: "", label: a },
      ...Array.from(n).sort((i, S) => i - S).map((i) => ({
        value: String(i),
        label: o.get(i) ?? `Level ${i}`
      }))
    ], s = e.map((i) => ({
      id: i.ar_id,
      label: i.ar_name,
      type: o.get(i.ar_level) ?? `Level ${i.ar_level}`,
      hasChildren: !1,
      nid: i.ar_nid,
      level: i.ar_level
    }));
    return { allItems: s, levelOptions: r, getFlat: (i, S) => {
      let ee = s;
      if (i && (ee = ee.filter((ce) => String(ce.level) === i)), S != null && S.trim()) {
        const ce = S.trim().toLowerCase();
        ee = ee.filter((fe) => {
          var H, N;
          return ((H = fe.label) == null ? void 0 : H.toLowerCase().includes(ce)) || ((N = fe.id) == null ? void 0 : N.toLowerCase().includes(ce));
        });
      }
      return ee;
    } };
  }, [l, L, T, f]), R = E(
    (e) => {
      if (d)
        return new Set(e.map(String));
      const t = e.length > 0 ? e[e.length - 1] : void 0;
      return t == null ? /* @__PURE__ */ new Set() : /* @__PURE__ */ new Set([String(t)]);
    },
    [d]
  ), m = { ...ft, ...me }, oe = ve(
    () => ({
      selectAll: m.selectAll,
      deselectAll: m.deselectAll
    }),
    [m.selectAll, m.deselectAll]
  ), [Ae, B] = C([]), [de, Q] = C(null), [Z, Ue] = C(""), [G, Ie] = C(""), [Je, O] = C(!0), [Fe, P] = C(!1), et = T && T.length > 0 ? T : l && A ? A.levelOptions : f.length > 0 ? f : ut, [W, se] = C(() => {
    const e = q.length > 0 ? q : x.map((t) => t.id);
    return R(e);
  }), U = F(null), we = F(null), v = F(/* @__PURE__ */ new Map()), w = F(/* @__PURE__ */ new Map()), g = F(/* @__PURE__ */ new Map()), Me = F(/* @__PURE__ */ new Set());
  Me.current = W;
  const [j, pe] = C(!1), [ue, $e] = C([]), ae = F([]);
  ae.current = ue;
  const [tt, le] = C(!1), X = F(null), [Ne, xe] = C(/* @__PURE__ */ new Map()), ze = typeof te == "number" && te > 0, je = ve(() => {
    if (!ze || Ne.size === 0) return;
    const e = [];
    for (const [t, a] of Ne)
      a !== te && e.push(t);
    return e.length > 0 ? e : void 0;
  }, [ze, te, Ne]), J = !!(c && !_ && !M && !$ && !l), D = l ? !1 : Z === "" && !G.trim();
  V(() => {
    if (!l || T && T.length > 0 || !c) return;
    let e = !1;
    const t = c.replace(/\/$/, "");
    return fetch(`${t}${Xe}`, {
      headers: ie(y, b)
    }).then((a) => a.json()).then((a) => {
      if (e) return;
      const o = Array.isArray(a) ? a : a && typeof a == "object" && "success" in a && a.success && "data" in a && Array.isArray(a.data) ? a.data : [], n = [
        { value: "", label: "All Levels (Tree View)" },
        ...o.map((r) => {
          const s = Number(r.al_level), u = String(r.al_name ?? "").trim();
          return !Number.isInteger(s) || s <= 0 || !u ? null : { value: String(s), label: u };
        }).filter((r) => r != null).sort((r, s) => Number(r.value) - Number(s.value))
      ];
      k(n);
    }).catch(() => {
      e || k([]);
    }), () => {
      e = !0;
    };
  }, [l, T, c, y, b]);
  const De = E(async () => {
    if (l && A) {
      A.allItems.forEach((t) => {
        v.current.set(t.id, t.label), t.type && w.current.set(t.id, t.type), typeof t.nid == "number" && g.current.set(t.id, t.nid);
      }), B([]), O(!1);
      return;
    }
    if (_) {
      O(!0);
      try {
        const t = await _();
        B(t), t.forEach((a) => {
          v.current.set(a.id, a.label), a.type && w.current.set(a.id, a.type), "nid" in a && typeof a.nid == "number" && g.current.set(a.id, a.nid);
        });
      } catch {
        B([]);
      } finally {
        O(!1);
      }
      return;
    }
    if (J) {
      const t = c.replace(/\/$/, ""), a = Pe(y), o = `${t}|${a}`, n = Ze.get(o);
      if (n !== void 0) {
        X.current = n, k(n.levelOptions), xe(n.idToLevel), B(n.roots), n.roots.forEach((r) => {
          v.current.set(r.id, r.label), r.type && w.current.set(r.id, r.type), "nid" in r && typeof r.nid == "number" && g.current.set(r.id, r.nid);
        }), O(!1);
        return;
      }
      O(!0);
      try {
        const r = ie(y, b), s = await fetch(`${t}${dt}`, { headers: r }), u = await fetch(`${t}${Xe}`, { headers: ie(y, b) }), h = await s.json(), i = await u.json(), S = Array.isArray(h) ? h : h != null && h.success && Array.isArray(h.data) ? h.data : [], ee = Array.isArray(i) ? i : i != null && i.success && Array.isArray(i.data) ? i.data : [], ce = S.map(mt), fe = /* @__PURE__ */ new Map();
        for (const N of ee) {
          const Qe = "al_level" in N ? N.al_level : N.level, Ge = "al_name" in N ? N.al_name : N.name;
          Qe != null && Ge != null && fe.set(Number(Qe), String(Ge));
        }
        const H = pt(ce, fe);
        Ze.set(o, H), X.current = H, k(H.levelOptions), xe(H.idToLevel), B(H.roots), H.roots.forEach((N) => {
          v.current.set(N.id, N.label), N.type && w.current.set(N.id, N.type), "nid" in N && typeof N.nid == "number" && g.current.set(N.id, N.nid);
        });
      } catch {
        B([]);
      } finally {
        O(!1);
      }
      return;
    }
    const e = Ye.get(c);
    if (e !== void 0) {
      B(e), e.forEach((t) => {
        v.current.set(t.id, t.label), t.type && w.current.set(t.id, t.type), "nid" in t && typeof t.nid == "number" && g.current.set(t.id, t.nid);
      }), O(!1);
      return;
    }
    O(!0);
    try {
      const t = Ce(c, { parent: "root" }), o = await (await fetch(t, { headers: ie(y, b) })).json(), n = Array.isArray(o) ? o.map(Re) : [];
      Ye.set(c, n), B(n), o.forEach((r) => {
        typeof (r == null ? void 0 : r.id) == "string" && (v.current.set(r.id, r.label ?? r.id), r.type && w.current.set(r.id, r.type), typeof r.nid == "number" && g.current.set(r.id, r.nid));
      });
    } catch {
      B([]);
    } finally {
      O(!1);
    }
  }, [c, y, b, _, J, l, A]);
  V(() => {
    De();
  }, [De]);
  const rt = E(
    async (e) => {
      if (M) {
        const r = await M(e);
        return r.forEach((s) => {
          v.current.set(s.id, s.label), s.type && w.current.set(s.id, s.type), "nid" in s && typeof s.nid == "number" && g.current.set(s.id, s.nid);
        }), r;
      }
      if (J && X.current) {
        const r = X.current.getChildren(e);
        return r.forEach((s) => {
          v.current.set(s.id, s.label), s.type && w.current.set(s.id, s.type), "nid" in s && typeof s.nid == "number" && g.current.set(s.id, s.nid);
        }), r;
      }
      const t = Ce(c, { parent: e }), o = await (await fetch(t, { headers: ie(y, b) })).json(), n = Array.isArray(o) ? o.map(Re) : [];
      return o.forEach((r) => {
        typeof (r == null ? void 0 : r.id) == "string" && (v.current.set(r.id, r.label ?? r.id), r.type && w.current.set(r.id, r.type), typeof r.nid == "number" && g.current.set(r.id, r.nid));
      }), n;
    },
    [c, y, b, M, J]
  ), Ve = E(async () => {
    if (l && A) {
      const e = A.getFlat(Z || void 0, G.trim() || void 0);
      Q(e), e.forEach((t) => {
        v.current.set(t.id, t.label), t.type && w.current.set(t.id, t.type), "nid" in t && typeof t.nid == "number" && g.current.set(t.id, t.nid);
      }), P(!1);
      return;
    }
    if ($) {
      P(!0);
      try {
        const e = await $({
          level: Z || void 0,
          search: G.trim() || void 0
        });
        Q(e), e.forEach((t) => {
          v.current.set(t.id, t.label), t.type && w.current.set(t.id, t.type), "nid" in t && typeof t.nid == "number" && g.current.set(t.id, t.nid);
        });
      } catch {
        Q([]);
      } finally {
        P(!1);
      }
      return;
    }
    if (J && X.current) {
      P(!0);
      try {
        const e = X.current.getFlat(
          Z || void 0,
          G.trim() || void 0
        );
        Q(e), e.forEach((t) => {
          v.current.set(t.id, t.label), t.type && w.current.set(t.id, t.type), "nid" in t && typeof t.nid == "number" && g.current.set(t.id, t.nid);
        });
      } catch {
        Q([]);
      } finally {
        P(!1);
      }
      return;
    }
    P(!0);
    try {
      const e = Ce(c, {
        parent: "root",
        level: Z || void 0,
        search: G.trim() || void 0
      }), a = await (await fetch(e, { headers: ie(y, b) })).json(), o = Array.isArray(a) ? a.map(Re) : [];
      Q(o), a.forEach((n) => {
        typeof (n == null ? void 0 : n.id) == "string" && (v.current.set(n.id, n.label ?? n.id), n.type && w.current.set(n.id, n.type), typeof n.nid == "number" && g.current.set(n.id, n.nid));
      });
    } catch {
      Q([]);
    } finally {
      P(!1);
    }
  }, [c, y, b, Z, G, $, J, l, A]);
  V(() => {
    D ? Q(null) : Ve();
  }, [D, Ve]);
  const Le = D ? Ae : de ?? [], nt = F(Le);
  nt.current = Le;
  const ke = D && J && X.current ? X.current.getFlat() : Le, ye = F(ke);
  ye.current = ke;
  const Be = `${D}:${ke.length}`, st = q.length > 0 ? q.map(String).sort().join(",") : x.map((e) => String(e.id)).sort().join(",");
  V(() => {
    const e = ye.current, t = q.length > 0 ? q.map(String) : x.map((n) => String(n.id));
    if (e.length === 0) {
      x.forEach((n) => {
        v.current.set(String(n.id), n.label), n.type && w.current.set(String(n.id), n.type);
      }), t.length > 0 && se((n) => {
        const r = new Set(t);
        return n.size !== r.size || [...n].some((s) => !r.has(s)) ? r : n;
      });
      return;
    }
    const a = (n) => String(n).trim().toLowerCase(), o = t.map((n) => {
      const r = x.find((u) => String(u.id) === n);
      let s = e.find((u) => String(u.id) === n);
      if (!s && (r == null ? void 0 : r.label) != null) {
        const u = r.label.trim().toLowerCase();
        s = e.find(
          (h) => {
            var i;
            return ((i = h.label) == null ? void 0 : i.trim().toLowerCase()) === u;
          }
        );
      }
      if (!s && r) {
        const u = a(n);
        s = e.find((h) => a(String(h.id)) === u);
      }
      return s ? String(s.id) : n;
    });
    o.length > 0 && se((n) => {
      const r = new Set(o);
      return n.size !== r.size || [...n].some((s) => !r.has(s)) ? r : n;
    }), o.forEach((n) => {
      const r = e.find((h) => String(h.id) === n), s = x.find((h) => String(h.id) === n), u = r ?? s;
      u && (v.current.set(n, u.label), u.type && w.current.set(n, u.type), "nid" in u && typeof u.nid == "number" ? g.current.set(n, u.nid) : (s == null ? void 0 : s.nid) != null && g.current.set(n, s.nid));
    }), x.forEach((n) => {
      v.current.set(String(n.id), n.label), n.type && w.current.set(String(n.id), n.type), n.nid != null && g.current.set(String(n.id), n.nid);
    });
  }, [st]), V(() => {
    ye.current.forEach((t) => {
      if (typeof (t == null ? void 0 : t.id) == "string") {
        const a = t;
        v.current.set(t.id, a.label ?? t.id), a.type && w.current.set(t.id, a.type), typeof a.nid == "number" && g.current.set(t.id, a.nid);
      }
    });
  }, [Be]), V(() => {
    const e = ye.current, t = Me.current;
    if (e.length === 0) return;
    const a = (r) => String(r).trim().toLowerCase(), o = Array.from(t).map((r) => {
      var u;
      let s = e.find((h) => String(h.id) === r);
      if (!s) {
        const h = (u = v.current.get(r)) == null ? void 0 : u.trim().toLowerCase();
        h && (s = e.find((i) => {
          var S;
          return ((S = i.label) == null ? void 0 : S.trim().toLowerCase()) === h;
        }));
      }
      if (!s) {
        const h = a(r);
        s = e.find((i) => a(String(i.id)) === h);
      }
      return s ? String(s.id) : r;
    }), n = new Set(o);
    se((r) => r.size !== n.size || [...r].some((s) => !n.has(s)) ? n : r), o.forEach((r) => {
      const s = e.find((u) => String(u.id) === r);
      if (s) {
        const u = s;
        v.current.set(r, u.label ?? r), u.type && w.current.set(r, u.type), typeof u.nid == "number" && g.current.set(r, u.nid);
      }
    });
  }, [Be]);
  const he = E(() => j ? ae.current.map((e) => ({
    id: e.id,
    label: e.label ?? v.current.get(e.id) ?? e.id,
    type: e.type ?? w.current.get(e.id),
    ...e.nid != null ? { nid: e.nid } : g.current.has(e.id) ? { nid: g.current.get(e.id) } : {}
  })) : Array.from(W).map((e) => ({
    id: e,
    label: v.current.get(e) ?? e,
    type: w.current.get(e),
    ...g.current.has(e) ? { nid: g.current.get(e) } : {}
  })), [W, j]), Oe = E(() => {
    var e;
    se(/* @__PURE__ */ new Set()), (e = U.current) == null || e.clearData(), z == null || z([]);
  }, [z]), Ke = E(
    (e) => {
      se(R(e));
    },
    [R]
  ), ge = E(
    (e) => {
      const t = d ? e : e.slice(-1);
      se(new Set(t.map((o) => o.id)));
      const a = t.map((o) => ({
        id: o.id,
        label: o.label,
        type: o.type,
        ...g.current.has(o.id) ? { nid: g.current.get(o.id) } : {}
      }));
      z == null || z(a);
    },
    [d, z]
  ), Se = E(() => {
    var e;
    (e = U.current) == null || e.expandAll();
  }, []), Ee = E(() => {
    var e;
    (e = U.current) == null || e.collapseAll();
  }, []), _e = E(() => {
    var e;
    (e = U.current) == null || e.selectAll();
  }, []), Te = E(() => {
    var e;
    (e = U.current) == null || e.deselectAll();
  }, []), at = E(() => {
    const t = ae.current.map((a) => ({
      id: a.id,
      label: a.label,
      type: a.type
    }));
    ge(t), pe(!1), le(!1);
  }, [ge]), He = E(() => {
    const e = he();
    ae.current = e, $e(e), pe(!0);
  }, [he]);
  V(() => {
    j ? (le(!1), requestAnimationFrame(() => le(!0))) : le(!1);
  }, [j]), V(() => {
    W.size === 0 && j && (pe(!1), le(!1));
  }, [W.size, j]), V(() => {
    !d && j && (pe(!1), le(!1));
  }, [d, j]);
  const Y = F({
    getSelected: he,
    clear: Oe,
    setSelectedIds: Ke,
    expandAll: Se,
    collapseAll: Ee,
    selectAll: _e,
    deselectAll: Te
  });
  Y.current.getSelected = he, Y.current.clear = Oe, Y.current.setSelectedIds = Ke, Y.current.expandAll = Se, Y.current.collapseAll = Ee, Y.current.selectAll = _e, Y.current.deselectAll = Te, V(() => {
    re == null || re(Y.current);
  }, [re]);
  const qe = ve(() => Array.from(W), [W]), K = j ? ue.length : W.size, lt = K === 0 ? /* @__PURE__ */ p(be, { children: m.summaryNone }) : /* @__PURE__ */ I(be, { children: [
    /* @__PURE__ */ p("span", { className: "dtk-ar-count", children: K }),
    " ",
    K === 1 ? "area" : "areas",
    " selected"
  ] }), ct = D ? Ae.length > 0 : !1, it = !D && (Fe ? !1 : ((de == null ? void 0 : de.length) ?? 0) >= 0);
  return /* @__PURE__ */ p("div", { className: "dtk-ar-root", children: /* @__PURE__ */ I("div", { className: "dtk-ar-stack", children: [
    /* @__PURE__ */ I("div", { className: "dtk-ar-controls", children: [
      /* @__PURE__ */ p("label", { className: "dtk-ar-label", children: m.filterByLevel }),
      /* @__PURE__ */ I("div", { className: "dtk-ar-select-wrap", children: [
        /* @__PURE__ */ p(
          "select",
          {
            ref: we,
            className: "dtk-ar-select",
            value: Z,
            onChange: (e) => Ue(e.target.value),
            "aria-label": m.filterByLevel,
            children: et.map((e) => /* @__PURE__ */ p("option", { value: e.value, children: e.label }, e.value || "all"))
          }
        ),
        /* @__PURE__ */ p(
          "span",
          {
            className: "dtk-ar-select-arrow-overlay",
            "aria-hidden": !0,
            onClick: () => {
              var e;
              return (e = we.current) == null ? void 0 : e.click();
            },
            onKeyDown: (e) => {
              var t;
              (e.key === "Enter" || e.key === " ") && (e.preventDefault(), (t = we.current) == null || t.click());
            }
          }
        )
      ] }),
      /* @__PURE__ */ I("div", { className: "dtk-ar-search-wrap", children: [
        /* @__PURE__ */ p("span", { className: "dtk-ar-search-icon", "aria-hidden": !0 }),
        /* @__PURE__ */ p(
          "input",
          {
            type: "text",
            className: "dtk-ar-search",
            placeholder: m.searchPlaceholder,
            value: G,
            onChange: (e) => Ie(e.target.value),
            "aria-label": m.searchPlaceholder
          }
        ),
        G.trim() ? /* @__PURE__ */ p(
          "button",
          {
            type: "button",
            className: "dtk-ar-search-clear",
            onClick: () => Ie(""),
            "aria-label": "Clear search",
            title: "Clear",
            children: "×"
          }
        ) : null
      ] })
    ] }),
    /* @__PURE__ */ I("div", { className: "dtk-ar-content", children: [
      /* @__PURE__ */ I("div", { className: "dtk-ar-actions", children: [
        D && /* @__PURE__ */ I(be, { children: [
          /* @__PURE__ */ p("button", { type: "button", className: "dtk-ar-action-link", onClick: Se, children: m.expandAll }),
          /* @__PURE__ */ p("button", { type: "button", className: "dtk-ar-action-link", onClick: Ee, children: m.collapseAll })
        ] }),
        d ? /* @__PURE__ */ I(be, { children: [
          /* @__PURE__ */ p("button", { type: "button", className: "dtk-ar-action-link", onClick: _e, children: m.selectAll }),
          /* @__PURE__ */ p("button", { type: "button", className: "dtk-ar-action-link", onClick: Te, children: m.deselectAll })
        ] }) : null
      ] }),
      /* @__PURE__ */ p("div", { className: "dtk-ar-tree-wrap", children: Je && D ? ne ? /* @__PURE__ */ p("div", { className: "dtk-ar-loading-slot", children: ne }) : /* @__PURE__ */ p("div", { className: "dtk-ar-empty dtk-ar-loading", children: m.loadingLabel }) : ct ? /* @__PURE__ */ p(
        We,
        {
          ref: U,
          roots: Ae,
          loadChildren: rt,
          multiSelect: d,
          selectedIds: qe,
          disabledIds: je,
          onSelectionChange: ge,
          childActionLabels: d ? oe : void 0,
          showIdAfterLabel: !0
        }
      ) : it ? /* @__PURE__ */ p(
        We,
        {
          ref: U,
          roots: [],
          flatItems: de ?? [],
          multiSelect: d,
          selectedIds: qe,
          disabledIds: je,
          onSelectionChange: ge,
          showIdAfterLabel: !0
        }
      ) : !D && Fe ? ne ? /* @__PURE__ */ p("div", { className: "dtk-ar-loading-slot", children: ne }) : /* @__PURE__ */ p("div", { className: "dtk-ar-empty dtk-ar-loading", children: m.loadingLabel }) : /* @__PURE__ */ p("div", { className: "dtk-ar-empty", children: m.emptyLabel }) }),
      /* @__PURE__ */ p(
        "div",
        {
          className: `dtk-ar-summary${d && K > 0 ? " dtk-ar-summary-clickable" : ""}`,
          onClick: d && K > 0 ? He : void 0,
          role: d && K > 0 ? "button" : void 0,
          tabIndex: d && K > 0 ? 0 : void 0,
          "aria-label": d && K > 0 ? m.summarySelectedPanelTitle : void 0,
          onKeyDown: d && K > 0 ? (e) => {
            (e.key === "Enter" || e.key === " ") && (e.preventDefault(), He());
          } : void 0,
          children: lt
        }
      )
    ] }),
    d && j && /* @__PURE__ */ I(
      "div",
      {
        className: `dtk-ar-selected-panel ${tt ? "dtk-ar-selected-panel-is-open" : ""}`,
        role: "dialog",
        "aria-label": m.summarySelectedPanelTitle,
        children: [
          /* @__PURE__ */ I("div", { className: "dtk-ar-selected-panel-header", children: [
            /* @__PURE__ */ p("span", { className: "dtk-ar-selected-panel-title", children: m.summarySelectedPanelTitle }),
            /* @__PURE__ */ p(
              "button",
              {
                type: "button",
                className: "dtk-ar-selected-panel-close",
                onClick: at,
                "aria-label": m.close,
                title: m.close,
                children: "×"
              }
            )
          ] }),
          /* @__PURE__ */ p("div", { className: "dtk-ar-selected-panel-list", children: ue.length === 0 ? /* @__PURE__ */ p("div", { className: "dtk-ar-empty", children: m.summaryNone }) : /* @__PURE__ */ p(
            ot,
            {
              items: ue,
              multiSelect: d,
              selectedIds: ue.map((e) => e.id),
              onSelectionChange: (e) => {
                const t = new Set(e.map((o) => String(o.id))), a = ae.current.filter((o) => t.has(String(o.id)));
                ae.current = a, $e(a);
              }
            }
          ) })
        ]
      }
    )
  ] }) });
}
export {
  wt as AreaSelect
};
//# sourceMappingURL=dfa-v6-comp-area.js.map
