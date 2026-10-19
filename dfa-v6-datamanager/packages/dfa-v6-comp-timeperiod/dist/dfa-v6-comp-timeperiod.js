import "dfa-v6-comp-list-view/styles.css";
import { jsx as c, Fragment as ie, jsxs as A } from "react/jsx-runtime";
import { useCallback as m, useState as I, useRef as x, useMemo as P, useEffect as _ } from "react";
import { ListView as de } from "dfa-v6-comp-list-view";
const Le = Array.from({ length: 50 }, (a, r) => 1977 + r), H = Le.map((a) => ({
  id: String(a),
  label: String(a)
})), Ee = "/time-periods", oe = /* @__PURE__ */ new Map();
function we(a) {
  const r = a.tp_nid, d = a.tp_nid ?? a.tp_timeperiod ?? a.id, V = a.tp_timeperiod ?? a.label ?? (d != null ? String(d) : "");
  return {
    id: d,
    label: V || String(d),
    ...r != null ? { nid: r } : {}
  };
}
function me(a) {
  return a ?? (typeof navigator < "u" ? navigator.language : "en");
}
function Re(a, r) {
  const d = me(a);
  return r ? { ...r, "Accept-Language": d } : { "Accept-Language": d };
}
const $e = {
  quickSelectLabel: "Quick Select",
  recent5: "Recent 5",
  recent10: "Recent 10",
  recent20: "Recent 20",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  loadingLabel: "Loading...",
  emptyLabel: "No time periods available.",
  summaryNone: "No years selected",
  summaryOne: "1 year selected",
  summaryMany: "{n} years selected",
  summarySelectedPanelTitle: "Selected time periods",
  close: "Close"
};
function ue(a, r) {
  return a.slice(0, r);
}
const Te = [5, 10, 20];
function Fe({
  baseUrl: a,
  multiSelect: r = !0,
  locale: d,
  headers: V,
  preloadedData: F,
  options: L,
  fetchOptions: M,
  initialSelectedIds: D = [],
  initialSelectedItems: q = [],
  onReady: O,
  onChange: h,
  quickSelectCounts: Y = Te,
  loadingComponent: J,
  strings: pe
}) {
  const B = Array.isArray(F) && F.length > 0, W = !!(a && !M && !B), i = { ...$e, ...pe }, y = m(
    (e) => {
      if (r)
        return e;
      const n = e.length > 0 ? e[e.length - 1] : void 0;
      return n == null ? [] : [n];
    },
    [r]
  ), [p, f] = I(
    () => y(
      D.length > 0 ? D : q.map((e) => e.id)
    )
  ), [b, S] = I(
    L ?? H
  ), [C, E] = I(!1), [X, w] = I(null), Z = x(b), j = x(p), ee = x(null), [o, K] = I(!1), [R, te] = I([]), $ = x([]);
  $.current = R;
  const [fe, T] = I(!1);
  Z.current = b, j.current = p;
  const u = P(() => [...b].reverse(), [b]);
  _(() => {
    if (B) {
      S(F), E(!1), w(null);
      return;
    }
    if (M) {
      w(null), E(!0), M().then((e) => {
        S(Array.isArray(e) ? e : []);
      }).catch((e) => {
        w(
          e instanceof Error ? e.message : "Failed to load time periods"
        ), S(H);
      }).finally(() => {
        E(!1);
      });
      return;
    }
    if (W && a) {
      const e = a.replace(/\/$/, ""), n = me(d), t = `${e}|${n}`, l = oe.get(t);
      if (l !== void 0) {
        S(l), E(!1), w(null);
        return;
      }
      w(null), E(!0), fetch(`${e}${Ee}`, {
        headers: Re(d, V)
      }).then((s) => s.json()).then((s) => {
        const g = (s && typeof s == "object" && "data" in s && Array.isArray(s.data) ? s.data : Array.isArray(s) ? s : []).map(we);
        oe.set(t, g), S(g);
      }).catch((s) => {
        w(
          s instanceof Error ? s.message : "Failed to load time periods"
        ), S(H);
      }).finally(() => {
        E(!1);
      });
      return;
    }
    L != null ? S(Array.isArray(L) ? L : []) : S(H);
  }, [B, F, M, L, W, a, d]);
  const ne = D.length > 0 ? D : q.map((e) => e.id), ge = ne.map(String).sort().join(","), he = b.length > 0 ? "ready" : "empty";
  _(() => {
    const e = q.length > 0 ? q : D.map((t) => ({ id: t, label: String(t) }));
    if (e.length === 0) {
      f((t) => t.length === 0 ? t : []);
      return;
    }
    if (b.length === 0) {
      const t = ne;
      f((l) => {
        const s = y(t);
        return l.length !== s.length || l.some((v, g) => String(v) !== String(s[g])) ? s : l;
      });
      return;
    }
    const n = e.map((t) => {
      var v;
      const l = (v = t.label) == null ? void 0 : v.trim().toLowerCase(), s = b.find(
        (g) => {
          var ce;
          return String(g.id) === String(t.id) || l != null && ((ce = g.label) == null ? void 0 : ce.trim().toLowerCase()) === l || String(g.nid) === String(t.id) || g.nid === Number(t.id);
        }
      );
      return s ? s.id : null;
    }).filter((t) => t != null);
    f((t) => {
      const l = y(n);
      return t.length !== l.length || t.some((s, v) => String(s) !== String(l[v])) ? l : t;
    });
  }, [he, ge, b, y]);
  const Q = m(() => o ? $.current.map((e) => ({
    id: e.id,
    label: e.label ?? String(e.id),
    ...e.nid != null ? { nid: e.nid } : {}
  })) : Z.current.filter(
    (e) => j.current.some((n) => String(n) === String(e.id))
  ), [o]), re = m(() => {
    var e;
    f([]), (e = ee.current) == null || e.clearData(), h == null || h([]);
  }, [h]), le = m(
    (e) => {
      f(y(e));
    },
    [y]
  ), z = x({
    getSelected: Q,
    clear: re,
    setSelectedIds: le
  });
  z.current.getSelected = Q, z.current.clear = re, z.current.setSelectedIds = le, _(() => {
    O == null || O(z.current);
  }, [O]);
  const ye = m((e) => {
    ee.current = e;
  }, []), U = m(
    (e) => {
      const n = r ? e : e.slice(-1);
      f(n.map((t) => t.id)), h == null || h(n);
    },
    [r, h]
  ), be = m(() => {
    U($.current), K(!1), T(!1);
  }, [U]), se = m(() => {
    const e = Q();
    $.current = e, te(e), K(!0);
  }, [Q]);
  _(() => {
    o ? (T(!1), requestAnimationFrame(() => T(!0))) : T(!1);
  }, [o]), _(() => {
    p.length === 0 && o && (K(!1), T(!1));
  }, [p.length, o]), _(() => {
    !r && o && (K(!1), T(!1));
  }, [r, o]);
  const Se = m(
    (e) => {
      const n = ue(u, e);
      f(y(n.map((t) => t.id)));
    },
    [u, y]
  ), ke = m(() => {
    const e = new Set(u.map((n) => n.id));
    f((n) => {
      const t = new Set(n.map(String));
      return e.forEach((l) => t.add(String(l))), [...t];
    });
  }, [u]), Ne = m(() => {
    if (u.length === 0) {
      f([]);
      return;
    }
    const e = new Set(u.map((n) => String(n.id)));
    f((n) => n.filter((t) => !e.has(String(t))));
  }, [u]), ae = P(
    () => u.map((e) => ({ id: e.id, label: e.label })),
    [u]
  ), ve = P(() => {
    const e = new Set(p.map(String));
    for (const n of Y) {
      const t = ue(u, n).map(
        (l) => String(l.id)
      );
      if (t.length === p.length && t.every((l) => e.has(l)))
        return n;
    }
    return null;
  }, [u, p, Y]), k = P(
    () => o ? R.map((e) => e.id) : p,
    [o, R, p]
  ), N = k.length, G = P(() => {
    if (k.length === 0) return null;
    const e = k.map((l) => {
      const s = parseInt(String(l), 10);
      return Number.isNaN(s) ? null : s;
    }).filter((l) => l !== null);
    if (e.length === 0)
      return k.length === 1 ? "1 year selected" : `${k.length} years selected`;
    const n = Math.min(...e), t = Math.max(...e);
    return n === t ? `1 year selected (${n})` : `${k.length} years selected (${n} - ${t})`;
  }, [k]), Ae = N === 0 ? /* @__PURE__ */ c(ie, { children: i.summaryNone }) : G ? (() => {
    const e = G.match(/^(\d+)(.*)$/);
    return e ? /* @__PURE__ */ A(ie, { children: [
      /* @__PURE__ */ c("span", { className: "dtk-tp-count", children: e[1] }),
      e[2]
    ] }) : G;
  })() : null, Ie = (e) => e === 5 ? i.recent5 : e === 10 ? i.recent10 : e === 20 ? i.recent20 : `Recent ${e}`;
  return /* @__PURE__ */ c("div", { className: "dtk-tp-root", children: /* @__PURE__ */ A("div", { className: "dtk-tp-stack", children: [
    r ? /* @__PURE__ */ A("div", { className: "dtk-tp-quick-select", children: [
      /* @__PURE__ */ c("p", { className: "dtk-tp-quick-select-label", children: i.quickSelectLabel }),
      /* @__PURE__ */ c("div", { className: "dtk-tp-quick-select-buttons", children: Y.map((e) => /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          onClick: () => Se(e),
          disabled: C,
          className: `dtk-tp-quick-btn ${ve === e ? "dtk-tp-quick-btn-active" : ""}`,
          children: Ie(e)
        },
        e
      )) })
    ] }) : null,
    r ? /* @__PURE__ */ A("div", { className: "dtk-tp-actions", children: [
      /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          onClick: ke,
          disabled: C,
          className: "dtk-tp-action-btn",
          children: i.selectAll
        }
      ),
      /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          onClick: Ne,
          disabled: C,
          className: "dtk-tp-action-btn",
          children: i.deselectAll
        }
      )
    ] }) : null,
    /* @__PURE__ */ A("div", { className: "dtk-tp-content", children: [
      /* @__PURE__ */ c("div", { className: "dtk-tp-list-wrap", children: C ? J ? /* @__PURE__ */ c("div", { className: "dtk-tp-loading-slot", children: J }) : /* @__PURE__ */ c("div", { className: "dtk-tp-empty dtk-tp-loading", children: i.loadingLabel }) : X ? /* @__PURE__ */ c("div", { className: "dtk-tp-error", children: X }) : ae.length === 0 ? /* @__PURE__ */ c("div", { className: "dtk-tp-empty", children: i.emptyLabel }) : /* @__PURE__ */ c(
        de,
        {
          items: ae,
          multiSelect: r,
          selectedIds: p,
          onSelectionChange: U,
          onReady: ye
        }
      ) }),
      /* @__PURE__ */ c(
        "div",
        {
          className: `dtk-tp-summary${r && N > 0 ? " dtk-tp-summary-clickable" : ""}`,
          onClick: r && N > 0 ? se : void 0,
          role: r && N > 0 ? "button" : void 0,
          tabIndex: r && N > 0 ? 0 : void 0,
          "aria-label": r && N > 0 ? i.summarySelectedPanelTitle : void 0,
          onKeyDown: r && N > 0 ? (e) => {
            (e.key === "Enter" || e.key === " ") && (e.preventDefault(), se());
          } : void 0,
          children: Ae
        }
      )
    ] }),
    r && o ? /* @__PURE__ */ A(
      "div",
      {
        className: `dtk-tp-selected-panel ${fe ? "dtk-tp-selected-panel-is-open" : ""}`,
        role: "dialog",
        "aria-label": i.summarySelectedPanelTitle,
        children: [
          /* @__PURE__ */ A("div", { className: "dtk-tp-selected-panel-header", children: [
            /* @__PURE__ */ c("span", { className: "dtk-tp-selected-panel-title", children: i.summarySelectedPanelTitle }),
            /* @__PURE__ */ c(
              "button",
              {
                type: "button",
                className: "dtk-tp-selected-panel-close",
                onClick: be,
                "aria-label": i.close,
                title: i.close,
                children: "×"
              }
            )
          ] }),
          /* @__PURE__ */ c("div", { className: "dtk-tp-selected-panel-list", children: R.length === 0 ? /* @__PURE__ */ c("div", { className: "dtk-tp-empty", children: i.summaryNone }) : /* @__PURE__ */ c(
            de,
            {
              items: R,
              multiSelect: r,
              selectedIds: R.map((e) => e.id),
              onSelectionChange: (e) => {
                const n = new Set(e.map((l) => String(l.id))), t = $.current.filter(
                  (l) => n.has(String(l.id))
                );
                $.current = t, te(t);
              }
            }
          ) })
        ]
      }
    ) : null
  ] }) });
}
export {
  Fe as TimePeriodSelect
};
//# sourceMappingURL=dfa-v6-comp-timeperiod.js.map
