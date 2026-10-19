import { jsx as n, jsxs as T } from "react/jsx-runtime";
import { forwardRef as A, useState as V, useRef as w, useCallback as v, useEffect as L, useImperativeHandle as q } from "react";
function s(x) {
  return String(x);
}
const K = A(function({
  items: o,
  multiSelect: p = !0,
  selectedIds: d = [],
  onSelectionChange: e,
  onReady: u
}, j) {
  const [b, m] = V(
    () => new Set(d.map(s))
  ), k = w(o);
  k.current = o;
  const N = v(() => {
    const t = /* @__PURE__ */ new Map();
    for (const r of k.current)
      t.set(s(r.id), r.label);
    return Array.from(b).map((r) => ({
      id: r,
      label: t.get(r) ?? r
    }));
  }, [b]), h = v(() => {
    m(/* @__PURE__ */ new Set()), e == null || e([]);
  }, [e]), i = w({ getData: N, clearData: h });
  i.current.getData = N, i.current.clearData = h, L(() => {
    u == null || u(i.current);
  }, [u]), q(j, () => i.current, []);
  const z = d.length === 0 ? "" : d.map(s).sort().join(",");
  L(() => {
    const t = new Set(d.map(s));
    m((r) => r.size !== t.size || [...r].some((l) => !t.has(l)) ? t : r);
  }, [z]);
  const f = w(null), D = v(
    (t) => {
      const r = s(t);
      m((l) => {
        const a = new Set(l);
        p ? a.has(r) ? a.delete(r) : a.add(r) : (a.clear(), a.add(r));
        const M = new Map(
          k.current.map((c) => [s(c.id), c.label])
        );
        return f.current = Array.from(a).map((c) => ({
          id: c,
          label: M.get(c) ?? c
        })), a;
      }), queueMicrotask(() => {
        f.current && (e == null || e(f.current), f.current = null);
      });
    },
    [p, e]
  );
  return /* @__PURE__ */ n("div", { className: "dtk-lv-list-wrap", children: /* @__PURE__ */ n("div", { className: "dtk-lv-list", children: o.map((t) => {
    const r = s(t.id), l = b.has(r);
    return /* @__PURE__ */ T("label", { className: "dtk-lv-row", children: [
      p ? /* @__PURE__ */ n(
        "input",
        {
          type: "checkbox",
          className: "dtk-lv-checkbox",
          checked: l,
          onChange: () => D(t.id),
          "data-id": r,
          "aria-label": t.label
        }
      ) : /* @__PURE__ */ n(
        "input",
        {
          type: "radio",
          name: "dtk-lv-radio",
          className: "dtk-lv-checkbox",
          checked: l,
          onChange: () => D(t.id),
          "data-id": r,
          "aria-label": t.label
        }
      ),
      /* @__PURE__ */ n("span", { className: "dtk-lv-item-label", children: t.label })
    ] }, r);
  }) }) });
});
export {
  K as ListView
};
//# sourceMappingURL=dfa-v6-comp-list-view.js.map
