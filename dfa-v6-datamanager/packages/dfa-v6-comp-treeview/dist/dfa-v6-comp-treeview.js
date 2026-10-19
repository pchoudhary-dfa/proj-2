import { jsxs as g, Fragment as mt, jsx as d } from "react/jsx-runtime";
import kt, { forwardRef as wt, useMemo as nt, useState as $, useRef as it, useCallback as h, useEffect as W, useImperativeHandle as Nt } from "react";
function j(M) {
  return String(M);
}
function bt(M, p) {
  const v = /* @__PURE__ */ new Set();
  function m(E) {
    for (const b of E) {
      b.hasChildren && p.has(b.id) && v.add(b.id);
      const l = p.get(b.id);
      l != null && l.length && m(l);
    }
  }
  return m(M), v;
}
function ot(M, p, v) {
  const m = [];
  function E(b) {
    for (const l of b)
      if (m.push(l.id), p.has(l.id)) {
        const y = v.get(l.id);
        y != null && y.length && E(y);
      }
  }
  return E(M), m;
}
const yt = { selectAll: "Select All", deselectAll: "Deselect All" }, Et = wt(function({
  roots: p,
  loadChildren: v,
  multiSelect: m = !0,
  selectedIds: E = [],
  disabledIds: b,
  onSelectionChange: l,
  onReady: y,
  flatItems: k,
  childActionLabels: K,
  showIdAfterLabel: z = !1,
  enableCount: U = !1,
  disableCheckbox: L = !1,
  icon: R
}, pt) {
  const f = nt(
    () => new Set((b ?? []).map(j)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(b ?? []).map(j).sort().join(",")]
  ), V = nt(
    () => ({ ...yt, ...K }),
    [K]
  ), [q, x] = $(
    () => new Set(E.map(j))
  ), [D, T] = $(/* @__PURE__ */ new Set()), [n, G] = $(/* @__PURE__ */ new Map()), [J, Q] = $(/* @__PURE__ */ new Set()), w = it(/* @__PURE__ */ new Map()), u = k !== void 0 && k.length >= 0, X = h((t, e) => {
    const a = w.current;
    function s(c) {
      a.set(c.id, c);
    }
    t.forEach(s), e.forEach((c) => c.forEach(s));
  }, []);
  W(() => {
    X(p, n), u && k && k.forEach((t) => w.current.set(t.id, t));
  }, [p, n, u, k, X]);
  const Y = h(() => {
    const t = w.current;
    return Array.from(q).map((e) => t.get(e) ?? { id: e, label: e, type: void 0, hasChildren: !1 });
  }, [q]), Z = h(() => {
    x(/* @__PURE__ */ new Set()), l == null || l([]);
  }, [l]), I = h(async () => {
    if (u || !v) return;
    const t = new Map(n), e = [...p];
    for (; e.length > 0; ) {
      const s = e.shift();
      if (s.hasChildren && !t.has(s.id))
        try {
          const r = await v(s.id);
          t.set(s.id, r);
        } catch {
        }
      const c = t.get(s.id);
      if (c != null && c.length)
        for (const r of c) e.push(r);
    }
    const a = bt(p, t);
    G(t), T(a);
  }, [u, p, n, v]), C = h(() => {
    T(/* @__PURE__ */ new Set());
  }, []), S = h(() => {
    if (u) {
      const t = k ?? [];
      if (t.length === 0) return;
      x((e) => {
        const a = new Set(e);
        t.forEach((r) => {
          f.has(r.id) || a.add(r.id);
        });
        const s = w.current, c = Array.from(a).map(
          (r) => s.get(r) ?? { id: r, label: r, type: void 0, hasChildren: !1 }
        );
        return queueMicrotask(() => l == null ? void 0 : l(c)), a;
      });
      return;
    }
    x((t) => {
      const e = ot(p, D, n), a = new Set(t);
      e.forEach((r) => {
        f.has(r) || a.add(r);
      });
      const s = w.current, c = Array.from(a).map(
        (r) => s.get(r) ?? { id: r, label: r, type: void 0, hasChildren: !1 }
      );
      return queueMicrotask(() => l == null ? void 0 : l(c)), a;
    });
  }, [u, k, p, n, D, l, f]), tt = h(() => {
    if (u) {
      const t = k ?? [];
      if (t.length === 0) return;
      x((e) => {
        const a = new Set(e);
        t.forEach((r) => {
          f.has(r.id) || a.delete(r.id);
        });
        const s = w.current, c = Array.from(a).map(
          (r) => s.get(r) ?? { id: r, label: r, type: void 0, hasChildren: !1 }
        );
        return queueMicrotask(() => l == null ? void 0 : l(c)), a;
      });
      return;
    }
    x((t) => {
      const e = new Set(ot(p, D, n)), a = new Set(t);
      e.forEach((r) => {
        f.has(r) || a.delete(r);
      });
      const s = w.current, c = Array.from(a).map(
        (r) => s.get(r) ?? { id: r, label: r, type: void 0, hasChildren: !1 }
      );
      return queueMicrotask(() => l == null ? void 0 : l(c)), a;
    });
  }, [u, k, p, n, D, l, f]), B = h(
    (t) => {
      const e = n.get(t);
      e != null && e.length && x((a) => {
        const s = new Set(a);
        e.forEach((i) => {
          f.has(i.id) || s.add(i.id);
        });
        const c = w.current, r = Array.from(s).map(
          (i) => c.get(i) ?? { id: i, label: i, type: void 0, hasChildren: !1 }
        );
        return queueMicrotask(() => l == null ? void 0 : l(r)), s;
      });
    },
    [n, l, f]
  ), O = h(
    (t) => {
      const e = n.get(t);
      e != null && e.length && x((a) => {
        const s = new Set(a);
        e.forEach((i) => {
          f.has(i.id) || s.delete(i.id);
        });
        const c = w.current, r = Array.from(s).map(
          (i) => c.get(i) ?? { id: i, label: i, type: void 0, hasChildren: !1 }
        );
        return queueMicrotask(() => l == null ? void 0 : l(r)), s;
      });
    },
    [n, l, f]
  ), et = h(
    (t) => B(t),
    [B]
  ), st = h(
    (t) => O(t),
    [O]
  ), N = it({
    getData: Y,
    clearData: Z,
    expandAll: I,
    collapseAll: C,
    selectAll: S,
    deselectAll: tt,
    selectChildrenOf: et,
    deselectChildrenOf: st
  });
  N.current.getData = Y, N.current.clearData = Z, N.current.expandAll = I, N.current.collapseAll = C, N.current.selectAll = S, N.current.deselectAll = tt, N.current.selectChildrenOf = et, N.current.deselectChildrenOf = st, W(() => {
    y == null || y(N.current);
  }, [y]), Nt(pt, () => N.current, []);
  const ut = [...E].map(j).sort().join(",");
  W(() => {
    const t = new Set(E.map(j));
    x((e) => e.size !== t.size || [...e].some((a) => !t.has(a)) ? t : e);
  }, [ut]);
  const P = h(
    (t, e) => {
      e == null || e.stopPropagation();
      const a = t.id;
      f.has(a) || x((s) => {
        const c = new Set(s);
        m ? c.has(a) ? c.delete(a) : c.add(a) : (c.clear(), c.add(a));
        const r = w.current, i = Array.from(c).map((A) => r.get(A) ?? { id: A, label: A, type: void 0, hasChildren: !1 });
        return queueMicrotask(() => l == null ? void 0 : l(i)), c;
      });
    },
    [m, l, f]
  ), _ = h(
    async (t) => {
      if (!v || !t.hasChildren) return;
      const e = t.id;
      if (n.has(e)) {
        T((a) => {
          const s = new Set(a);
          return s.has(e) ? s.delete(e) : s.add(e), s;
        });
        return;
      }
      Q((a) => new Set(a).add(e));
      try {
        const a = await v(e);
        G((s) => new Map(s).set(e, a)), T((s) => new Set(s).add(e));
      } finally {
        Q((a) => {
          const s = new Set(a);
          return s.delete(e), s;
        });
      }
    },
    [v, n]
  ), H = h(
    (t, e, a) => {
      var ct, dt;
      const s = t.id, c = q.has(s), r = f.has(s), i = t.hasChildren ?? !1, A = D.has(s);
      J.has(s);
      const rt = i && !u, F = 8, ft = F + (u ? 0 : e * 16), at = z ? `${t.label} (${t.id})` : t.label, ht = [
        "dtk-tv-row",
        r ? "dtk-tv-row-disabled" : "",
        // When disableCheckbox is on, suppress the full-row hover so only the content area highlights
        L ? "dtk-tv-row-no-hover" : ""
      ].filter(Boolean).join(" "), vt = [
        "dtk-tv-row-content",
        L && c ? "dtk-tv-row-selected" : ""
      ].filter(Boolean).join(" "), lt = /* @__PURE__ */ g(mt, { children: [
        !L && (m ? /* @__PURE__ */ d(
          "input",
          {
            type: "checkbox",
            className: "dtk-tv-checkbox",
            checked: c,
            disabled: r,
            onChange: () => {
            },
            onClick: (o) => {
              o.stopPropagation(), P(t, o);
            },
            "aria-label": at
          }
        ) : /* @__PURE__ */ d(
          "input",
          {
            type: "radio",
            name: "dtk-tv-radio",
            className: "dtk-tv-checkbox",
            checked: c,
            disabled: r,
            onChange: () => {
            },
            onClick: (o) => {
              o.stopPropagation(), P(t, o);
            },
            "aria-label": at
          }
        )),
        R && /* @__PURE__ */ d("span", { className: "dtk-tv-icon", "aria-hidden": !0, children: R }),
        /* @__PURE__ */ g(
          "div",
          {
            className: "dtk-tv-label-wrap",
            onClick: (o) => {
              o.stopPropagation(), r || P(t, o);
            },
            children: [
              z ? t.label !== t.id ? /* @__PURE__ */ g("span", { className: "dtk-tv-label-line", children: [
                /* @__PURE__ */ d("span", { className: "dtk-tv-label", children: t.label }),
                /* @__PURE__ */ g("span", { className: "dtk-tv-node-id", children: [
                  "(",
                  t.id,
                  ")"
                ] })
              ] }) : /* @__PURE__ */ d("span", { className: "dtk-tv-label", children: t.label }) : /* @__PURE__ */ d("span", { className: "dtk-tv-label", children: t.label }),
              a && t.path && /* @__PURE__ */ d("span", { className: "dtk-tv-path", children: t.path })
            ]
          }
        ),
        t.type && /* @__PURE__ */ d("span", { className: "dtk-tv-type", children: t.type }),
        U && t.count !== void 0 && /* @__PURE__ */ d("span", { className: "dtk-tv-count", children: t.count })
      ] });
      return /* @__PURE__ */ g(kt.Fragment, { children: [
        /* @__PURE__ */ g(
          "div",
          {
            className: ht,
            style: {
              paddingLeft: ft + "px",
              // When disableCheckbox is on, the content div handles its own right padding
              paddingRight: L ? 0 : F + "px"
            },
            onClick: () => rt && _(t),
            children: [
              !u && (rt ? /* @__PURE__ */ d(
                "span",
                {
                  className: `dtk-tv-chevron ${A ? "dtk-tv-chevron-open" : ""}`,
                  "aria-hidden": !0,
                  "aria-label": A ? "Collapse" : "Expand",
                  onClick: (o) => {
                    o.stopPropagation(), _(t);
                  },
                  children: A ? /* @__PURE__ */ d("svg", { className: "dtk-tv-chevron-svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ d("polyline", { points: "6 9 12 15 18 9" }) }) : /* @__PURE__ */ d("svg", { className: "dtk-tv-chevron-svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ d("polyline", { points: "9 18 15 12 9 6" }) })
                }
              ) : /* @__PURE__ */ d("span", { className: "dtk-tv-chevron-placeholder", "aria-hidden": !0 })),
              L ? /* @__PURE__ */ d(
                "div",
                {
                  className: vt,
                  onClick: (o) => {
                    o.stopPropagation(), r || P(t, o);
                  },
                  children: lt
                }
              ) : lt
            ]
          }
        ),
        !u && m && A && (((ct = n.get(s)) == null ? void 0 : ct.length) ?? 0) > 0 && /* @__PURE__ */ g(
          "div",
          {
            className: "dtk-tv-level-actions",
            style: {
              paddingLeft: F + (e + 1) * 16 + "px",
              paddingRight: F + "px"
            },
            onClick: (o) => o.stopPropagation(),
            role: "group",
            "aria-label": `${t.label}: child selection`,
            children: [
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "dtk-tv-level-action-link",
                  onClick: () => B(s),
                  children: V.selectAll
                }
              ),
              /* @__PURE__ */ d(
                "button",
                {
                  type: "button",
                  className: "dtk-tv-level-action-link",
                  onClick: () => O(s),
                  children: V.deselectAll
                }
              )
            ]
          }
        ),
        !u && A && ((dt = n.get(s)) == null ? void 0 : dt.map((o) => H(o, e + 1, !1)))
      ] }, s);
    },
    [
      q,
      D,
      n,
      J,
      u,
      m,
      f,
      _,
      P,
      V,
      B,
      O,
      z,
      U,
      L,
      R
    ]
  );
  if (u) {
    const t = k ?? [];
    return t.length === 0 ? /* @__PURE__ */ d("div", { className: "dtk-tv-root", children: /* @__PURE__ */ d("div", { className: "dtk-tv-list", children: /* @__PURE__ */ d("div", { className: "dtk-tv-empty", children: "No items to display." }) }) }) : /* @__PURE__ */ d("div", { className: "dtk-tv-root", children: /* @__PURE__ */ d("div", { className: "dtk-tv-list", children: t.map((e) => H(e, 0, !0)) }) });
  }
  return p.length === 0 ? /* @__PURE__ */ d("div", { className: "dtk-tv-root", children: /* @__PURE__ */ d("div", { className: "dtk-tv-list", children: /* @__PURE__ */ d("div", { className: "dtk-tv-empty", children: "No items to display." }) }) }) : /* @__PURE__ */ d("div", { className: "dtk-tv-root", children: /* @__PURE__ */ d("div", { className: "dtk-tv-list", children: p.map((t) => H(t, 0, !1)) }) });
});
export {
  Et as TreeView
};
//# sourceMappingURL=dfa-v6-comp-treeview.js.map
