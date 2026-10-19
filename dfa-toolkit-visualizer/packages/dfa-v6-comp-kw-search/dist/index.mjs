function Xe(i) {
  const o = {
    indicator_id: null,
    area_id: null,
    time_period_id: null,
    subgroup_id: null
  }, l = Array.isArray(i) ? i : [];
  for (const r of l) {
    const b = String(r && r.keywordType || "").toUpperCase(), y = Number(r && r.keywordId);
    Number.isNaN(y) || (b === "INDICATOR" ? o.indicator_id = y : b === "AREA" ? o.area_id = y : b === "TIME PERIOD" || b === "TIME_PERIOD" ? o.time_period_id = y : b === "SUBGROUP" && (o.subgroup_id = y));
  }
  return o;
}
function Ke(i) {
  return !!(i && typeof i == "object" && i.nodeType === 1);
}
function Ve(i) {
  if (Ke(i)) return i;
  if (typeof i == "string") {
    const o = document.querySelector(i);
    if (!o) throw new Error(`createChipSearch: mount element not found for selector "${i}"`);
    return o;
  }
  throw new Error("createChipSearch: mountEl must be a DOM element or selector string");
}
function Ge(i, o) {
  let l = null;
  return function(...r) {
    l && clearTimeout(l), l = setTimeout(() => i.apply(this, r), o);
  };
}
function $e(i, o) {
  const l = /* @__PURE__ */ new Set(), r = [];
  for (const b of i) {
    const y = o(b);
    l.has(y) || (l.add(y), r.push(b));
  }
  return r;
}
function Ze(i, o) {
  return String(typeof o == "function" ? o(i) : i || "");
}
function Pe(i, o, l) {
  i.dispatchEvent(
    new CustomEvent(o, {
      detail: l,
      bubbles: !0,
      composed: !0
    })
  );
}
function h(i) {
  return String(i).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function Be(i, o) {
  const l = String(i);
  if (l.length <= o) return l;
  const r = Math.floor((o - 3) / 2);
  return l.slice(0, r) + "..." + l.slice(-r);
}
function Je() {
  return '<svg class="dtk-sch-leftIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function Ye() {
  return '<svg class="dtk-sch-chipIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 14v4M12 10v8M18 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
function et() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:var(--sc-badge-icon-size,18px);height:var(--sc-badge-icon-size,18px);flex-shrink:0;color:#94a3b8"><path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function tt(i) {
  return i.some(
    (o) => String(o && o.keywordType || "").toUpperCase() === "INDICATOR"
  );
}
const st = "/search", L = {
  placeholder: "Search data e.g. GDP, Population Size, India, total, 2022-2025 etc.",
  searchBtnLabel: "Search",
  clearAllLabel: "Clear All",
  noRecordLabel: "No results",
  loadingLabel: "Loading...",
  searchBtnDisabledTooltip: "Please select at least one indicator"
};
function nt(i) {
  if (Array.isArray(i)) return i;
  if (!i || typeof i != "object") return [];
  const o = i;
  return Array.isArray(o.data) && o.data.length >= 0 ? o.data : o.data && typeof o.data == "object" && Array.isArray(o.data.results) ? o.data.results : Array.isArray(o.results) ? o.results : [];
}
function rt(i, o) {
  var ke, xe, we;
  const l = Ve(i), r = o || {};
  if (!r.baseUrl)
    throw new Error("createChipSearch: options.baseUrl is required");
  const b = `${r.baseUrl.replace(/\/$/, "")}${st}`, y = typeof r.minChars == "number" ? r.minChars : 3, Ee = typeof r.debounceMs == "number" ? r.debounceMs : 250, w = { ...L, ...r.strings }, $ = r.enabledSearchbtn !== !1, De = r.enabledClearAll === !0, K = typeof r.callback == "function" ? r.callback : null, ne = typeof r.searchBtnCallback == "function" ? r.searchBtnCallback : null, re = typeof r.onSearch == "function" ? r.onSearch : null, qe = typeof r.onChange == "function" ? r.onChange : null, Re = typeof r.mapChipsToPayload == "function" ? r.mapChipsToPayload : r.payloadPreset === "dfa" ? Xe : (e) => ({ chips: e }), s = {
    chips: [],
    currentQuery: "",
    suggestions: [],
    activeIndex: -1,
    loading: !1,
    open: !1
  };
  function P(e, t) {
    if (e)
      try {
        e(t);
      } catch {
      }
  }
  const ie = w.placeholder ?? L.placeholder, Ne = w.searchBtnLabel || w.searchLabel || L.searchBtnLabel, _e = w.clearAllLabel ?? L.clearAllLabel, Oe = w.noRecordLabel ?? w.emptyLabel ?? L.noRecordLabel, He = w.loadingLabel ?? L.loadingLabel;
  l.innerHTML = `
    <div class="dtk-sch-root">
      <div class="dtk-sch-shell">
        <div class="dtk-sch-row">
          ${Je()}
          <div class="dtk-sch-inputWrap" data-sc="inputwrap" aria-label="Search filters">
            <div class="dtk-sch-chipsWrap" data-sc="chipsWrap"></div>
            <div class="dtk-sch-inputArea" data-sc="inputArea">
              <span class="dtk-sch-placeholder" data-sc="placeholder" aria-hidden="true">${h(ie)}</span>
              <input
                class="dtk-sch-input"
                data-sc="input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                aria-placeholder="${h(ie)}"
              />
            </div>
          </div>
          <div class="dtk-sch-actions">
            ${$ ? `<button class="dtk-sch-btn" data-sc="searchBtn" type="button">${h(Ne)}</button>` : ""}
            ${De ? `<button class="dtk-sch-btn dtk-sch-btnSecondary" data-sc="clearAllBtn" type="button">${h(_e)}</button>` : ""}
          </div>
        </div>
      </div>
      <div class="dtk-sch-dropdown" data-sc="dropdown" style="display:none" role="listbox" aria-label="Suggestions"></div>
      <div class="dtk-sch-chipsList" data-sc="chipsList" style="display:none" role="dialog" aria-label="All chips"></div>
    </div>
  `.trim();
  const oe = 640;
  function ze() {
    return typeof window < "u" && window.matchMedia(`(max-width: ${oe}px)`).matches;
  }
  const ae = 22, a = l.querySelector(".dtk-sch-root"), d = l.querySelector('[data-sc="input"]'), Ue = l.querySelector('[data-sc="inputwrap"]'), B = l.querySelector('[data-sc="placeholder"]'), S = l.querySelector('[data-sc="chipsWrap"]'), f = l.querySelector('[data-sc="dropdown"]'), A = l.querySelector('[data-sc="chipsList"]'), M = l.querySelector('[data-sc="searchBtn"]');
  if (l.querySelector('[data-sc="clearAllBtn"]'), !a || !d || !f || !Ue || !S)
    throw new Error("createChipSearch: failed to render component");
  let O = "", E = "", R = "", N = "", H = "", V = "", G = "";
  const Z = (ke = r.style) == null ? void 0 : ke.height;
  if (typeof Z == "number" && Z > 0) {
    const e = Z;
    a.style.setProperty("--sc-h", `${e}px`), ((xe = r.style) == null ? void 0 : xe.chipBehavior) === "scroll" && (a.style.setProperty("--sc-shell-overflow", "hidden"), a.style.setProperty("--sc-chip-shrink", "0"), a.style.setProperty("--sc-chips-overflow-y", "hidden")), a.style.setProperty("--sc-left-icon-size", `${Math.max(14, Math.round(e * 0.5))}px`), a.style.setProperty("--sc-badge-icon-size", `${Math.max(12, Math.round(e * 0.346))}px`), a.style.setProperty("--sc-shell-py", `${Math.max(2, Math.round(e * 0.077))}px`), a.style.setProperty("--sc-inputwrap-py", `${Math.max(2, Math.round(e * 0.077))}px`), a.style.setProperty("--sc-chip-py", `${Math.max(2, Math.round(e * 0.115))}px`), a.style.setProperty("--sc-chip-px", `${Math.max(2, Math.round(e * 0.077))}px`), a.style.setProperty("--sc-chip-fs", `${Math.max(10, Math.round(e * 0.25))}px`), a.style.setProperty("--sc-chip-icon-size", `${Math.max(10, Math.round(e * 0.25))}px`), a.style.setProperty("--sc-chipx-size", `${Math.max(12, Math.round(e * 0.385))}px`), a.style.setProperty("--sc-dropdown-max-h", `${Math.round(e * 4.23)}px`);
    const t = `${Math.max(4, Math.round(e * 0.154))}px`;
    a.style.setProperty("--sc-btn-radius", t), a.style.setProperty("--sc-chip-radius", t), O = `${Math.max(12, Math.round(e * 0.288))}px`, E = `${Math.max(1, Math.round(e * 0.096))}px`, R = `${Math.max(12, Math.round(e * 0.288))}px`, N = `${Math.max(4, Math.round(e * 0.135))}px`, H = `${Math.max(10, Math.round(e * 0.23))}px`, V = `${Math.max(2, Math.round(e * 0.096))}px`, G = `${Math.max(6, Math.round(e * 0.192))}px`, a.style.setProperty("--sc-input-fs", O), a.style.setProperty("--sc-input-py", E), a.style.setProperty("--sc-suggestion-fs", R), a.style.setProperty("--sc-suggestion-py", N), a.style.setProperty("--sc-badge-fs", H), a.style.setProperty("--sc-badge-py", V), a.style.setProperty("--sc-badge-px", G), a.style.setProperty("--sc-empty-fs", R), d.style.fontSize = O, d.style.paddingTop = E, d.style.paddingBottom = E, B && (B.style.fontSize = O, B.style.paddingTop = E, B.style.paddingBottom = E);
  }
  const v = r.style;
  v && (v.bgColor && a.style.setProperty("--sc-chip-bg", v.bgColor), v.textColor && a.style.setProperty("--sc-chip-text", v.textColor), v.borderColor && a.style.setProperty("--sc-chip-border", v.borderColor), v.crossBgColor && a.style.setProperty("--sc-chip-x-bg", v.crossBgColor));
  let J = !1, D = null, I = !1, g = null;
  function z() {
    J || (T(), I && A && (A.style.display = "none", I = !1));
  }
  let q = null;
  function ce() {
    S.scrollLeft = Math.max(0, S.scrollWidth - S.clientWidth);
  }
  const le = w.searchBtnDisabledTooltip ?? L.searchBtnDisabledTooltip;
  function de() {
    if (!$ || !M) return;
    const t = r.requireIndicatorForSearch === !0 ? tt(s.chips) : s.chips.length > 0;
    M.disabled = !t, M.classList.toggle("dtk-sch-btnPrimary", t), M.setAttribute("aria-disabled", String(!t)), M.title = M.disabled && le ? le : "";
  }
  function _() {
    if (!B) return;
    const e = d.value.length === 0;
    B.classList.toggle("dtk-sch-placeholder-hidden", !e);
  }
  let u = { type: null, suggestions: [], activeIndex: -1 };
  function m(e) {
    s.open = !!e, f.style.display = s.open ? "block" : "none", s.open || (s.activeIndex = -1, u = { type: null, suggestions: [], activeIndex: -1 });
  }
  function Fe(e) {
    const t = Be(e.displayText, ae), n = document.createElement("span");
    return n.className = "dtk-sch-chip", n.setAttribute("data-sc", "chip"), n.setAttribute("data-keyword-id", String(e.keywordId)), n.setAttribute("data-keyword-type", String(e.keywordType)), n.title = e.displayText, n.innerHTML = `
      ${Ye()}
      <span class="dtk-sch-chipText">${h(t)}</span>
      <button class="dtk-sch-chipX" type="button" aria-label="Remove ${h(
      e.displayText
    )}" data-sc="chipx">×</button>
    `.trim(), n;
  }
  function Y() {
    if (A) {
      A.replaceChildren();
      for (const e of s.chips) {
        const t = document.createElement("div");
        t.className = "dtk-sch-chipsListItem", t.setAttribute("data-sc", "chipsListItem"), t.setAttribute("data-keyword-id", String(e.keywordId)), t.setAttribute("data-keyword-type", String(e.keywordType));
        const n = Be(e.displayText, ae);
        t.innerHTML = `
        <span class="dtk-sch-chipsListItemText">${h(n)}</span>
        <button class="dtk-sch-chipX" type="button" aria-label="Remove ${h(
          e.displayText
        )}" data-sc="chipx">×</button>
      `.trim(), A.appendChild(t);
      }
    }
  }
  function U(e) {
    I = e;
    const t = l.querySelector('[data-sc="chipMoreBtn"]');
    t && t.setAttribute("aria-expanded", String(e)), A && (A.style.display = e ? "block" : "none", e && Y());
  }
  function T() {
    if (S.replaceChildren(), ze() && s.chips.length >= 1) {
      const n = s.chips.length, c = document.createElement("button");
      c.className = "dtk-sch-chipMore", c.setAttribute("data-sc", "chipMoreBtn"), c.setAttribute("type", "button"), c.setAttribute("aria-label", "Show all chips"), c.setAttribute("aria-expanded", String(I)), c.innerHTML = `
        <span class="dtk-sch-chipMoreBadge">+${n}</span>
        <svg class="dtk-sch-chipMoreArrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      `.trim(), S.appendChild(c);
    } else
      for (const n of s.chips)
        S.appendChild(Fe(n));
    requestAnimationFrame(ce), de();
  }
  function F() {
    if (!s.open) return;
    if (s.loading) {
      if (u.type === "suggestions" && u.suggestions.length > 0) {
        f.classList.add("dtk-sch-dropdown-loading");
        return;
      }
      u.type !== "loading" && (f.innerHTML = `<div class="dtk-sch-empty">${h(He)}</div>`, u = { type: "loading", suggestions: [], activeIndex: -1 });
      return;
    }
    if (f.classList.remove("dtk-sch-dropdown-loading"), !s.suggestions.length) {
      u.type !== "empty" && (f.innerHTML = `<div class="dtk-sch-empty">${h(Oe)}</div>`, u = { type: "empty", suggestions: [], activeIndex: -1 });
      return;
    }
    if (u.type !== "suggestions" || u.suggestions.length !== s.suggestions.length || !s.suggestions.every(
      (t, n) => u.suggestions[n] && u.suggestions[n].keywordId === t.keywordId && u.suggestions[n].keywordType === t.keywordType
    )) {
      const t = R ? ` style="font-size:${R}"` : "", n = N ? ` style="padding-top:${N};padding-bottom:${N}"` : "", c = H ? ` style="font-size:${H};padding:${V} ${G}"` : "";
      f.innerHTML = s.suggestions.map((p, k) => {
        const Q = k === s.activeIndex ? ' data-active="true"' : "", X = Ze(p.keywordType, r.formatKeywordType);
        return `
            <div class="dtk-sch-suggestion" role="option" tabindex="0" data-sc="suggestion" data-idx="${k}"${Q}${n}>
              <div class="dtk-sch-suggestionLeft">
                ${et()}
                <div class="dtk-sch-suggestionText"${t}>${h(p.displayText)}</div>
              </div>
              <div class="dtk-sch-badge" data-type="${h(String(p.keywordType || ""))}"${c}>${h(
          X
        )}</div>
            </div>
          `.trim();
      }).join(""), u = {
        type: "suggestions",
        suggestions: s.suggestions.map((p) => ({ keywordId: p.keywordId, keywordType: p.keywordType })),
        activeIndex: s.activeIndex
      };
    } else u.activeIndex !== s.activeIndex && (f.querySelectorAll('[data-sc="suggestion"]').forEach((n, c) => {
      c === s.activeIndex ? n.setAttribute("data-active", "true") : n.removeAttribute("data-active");
    }), u.activeIndex = s.activeIndex);
  }
  function C(e) {
    const t = Array.isArray(e) ? e : [];
    s.suggestions = t.filter(
      (n) => !!(n && typeof n == "object" && n !== null && "displayText" in n && "keywordId" in n)
    ).map((n) => ({
      keywordId: typeof n.keywordId == "number" || typeof n.keywordId == "string" ? n.keywordId : Number(n.keywordId),
      keywordType: n.keywordType || "",
      displayText: String(n.displayText)
    })), s.activeIndex = s.suggestions.length ? 0 : -1, F();
  }
  async function je(e) {
    if (!J) {
      if (e.length < y) {
        s.loading = !1, C([]), m(!1);
        return;
      }
      D && D.abort(), D = new AbortController(), s.loading = !0, m(!0), F();
      try {
        const t = `${b}?q=${encodeURIComponent(e)}`, n = r.locale ?? (typeof navigator < "u" ? navigator.language : "en"), c = { signal: D.signal, ...r.fetchOptions }, p = { ...r.headers ?? {} };
        c.headers && typeof c.headers == "object" && !(c.headers instanceof Headers) && Object.assign(p, c.headers), p["Accept-Language"] = n, c.headers = p;
        const k = await fetch(t, c);
        if (!k.ok) throw new Error(`HTTP ${k.status}`);
        const Q = await k.json();
        s.loading = !1, m(!0);
        const X = nt(Q);
        C(X);
      } catch (t) {
        if (t && t.name === "AbortError") return;
        s.loading = !1, m(!0), C([]);
      }
    }
  }
  const pe = Ge(je, Ee);
  function ee() {
    const e = s.chips.map((t) => ({ ...t }));
    return {
      chips: e,
      payload: Re(e)
    };
  }
  function j() {
    const e = ee();
    Pe(l, "chipsearch:change", e), P(qe, e);
  }
  const ue = (e) => `${String(e.keywordType)}::${String(e.keywordId)}`;
  function he(e) {
    const t = $e([...s.chips, e], ue);
    t.length !== s.chips.length && (s.chips = t, T(), j());
  }
  function te(e, t) {
    const n = s.chips.length;
    s.chips = s.chips.filter(
      (c) => !(String(c.keywordType) === String(e) && String(c.keywordId) === String(t))
    ), s.chips.length !== n && (T(), j());
  }
  function W(e) {
    if (e === "searchBtn" && $ && M && M.disabled) return;
    const t = ee();
    if (Pe(l, "chipsearch:search", t), e === "searchBtn") {
      P(ne || re, t);
      return;
    }
    P(K || re, t);
  }
  function ye(e) {
    var c, p;
    const t = (p = (c = e.target) == null ? void 0 : c.closest) == null ? void 0 : p.call(c, '[data-sc="suggestion"]');
    if (!t) return;
    const n = Number(t.getAttribute("data-idx"));
    Number.isFinite(n) && n !== s.activeIndex && (s.activeIndex = n, F());
  }
  function fe() {
    s.currentQuery = d.value || "", _();
    const e = s.currentQuery.trim();
    if (e.length < y) {
      C([]), m(!1);
      return;
    }
    pe(e);
  }
  function ge(e) {
    if (!s.suggestions.length) return;
    const t = s.suggestions.length - 1;
    let n = s.activeIndex + e;
    n < 0 && (n = t), n > t && (n = 0), s.activeIndex = n, F();
    const c = f.querySelector(`[data-idx="${n}"]`);
    c && c.scrollIntoView({ block: "nearest" });
  }
  function We() {
    if (s.activeIndex < 0) return;
    const e = s.suggestions[s.activeIndex];
    e && (he(e), d.value = "", s.currentQuery = "", m(!1), C([]), _(), d.focus(), $ || W("implicit"));
  }
  function be(e) {
    if (e.key === "ArrowDown") {
      if (!s.open) {
        const t = (d.value || "").trim();
        t.length >= y && pe(t);
        return;
      }
      e.preventDefault(), ge(1);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!s.open) return;
      e.preventDefault(), ge(-1);
      return;
    }
    if (e.key === "Enter") {
      s.open && s.suggestions.length ? (e.preventDefault(), We()) : W($ ? "searchBtn" : "implicit");
      return;
    }
    if (e.key === "Escape") {
      s.open && (e.preventDefault(), m(!1));
      return;
    }
    if (e.key === "Backspace" && !d.value) {
      const t = s.chips[s.chips.length - 1];
      t && te(t.keywordType, t.keywordId);
    }
  }
  function me(e) {
    var Se, Ae, Me, Ie, Te, Ce;
    const t = e.target;
    if (!t) return;
    const n = (Se = t.closest) == null ? void 0 : Se.call(t, '[data-sc="chipMoreBtn"]');
    if (n) {
      e.preventDefault(), U(!I), n.setAttribute("aria-expanded", String(!I));
      return;
    }
    const c = A && ((Ae = t.closest) == null ? void 0 : Ae.call(t, '[data-sc="chipsList"] [data-sc="chipx"]'));
    if (c) {
      const x = c.closest('[data-sc="chipsListItem"]');
      x && (te(
        x.getAttribute("data-keyword-type") || "",
        x.getAttribute("data-keyword-id") || ""
      ), s.chips.length === 0 ? U(!1) : Y(), T());
      return;
    }
    const p = (Me = t.closest) == null ? void 0 : Me.call(t, '[data-sc="chipx"]');
    if (p) {
      const x = p.closest('[data-sc="chip"]');
      x && (te(
        x.getAttribute("data-keyword-type") || "",
        x.getAttribute("data-keyword-id") || ""
      ), I && (s.chips.length === 0 ? U(!1) : Y())), d.focus();
      return;
    }
    const k = (Ie = t.closest) == null ? void 0 : Ie.call(t, '[data-sc="suggestion"]');
    if (k) {
      const x = Number(k.getAttribute("data-idx")), Le = s.suggestions[x];
      Le && (he(Le), d.value = "", s.currentQuery = "", m(!1), C([]), _(), d.focus(), $ || W("implicit"));
      return;
    }
    if ((Te = t.closest) == null ? void 0 : Te.call(t, '[data-sc="searchBtn"]')) {
      W("searchBtn");
      return;
    }
    if ((Ce = t.closest) == null ? void 0 : Ce.call(t, '[data-sc="clearAllBtn"]')) {
      se.clear(), P(K, ee());
      return;
    }
  }
  function ve(e) {
    a.contains(e.target) || (m(!1), U(!1));
  }
  function Qe() {
    var e;
    if (J = !0, D && D.abort(), g) {
      try {
        g.removeEventListener("change", z);
      } catch {
        (e = g.removeListener) == null || e.call(g, z);
      }
      g = null;
    }
    q == null || q.disconnect(), q = null, d.removeEventListener("input", fe), d.removeEventListener("keydown", be), a.removeEventListener("click", me), f.removeEventListener("mousemove", ye), document.removeEventListener("mousedown", ve, !0), l.innerHTML = "";
  }
  if (d.addEventListener("input", fe), d.addEventListener("keydown", be), a.addEventListener("click", me), f.addEventListener("mousemove", ye), document.addEventListener("mousedown", ve, !0), typeof window < "u") {
    g = window.matchMedia(`(max-width: ${oe}px)`);
    try {
      g.addEventListener("change", z);
    } catch {
      (we = g.addListener) == null || we.call(g, z);
    }
  }
  q = new ResizeObserver(() => requestAnimationFrame(ce)), q.observe(S);
  const se = {
    destroy: Qe,
    getState: () => ({
      chips: s.chips.map((e) => ({ ...e })),
      currentQuery: s.currentQuery
    }),
    setChips: (e) => {
      s.chips = Array.isArray(e) ? $e(
        e.map((t) => ({
          keywordId: t.keywordId,
          keywordType: t.keywordType || "",
          displayText: String(t.displayText || "")
        })),
        ue
      ) : [], T(), j();
    },
    clear: () => {
      s.chips = [], d.value = "", s.currentQuery = "", m(!1), C([]), T(), _(), j();
    },
    focus: () => d.focus()
  };
  if (T(), de(), _(), typeof r.preLoadedData == "string" && r.preLoadedData.trim())
    try {
      const e = JSON.parse(r.preLoadedData);
      Array.isArray(e) && se.setChips(e);
    } catch {
    }
  return se;
}
export {
  rt as createChipSearch,
  Xe as mapDfaChipsToPayload
};
//# sourceMappingURL=index.mjs.map
