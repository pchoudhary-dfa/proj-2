import "dfa-v6-comp-list-view/styles.css";
import { jsx as a, jsxs as N, Fragment as re } from "react/jsx-runtime";
import { useCallback as m, useState as k, useRef as F, useEffect as D, useMemo as ce } from "react";
import { ListView as de } from "dfa-v6-comp-list-view";
const H = [
  { id: "s1", label: "Total" },
  { id: "s2", label: "Male" },
  { id: "s3", label: "Female" },
  { id: "s4", label: "Rural" },
  { id: "s5", label: "Urban" }
], Se = "/subgroups", ie = /* @__PURE__ */ new Map();
function Ne(c) {
  const n = c.sg_nid, i = c.sg_gid ?? c.sg_nid ?? c.id, U = c.sg_name ?? c.label ?? (i != null ? String(i) : "");
  return {
    id: i,
    label: U || String(i),
    ...n != null ? { nid: n } : {}
  };
}
function oe(c) {
  return c ?? (typeof navigator < "u" ? navigator.language : "en");
}
function ve(c, n) {
  const i = oe(c);
  return n ? { ...n, "Accept-Language": i } : { "Accept-Language": i };
}
const Ae = {
  searchPlaceholder: "Search subgroups...",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  loadingLabel: "Loading...",
  emptyLabel: "No subgroups match your search.",
  summaryNone: "No subgroups selected",
  summaryOne: "1 subgroup selected",
  summaryMany: "{n} subgroups selected",
  summarySelectedPanelTitle: "Selected subgroups",
  close: "Close"
};
function De({
  baseUrl: c,
  multiSelect: n = !0,
  locale: i,
  headers: U,
  preloadedSubgroupOptions: T,
  options: v,
  fetchOptions: _,
  initialSelectedIds: A = [],
  initialSelectedItems: $ = [],
  onReady: M,
  onChange: h,
  loadingComponent: J,
  strings: ue
}) {
  const q = T !== void 0 && Array.isArray(T), W = !!(c && !_ && !q), d = { ...Ae, ...ue }, L = m(
    (e) => {
      if (n)
        return e;
      const s = e.length > 0 ? e[e.length - 1] : void 0;
      return s == null ? [] : [s];
    },
    [n]
  ), [P, X] = k(""), [w, p] = k(
    () => L(
      A.length > 0 ? A : $.map((e) => e.id)
    )
  ), [o, b] = k(
    v ?? H
  ), [z, I] = k(!1), [Y, E] = k(null), G = F(o), Q = F(w), Z = F(null), [u, O] = k(!1), [R, j] = k([]), x = F([]);
  x.current = R;
  const [ge, C] = k(!1);
  G.current = o, Q.current = w, D(() => {
    if (_) {
      E(null), I(!0), _().then((e) => {
        b(Array.isArray(e) ? e : []);
      }).catch((e) => {
        E(
          e instanceof Error ? e.message : "Failed to load subgroups"
        ), b(H);
      }).finally(() => {
        I(!1);
      });
      return;
    }
    if (q) {
      b(T), I(!1), E(null);
      return;
    }
    if (W && c) {
      const e = c.replace(/\/$/, ""), s = oe(i), t = `${e}|${s}`, r = ie.get(t);
      if (r !== void 0) {
        b(r), I(!1), E(null);
        return;
      }
      E(null), I(!0);
      const g = `${e}${Se}`;
      fetch(g, { headers: ve(i, U) }).then((l) => l.json()).then((l) => {
        const B = (l && typeof l == "object" && "data" in l && Array.isArray(l.data) ? l.data : Array.isArray(l) ? l : []).map(Ne);
        ie.set(t, B), b(B);
      }).catch((l) => {
        E(
          l instanceof Error ? l.message : "Failed to load subgroups"
        ), b(H);
      }).finally(() => {
        I(!1);
      });
      return;
    }
    v != null ? b(Array.isArray(v) ? v : []) : b(H);
  }, [
    _,
    v,
    W,
    q,
    c,
    i,
    T
  ]);
  const me = (A.length > 0 ? A : $.map((e) => e.id)).map(String).sort().join(","), fe = o.length > 0 ? "ready" : "empty";
  D(() => {
    const e = A.length > 0 ? A : $.map((t) => t.id);
    if (o.length === 0) {
      p((t) => {
        const r = L(e);
        return t.length !== r.length || t.some((g, l) => String(g) !== String(r[l])) ? r : t;
      });
      return;
    }
    const s = e.map((t) => {
      const r = String(t), g = $.find((y) => String(y.id) === r);
      let l = o.find(
        (y) => String(y.id) === r || String(y.nid) === r || y.nid === Number(t)
      );
      if (!l && (g == null ? void 0 : g.label) != null) {
        const y = g.label.trim().toLowerCase();
        l = o.find(
          (B) => {
            var ae;
            return ((ae = B.label) == null ? void 0 : ae.trim().toLowerCase()) === y;
          }
        );
      }
      return l != null ? l.id : null;
    }).filter((t) => t != null);
    p((t) => {
      const r = L(s);
      return t.length !== r.length || t.some((g, l) => String(g) !== String(r[l])) ? r : t;
    });
  }, [fe, me, o, L]);
  const S = ce(() => {
    if (!P.trim()) return o;
    const e = P.toLowerCase();
    return o.filter(
      (s) => s.label.toLowerCase().includes(e) || String(s.id).toLowerCase().includes(e)
    );
  }, [P, o]), ee = ce(
    () => S.map((e) => ({ id: e.id, label: e.label })),
    [S]
  ), te = m(() => u ? x.current.map((e) => ({
    id: e.id,
    label: e.label,
    ...e.nid != null ? { nid: e.nid } : {}
  })) : G.current.filter(
    (e) => Q.current.some((s) => String(s) === String(e.id))
  ), [u]), se = m(() => {
    var e;
    p([]), (e = Z.current) == null || e.clearData(), h == null || h([]);
  }, [h]), ne = m(
    (e) => {
      p(L(e));
    },
    [L]
  ), K = F({
    getSelected: te,
    clear: se,
    setSelectedIds: ne
  });
  K.current.getSelected = te, K.current.clear = se, K.current.setSelectedIds = ne, D(() => {
    M == null || M(K.current);
  }, [M]);
  const he = m((e) => {
    Z.current = e;
  }, []), V = m(
    (e) => {
      const s = n ? e : e.slice(-1);
      p(s.map((t) => t.id)), h == null || h(s);
    },
    [n, h]
  ), pe = m(() => {
    V(x.current), O(!1), C(!1);
  }, [V]), le = m(() => {
    const e = G.current.filter(
      (s) => Q.current.some((t) => String(t) === String(s.id))
    );
    x.current = e, j(e), O(!0);
  }, []);
  D(() => {
    u ? (C(!1), requestAnimationFrame(() => C(!0))) : C(!1);
  }, [u]), D(() => {
    w.length === 0 && u && (O(!1), C(!1));
  }, [w.length, u]), D(() => {
    !n && u && (O(!1), C(!1));
  }, [n, u]);
  const be = m(() => {
    const e = new Set(S.map((s) => s.id));
    p((s) => {
      const t = new Set(s.map(String));
      return e.forEach((r) => t.add(String(r))), [...t];
    });
  }, [S]), ye = m(() => {
    if (S.length === 0) {
      p([]);
      return;
    }
    const e = new Set(S.map((s) => String(s.id)));
    p((s) => s.filter((t) => !e.has(String(t))));
  }, [S]), f = u ? R.length : w.length, ke = f === 0 ? /* @__PURE__ */ a(re, { children: d.summaryNone }) : /* @__PURE__ */ N(re, { children: [
    /* @__PURE__ */ a("span", { className: "dtk-sg-count", children: f }),
    " ",
    f === 1 ? "subgroup" : "subgroups",
    " selected"
  ] });
  return /* @__PURE__ */ a("div", { className: "dtk-sg-root", children: /* @__PURE__ */ N("div", { className: "dtk-sg-main", children: [
    /* @__PURE__ */ N("div", { className: "dtk-sg-content", children: [
      /* @__PURE__ */ N("div", { className: "dtk-sg-search-wrap", children: [
        /* @__PURE__ */ a("span", { className: "dtk-sg-search-icon", "aria-hidden": !0 }),
        /* @__PURE__ */ a(
          "input",
          {
            type: "text",
            placeholder: d.searchPlaceholder,
            value: P,
            onChange: (e) => X(e.target.value),
            className: "dtk-sg-search",
            "aria-label": d.searchPlaceholder
          }
        ),
        P.trim() ? /* @__PURE__ */ a(
          "button",
          {
            type: "button",
            className: "dtk-sg-search-clear",
            onClick: () => X(""),
            "aria-label": "Clear search",
            title: "Clear",
            children: "×"
          }
        ) : null
      ] }),
      n ? /* @__PURE__ */ N("div", { className: "dtk-sg-actions", children: [
        /* @__PURE__ */ a(
          "button",
          {
            type: "button",
            onClick: be,
            disabled: z,
            className: "dtk-sg-action-btn",
            children: d.selectAll
          }
        ),
        /* @__PURE__ */ a(
          "button",
          {
            type: "button",
            onClick: ye,
            disabled: z,
            className: "dtk-sg-action-btn",
            children: d.deselectAll
          }
        )
      ] }) : null,
      /* @__PURE__ */ a("div", { className: "dtk-sg-list-wrap", children: z ? J ? /* @__PURE__ */ a("div", { className: "dtk-sg-loading-slot", children: J }) : /* @__PURE__ */ a("div", { className: "dtk-sg-empty dtk-sg-loading", children: d.loadingLabel }) : Y ? /* @__PURE__ */ a("div", { className: "dtk-sg-error", children: Y }) : ee.length === 0 ? /* @__PURE__ */ a("div", { className: "dtk-sg-empty", children: d.emptyLabel }) : /* @__PURE__ */ a(
        de,
        {
          items: ee,
          multiSelect: n,
          selectedIds: w,
          onSelectionChange: V,
          onReady: he
        }
      ) }),
      n && u && /* @__PURE__ */ N(
        "div",
        {
          className: `dtk-sg-selected-panel ${ge ? "dtk-sg-selected-panel-is-open" : ""}`,
          role: "dialog",
          "aria-label": d.summarySelectedPanelTitle,
          children: [
            /* @__PURE__ */ N("div", { className: "dtk-sg-selected-panel-header", children: [
              /* @__PURE__ */ a("span", { className: "dtk-sg-selected-panel-title", children: d.summarySelectedPanelTitle }),
              /* @__PURE__ */ a(
                "button",
                {
                  type: "button",
                  className: "dtk-sg-selected-panel-close",
                  onClick: pe,
                  "aria-label": d.close,
                  title: d.close,
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ a("div", { className: "dtk-sg-selected-panel-list", children: R.length === 0 ? /* @__PURE__ */ a("div", { className: "dtk-sg-empty", children: d.summaryNone }) : /* @__PURE__ */ a(
              de,
              {
                items: R,
                multiSelect: n,
                selectedIds: R.map((e) => e.id),
                onSelectionChange: (e) => {
                  x.current = e, j(e);
                }
              }
            ) })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ a(
      "div",
      {
        className: `dtk-sg-summary${n && f > 0 ? " dtk-sg-summary-clickable" : ""}`,
        onClick: n && f > 0 ? le : void 0,
        role: n && f > 0 ? "button" : void 0,
        tabIndex: n && f > 0 ? 0 : void 0,
        "aria-label": n && f > 0 ? d.summarySelectedPanelTitle : void 0,
        onKeyDown: n && f > 0 ? (e) => {
          (e.key === "Enter" || e.key === " ") && (e.preventDefault(), le());
        } : void 0,
        children: ke
      }
    )
  ] }) });
}
export {
  De as SubgroupSelect
};
//# sourceMappingURL=dfa-v6-comp-subgroup.js.map
