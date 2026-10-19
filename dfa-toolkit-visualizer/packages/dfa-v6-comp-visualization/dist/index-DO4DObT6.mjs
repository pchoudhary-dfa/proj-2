"use client";
import * as Tt from "echarts";
const Ge = 16, We = 12, He = 11, ao = "sans-serif", mo = "̲", Bs = !1;
function co(e) {
  return e && [...e].map((t) => t === " " ? " " : t).join(mo);
}
function q(e, t, o, s) {
  const i = re(e, { size: t, family: e == null ? void 0 : e.family });
  return s ? {
    ...i,
    ...o,
    formatter: (r) => s(r)
  } : { ...i, ...o };
}
function ke(e) {
  return e.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}
const dt = "dfaUlT", Pe = "dfaUlW", uo = "dfaUlT";
function Re(e) {
  return `${Pe}${Math.max(1, Math.ceil(e))}`;
}
function Ye(e) {
  return `${uo}${Math.max(1, Math.ceil(e))}`;
}
function bo(e, t, o, s, i, r = "center") {
  const l = Math.max(1, Math.ceil(t)), n = Ye(l), a = Re(l);
  return e[n] || (e[n] = {
    ...re(o, { size: s, family: o == null ? void 0 : o.family }),
    width: l,
    align: r
  }), e[a] || (e[a] = {
    height: 0,
    width: l,
    align: r,
    borderColor: i,
    borderWidth: 1
  }), l;
}
function ho(e, t, o, s, i, r = "center") {
  for (const l of i)
    l && bo(e, ce(l, t, o), t, o, s, r);
}
function po(e, t) {
  const o = Object.keys(e).filter((i) => i.startsWith(Pe)).map((i) => Number(i.slice(Pe.length))).filter((i) => Number.isFinite(i));
  if (o.length === 0) return null;
  const s = o.reduce(
    (i, r) => Math.abs(r - t) < Math.abs(i - t) ? r : i
  );
  return Re(s);
}
function yo(e, t, o = [], s = "center") {
  const i = _e(e), r = {};
  return ho(r, e, t, i, o, s), {
    rich: r,
    formatUnderlined: (l) => {
      const n = Math.max(1, Math.ceil(ce(l, e, t)));
      let a = Ye(n), m = Re(n);
      if (!r[a] || !r[m]) {
        const d = po(r, n);
        if (!d) return l;
        a = Ye(Number(d.slice(Pe.length))), m = d;
      }
      return `{${a}|${ke(l)}}
{${m}| }`;
    }
  };
}
function xo(e, t, o = "100%") {
  const s = {
    ...re(e, { size: t, family: e == null ? void 0 : e.family }),
    align: "center"
  }, i = o === "100%" ? "dfaUlL" : Re(o);
  return {
    rich: {
      [dt]: s,
      [i]: {
        height: 0,
        width: o === "100%" ? "100%" : Math.ceil(o),
        align: "center",
        borderColor: _e(e),
        borderWidth: 1
      }
    },
    formatUnderlined: (l) => `{${dt}|${ke(l)}}
{${i}| }`
  };
}
function de(e, t, o) {
  const s = re(t, { size: o });
  if (!(t != null && t.underline))
    return { name: e, nameTextStyle: s };
  const i = Math.ceil(ce(e, t, o)), r = xo(t, o, i);
  return {
    name: r.formatUnderlined(e),
    nameTextStyle: { rich: r.rich }
  };
}
function Le(e, t, o = [], s = "center") {
  if (!(e != null && e.underline))
    return { textStyle: re(e, { size: t, family: e == null ? void 0 : e.family }), formatText: (l) => l };
  const i = yo(e, t, o, s);
  return {
    rich: i.rich,
    align: s,
    formatText: i.formatUnderlined
  };
}
function Rs(e, t) {
  return !e || !(t != null && t.underline) ? e : co(e);
}
function _e(e) {
  var o;
  const t = (o = e == null ? void 0 : e.color) == null ? void 0 : o.trim();
  return t && t !== "inherit" ? t : "#333333";
}
let ht = null;
function ce(e, t, o) {
  if (!e) return 0;
  const s = (t == null ? void 0 : t.size) ?? o, i = Ft(t), r = t != null && t.bold ? "bold" : "normal", l = t != null && t.italic ? "italic" : "normal";
  if (typeof document < "u") {
    ht ?? (ht = document.createElement("canvas"));
    const n = ht.getContext("2d");
    if (n)
      return n.font = `${l} ${r} ${s}px ${i}`, n.measureText(e).width;
  }
  return e.length * s * 0.55;
}
function Ft(e, t) {
  var i;
  const o = (i = e == null ? void 0 : e.family) == null ? void 0 : i.trim();
  if (o && o !== "inherit") return o;
  const s = t == null ? void 0 : t.trim();
  return s && s !== "inherit" ? s : ao;
}
function he(e, t) {
  return t ? {
    size: t.size ?? e.size,
    family: t.family ?? e.family,
    bold: t.bold ?? e.bold,
    italic: t.italic ?? e.italic,
    underline: t.underline ?? e.underline,
    color: t.color !== void 0 ? t.color : e.color
  } : e;
}
function re(e, t) {
  const o = e ?? {}, s = o.size ?? t.size, i = Ft(o, t.family), r = {
    fontSize: s,
    fontFamily: i,
    fontWeight: o.bold ? 700 : 400,
    fontStyle: o.italic ? "italic" : "normal"
  };
  return o.color && (r.color = o.color), r;
}
const Mt = 4, Nt = 4, fo = 3, pt = 5;
function Ve(e) {
  return e === "left" || e === "right" ? e : "center";
}
const Lo = 16, _o = 10, Ae = 14;
function Z(e) {
  var s, i, r;
  const t = [];
  if (e.title && t.push({
    text: e.title,
    fontSize: ((s = e.titleFont) == null ? void 0 : s.size) ?? Ge,
    font: e.titleFont,
    defaultSize: Ge
  }), e.subtitle && t.push({
    text: e.subtitle,
    fontSize: ((i = e.subtitleFont) == null ? void 0 : i.size) ?? We,
    font: e.subtitleFont,
    defaultSize: We
  }), e.customLabel && t.push({
    text: e.customLabel,
    fontSize: ((r = e.customLabelFont) == null ? void 0 : r.size) ?? He,
    font: e.customLabelFont,
    defaultSize: He
  }), t.length === 0) return 0;
  let o = Mt;
  for (const l of t)
    o += l.fontSize + Nt;
  return o + 8;
}
function Ao(e, t, o, s, i, r, l) {
  const n = re(s, { size: i });
  return {
    id: e,
    text: `{${t}|${o}}`,
    left: l,
    top: r,
    textStyle: {
      rich: {
        [t]: n
      }
    }
  };
}
function wo(e, t, o, s, i, r) {
  const l = (o == null ? void 0 : o.size) ?? s, n = ce(t, o, s);
  return {
    id: e,
    type: "line",
    ...r === "left" ? { left: pt } : r === "right" ? { right: pt } : { left: "center" },
    top: i + l + fo,
    shape: { x1: 0, y1: 0, x2: n, y2: 0 },
    style: {
      stroke: _e(o),
      lineWidth: 1
    },
    silent: !0,
    z: 10
  };
}
function Dt(e) {
  var r, l;
  const t = [];
  if (e.title && t.push({
    id: "dfa-title",
    richKey: "dfaTitle",
    text: e.title,
    font: e.titleFont,
    defaultSize: Ge,
    align: Ve(e.titleAlign)
  }), e.subtitle && t.push({
    id: "dfa-subtitle",
    richKey: "dfaSubtitle",
    text: e.subtitle,
    font: e.subtitleFont,
    defaultSize: We,
    align: Ve(e.subtitleAlign)
  }), e.customLabel && t.push({
    id: "dfa-custom-label",
    richKey: "dfaCustomLabel",
    text: e.customLabel,
    font: e.customLabelFont,
    defaultSize: He,
    align: Ve(e.customLabelAlign)
  }), t.length === 0) return {};
  const o = [], s = [];
  let i = Mt;
  for (const n of t) {
    o.push(Ao(n.id, n.richKey, n.text, n.font, n.defaultSize, i, n.align)), (r = n.font) != null && r.underline && s.push(
      wo(`${n.id}-underline`, n.text, n.font, n.defaultSize, i, n.align)
    );
    const a = ((l = n.font) == null ? void 0 : l.size) ?? n.defaultSize;
    i += a + Nt;
  }
  return {
    title: o,
    ...s.length > 0 ? { graphic: s } : {}
  };
}
const It = {
  AED: { symbol: "د.إ", decimal_places: 2, symbol_position: "before" },
  AFN: { symbol: "؋", decimal_places: 2, symbol_position: "before" },
  ALL: { symbol: "L", decimal_places: 2, symbol_position: "before" },
  AMD: { symbol: "֏", decimal_places: 2, symbol_position: "before" },
  ANG: { symbol: "ƒ", decimal_places: 2, symbol_position: "before" },
  AOA: { symbol: "Kz", decimal_places: 2, symbol_position: "before" },
  ARS: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  AUD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  AWG: { symbol: "ƒ", decimal_places: 2, symbol_position: "before" },
  AZN: { symbol: "₼", decimal_places: 2, symbol_position: "before" },
  BAM: { symbol: "KM", decimal_places: 2, symbol_position: "before" },
  BBD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  BDT: { symbol: "৳", decimal_places: 2, symbol_position: "before" },
  BGN: { symbol: "лв", decimal_places: 2, symbol_position: "before" },
  BHD: { symbol: ".د.ب", decimal_places: 3, symbol_position: "before" },
  BIF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  BMD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  BND: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  BOB: { symbol: "Bs.", decimal_places: 2, symbol_position: "before" },
  BOV: { symbol: "BOV", decimal_places: 2, symbol_position: "before" },
  BRL: { symbol: "R$", decimal_places: 2, symbol_position: "before" },
  BSD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  BTN: { symbol: "Nu.", decimal_places: 2, symbol_position: "before" },
  BWP: { symbol: "P", decimal_places: 2, symbol_position: "before" },
  BYN: { symbol: "Br", decimal_places: 2, symbol_position: "before" },
  BZD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  CAD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  CDF: { symbol: "Fr", decimal_places: 2, symbol_position: "before" },
  CHE: { symbol: "CHE", decimal_places: 2, symbol_position: "before" },
  CHF: { symbol: "Fr", decimal_places: 2, symbol_position: "before" },
  CHW: { symbol: "CHW", decimal_places: 2, symbol_position: "before" },
  CLF: { symbol: "CLF", decimal_places: 2, symbol_position: "before" },
  CLP: { symbol: "$", decimal_places: 0, symbol_position: "before" },
  CNY: { symbol: "¥", decimal_places: 2, symbol_position: "before" },
  COP: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  COU: { symbol: "COU", decimal_places: 2, symbol_position: "before" },
  CRC: { symbol: "₡", decimal_places: 2, symbol_position: "before" },
  CUC: { symbol: "CUC", decimal_places: 2, symbol_position: "before" },
  CUP: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  CVE: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  CZK: { symbol: "Kč", decimal_places: 2, symbol_position: "before" },
  DJF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  DKK: { symbol: "kr", decimal_places: 2, symbol_position: "before" },
  DOP: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  DZD: { symbol: "د.ج", decimal_places: 2, symbol_position: "before" },
  EGP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  ERN: { symbol: "Nfk", decimal_places: 2, symbol_position: "before" },
  ETB: { symbol: "Br", decimal_places: 2, symbol_position: "before" },
  EUR: { symbol: "€", decimal_places: 2, symbol_position: "before" },
  FJD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  FKP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  GBP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  GEL: { symbol: "₾", decimal_places: 2, symbol_position: "before" },
  GHS: { symbol: "₵", decimal_places: 2, symbol_position: "before" },
  GIP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  GMD: { symbol: "D", decimal_places: 2, symbol_position: "before" },
  GNF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  GTQ: { symbol: "Q", decimal_places: 2, symbol_position: "before" },
  GYD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  HKD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  HNL: { symbol: "L", decimal_places: 2, symbol_position: "before" },
  HTG: { symbol: "G", decimal_places: 2, symbol_position: "before" },
  HUF: { symbol: "Ft", decimal_places: 2, symbol_position: "before" },
  IDR: { symbol: "Rp", decimal_places: 2, symbol_position: "before" },
  ILS: { symbol: "₪", decimal_places: 2, symbol_position: "before" },
  INR: { symbol: "₹", decimal_places: 2, symbol_position: "before" },
  IQD: { symbol: "ع.د", decimal_places: 3, symbol_position: "before" },
  IRR: { symbol: "﷼", decimal_places: 2, symbol_position: "before" },
  ISK: { symbol: "kr", decimal_places: 0, symbol_position: "before" },
  JMD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  JOD: { symbol: "د.ا", decimal_places: 3, symbol_position: "before" },
  JPY: { symbol: "¥", decimal_places: 0, symbol_position: "before" },
  KES: { symbol: "Sh", decimal_places: 2, symbol_position: "before" },
  KGS: { symbol: "с", decimal_places: 2, symbol_position: "before" },
  KHR: { symbol: "៛", decimal_places: 2, symbol_position: "before" },
  KMF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  KPW: { symbol: "₩", decimal_places: 2, symbol_position: "before" },
  KRW: { symbol: "₩", decimal_places: 0, symbol_position: "before" },
  KWD: { symbol: "د.ك", decimal_places: 3, symbol_position: "before" },
  KYD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  KZT: { symbol: "₸", decimal_places: 2, symbol_position: "before" },
  LAK: { symbol: "₭", decimal_places: 2, symbol_position: "before" },
  LBP: { symbol: "ل.ل", decimal_places: 2, symbol_position: "before" },
  LKR: { symbol: "Rs", decimal_places: 2, symbol_position: "before" },
  LRD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  LSL: { symbol: "L", decimal_places: 2, symbol_position: "before" },
  LYD: { symbol: "ل.د", decimal_places: 3, symbol_position: "before" },
  MAD: { symbol: "د.م.", decimal_places: 2, symbol_position: "before" },
  MDL: { symbol: "L", decimal_places: 2, symbol_position: "before" },
  MGA: { symbol: "Ar", decimal_places: 2, symbol_position: "before" },
  MKD: { symbol: "ден", decimal_places: 2, symbol_position: "before" },
  MMK: { symbol: "K", decimal_places: 2, symbol_position: "before" },
  MNT: { symbol: "₮", decimal_places: 2, symbol_position: "before" },
  MOP: { symbol: "P", decimal_places: 2, symbol_position: "before" },
  MRU: { symbol: "UM", decimal_places: 2, symbol_position: "before" },
  MUR: { symbol: "₨", decimal_places: 2, symbol_position: "before" },
  MVR: { symbol: ".ރ", decimal_places: 2, symbol_position: "before" },
  MWK: { symbol: "MK", decimal_places: 2, symbol_position: "before" },
  MXN: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  MXV: { symbol: "MXV", decimal_places: 2, symbol_position: "before" },
  MYR: { symbol: "RM", decimal_places: 2, symbol_position: "before" },
  MZN: { symbol: "MT", decimal_places: 2, symbol_position: "before" },
  NAD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  NGN: { symbol: "₦", decimal_places: 2, symbol_position: "before" },
  NIO: { symbol: "C$", decimal_places: 2, symbol_position: "before" },
  NOK: { symbol: "kr", decimal_places: 2, symbol_position: "before" },
  NPR: { symbol: "₨", decimal_places: 2, symbol_position: "before" },
  NZD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  OMR: { symbol: "ر.ع.", decimal_places: 3, symbol_position: "before" },
  PAB: { symbol: "B/.", decimal_places: 2, symbol_position: "before" },
  PEN: { symbol: "S/", decimal_places: 2, symbol_position: "before" },
  PGK: { symbol: "K", decimal_places: 2, symbol_position: "before" },
  PHP: { symbol: "₱", decimal_places: 2, symbol_position: "before" },
  PKR: { symbol: "₨", decimal_places: 2, symbol_position: "before" },
  PLN: { symbol: "zł", decimal_places: 2, symbol_position: "before" },
  PYG: { symbol: "₲", decimal_places: 0, symbol_position: "before" },
  QAR: { symbol: "ر.ق", decimal_places: 2, symbol_position: "before" },
  RON: { symbol: "lei", decimal_places: 2, symbol_position: "before" },
  RSD: { symbol: "дин.", decimal_places: 2, symbol_position: "before" },
  RUB: { symbol: "₽", decimal_places: 2, symbol_position: "before" },
  RWF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  SAR: { symbol: "ر.س", decimal_places: 2, symbol_position: "before" },
  SBD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  SCR: { symbol: "₨", decimal_places: 2, symbol_position: "before" },
  SDG: { symbol: "ج.س.", decimal_places: 2, symbol_position: "before" },
  SEK: { symbol: "kr", decimal_places: 2, symbol_position: "before" },
  SGD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  SHP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  SLE: { symbol: "Le", decimal_places: 2, symbol_position: "before" },
  SOS: { symbol: "Sh", decimal_places: 2, symbol_position: "before" },
  SRD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  SSP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  STN: { symbol: "Db", decimal_places: 2, symbol_position: "before" },
  SVC: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  SYP: { symbol: "£", decimal_places: 2, symbol_position: "before" },
  SZL: { symbol: "L", decimal_places: 2, symbol_position: "before" },
  THB: { symbol: "฿", decimal_places: 2, symbol_position: "before" },
  TJS: { symbol: "ЅМ", decimal_places: 2, symbol_position: "before" },
  TMT: { symbol: "m", decimal_places: 2, symbol_position: "before" },
  TND: { symbol: "د.ت", decimal_places: 3, symbol_position: "before" },
  TOP: { symbol: "T$", decimal_places: 2, symbol_position: "before" },
  TRY: { symbol: "₺", decimal_places: 2, symbol_position: "before" },
  TTD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  TWD: { symbol: "NT$", decimal_places: 2, symbol_position: "before" },
  TZS: { symbol: "Sh", decimal_places: 2, symbol_position: "before" },
  UAH: { symbol: "₴", decimal_places: 2, symbol_position: "before" },
  UGX: { symbol: "Sh", decimal_places: 0, symbol_position: "before" },
  USD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  USN: { symbol: "USN", decimal_places: 2, symbol_position: "before" },
  UYI: { symbol: "UYI", decimal_places: 0, symbol_position: "before" },
  UYU: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  UYW: { symbol: "UYW", decimal_places: 2, symbol_position: "before" },
  UZS: { symbol: "so'm", decimal_places: 2, symbol_position: "before" },
  VED: { symbol: "VED", decimal_places: 2, symbol_position: "before" },
  VES: { symbol: "Bs.S", decimal_places: 2, symbol_position: "before" },
  VND: { symbol: "₫", decimal_places: 0, symbol_position: "before" },
  VUV: { symbol: "Vt", decimal_places: 0, symbol_position: "before" },
  WST: { symbol: "T", decimal_places: 2, symbol_position: "before" },
  XAG: { symbol: "XAG", decimal_places: 2, symbol_position: "before" },
  XAU: { symbol: "XAU", decimal_places: 2, symbol_position: "before" },
  XBA: { symbol: "XBA", decimal_places: 2, symbol_position: "before" },
  XBB: { symbol: "XBB", decimal_places: 2, symbol_position: "before" },
  XBC: { symbol: "XBC", decimal_places: 2, symbol_position: "before" },
  XBD: { symbol: "XBD", decimal_places: 2, symbol_position: "before" },
  XCD: { symbol: "$", decimal_places: 2, symbol_position: "before" },
  XDR: { symbol: "XDR", decimal_places: 2, symbol_position: "before" },
  XOF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  XPD: { symbol: "XPD", decimal_places: 2, symbol_position: "before" },
  XPF: { symbol: "Fr", decimal_places: 0, symbol_position: "before" },
  XPT: { symbol: "XPT", decimal_places: 2, symbol_position: "before" },
  XSU: { symbol: "XSU", decimal_places: 2, symbol_position: "before" },
  XTS: { symbol: "XTS", decimal_places: 2, symbol_position: "before" },
  XUA: { symbol: "XUA", decimal_places: 2, symbol_position: "before" },
  XXX: { symbol: "XXX", decimal_places: 2, symbol_position: "before" },
  YER: { symbol: "﷼", decimal_places: 2, symbol_position: "before" },
  ZAR: { symbol: "R", decimal_places: 2, symbol_position: "before" },
  ZMW: { symbol: "ZK", decimal_places: 2, symbol_position: "before" },
  ZWG: { symbol: "ZWG", decimal_places: 2, symbol_position: "before" },
  ZWL: { symbol: "$", decimal_places: 2, symbol_position: "before" }
}, So = /* @__PURE__ */ new Set(["INTEGER", "DECIMAL", "PERCENTAGE", "SCIENTIFIC", "COMPACT"]);
function vo(e) {
  return So.has(e.toUpperCase());
}
function Co(e) {
  return e.toUpperCase() in It;
}
function To(e) {
  return It[e.toUpperCase()];
}
function se(e, t, o) {
  const s = Math.max(0, t), i = Number(e.toFixed(s));
  if (s === 0) {
    const r = Math.round(i);
    return o ? r.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : String(r);
  }
  return o ? i.toLocaleString("en-US", { minimumFractionDigits: s, maximumFractionDigits: s }) : i.toFixed(s);
}
function Fo(e, t) {
  const o = e < 0 ? "-" : "", s = Math.abs(e), i = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"]
  ];
  for (const [r, l] of i)
    if (s >= r) {
      const n = s / r, a = Math.max(0, t);
      let m = n.toFixed(a);
      return m = m.replace(/\.?0+$/, ""), `${o}${m}${l}`;
    }
  return se(e, t, !1);
}
function Mo(e, t) {
  const o = (t ?? "").trim().toUpperCase();
  if (!o)
    return se(e, 2, !0);
  if (o === "INTEGER")
    return se(e, 0, !0);
  if (o === "DECIMAL")
    return se(e, 2, !0);
  if (o === "PERCENTAGE")
    return `${se(e, 0, !1)}%`;
  if (o === "SCIENTIFIC")
    return e.toExponential(2).toUpperCase();
  if (o === "COMPACT")
    return Fo(e, 1);
  if (Co(o)) {
    const s = To(o);
    if (s) {
      const i = se(e, s.decimal_places, !0);
      return s.symbol_position === "after" ? `${i}${s.symbol}` : `${s.symbol}${i}`;
    }
  }
  return vo(o), se(e, 2, !0);
}
const qe = {
  size: 11,
  family: "sans-serif",
  bold: !1,
  italic: !1,
  underline: !1
};
function ae(e) {
  return he(qe, e.xAxisTickFont);
}
function oe(e) {
  return he(qe, e.yAxisTickFont);
}
function No(e) {
  return he(
    he(qe, e.yAxisTickFont),
    e.secondaryYAxisTickFont
  );
}
function W(e) {
  return he(e.labelFont, e.dataLabelFont);
}
function X(e, t = [], o = e.labelFont) {
  const s = Le(o, o.size, t);
  return {
    typography: {
      ...s.align ? { align: s.align } : {},
      ...s.rich ? { rich: s.rich } : s.textStyle
    },
    formatText: s.formatText
  };
}
function yt(e, t, o) {
  const s = Math.max(0, Math.floor(o));
  if (s === 0)
    return Math.round(e).toLocaleString(t);
  const i = String(e), r = i.indexOf("."), l = r === -1 ? 0 : i.length - r - 1;
  if (s >= l)
    return e.toLocaleString(t, {
      minimumFractionDigits: s,
      maximumFractionDigits: s
    });
  const n = Math.pow(10, s);
  return (Math.trunc(e * n) / n).toLocaleString(t, {
    minimumFractionDigits: s,
    maximumFractionDigits: s
  });
}
function Do(e) {
  const t = e.match(/\.(\d+)f\b/i);
  if (t) return parseInt(t[1], 10);
}
function Et(e) {
  if (!e) return !1;
  const t = e.trim();
  return t.startsWith("locale:") || t.startsWith("precision:") || /^\{[^{}]*\}$/.test(t);
}
function $t(e) {
  if (e)
    for (const t of e.split(";")) {
      const [o, s] = t.split(":");
      if (o === "locale" && (s != null && s.trim())) return s.trim();
    }
}
function kt(e, t) {
  const o = e.trim();
  return /^-?\d+$/.test(o) ? Number(o).toLocaleString(t, { useGrouping: !1 }) : /^-?\d+(\.\d+)?$/.test(o) ? Number(o).toLocaleString(t, {
    useGrouping: !1,
    maximumFractionDigits: 20
  }) : e;
}
function Q(e, t) {
  const o = t || "1,000[.00]";
  if (o.startsWith("locale:") || o.startsWith("precision:")) {
    const s = o.split(";");
    let i = "en-US", r = 2;
    for (const l of s) {
      const [n, a] = l.split(":");
      n === "locale" && a && (i = a), n === "precision" && a && (r = parseInt(a, 10));
    }
    return Number.isNaN(r) && (r = 2), yt(e, i, r);
  }
  if (/^\{[^{}]*\}$/.test(o.trim())) {
    const s = Do(o);
    return yt(e, "en-US", s ?? 2);
  }
  switch (o) {
    case "1,000[.00]":
      return e % 1 === 0 ? e.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : e.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "1000.00":
      return e.toFixed(2);
    case "1,000.00":
      return e.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "1000":
      return Math.round(e).toString();
    case "1,000":
      return Math.round(e).toLocaleString("en-US");
    case "1.00K":
      return Math.abs(e) >= 1e6 ? (e / 1e6).toFixed(2) + "M" : Math.abs(e) >= 1e3 ? (e / 1e3).toFixed(2) + "K" : e.toFixed(2);
    case "1K":
      return Math.abs(e) >= 1e6 ? Math.round(e / 1e6) + "M" : Math.abs(e) >= 1e3 ? Math.round(e / 1e3) + "K" : Math.round(e).toString();
    default:
      return e.toFixed(2);
  }
}
function Xe(e) {
  if (!Number.isFinite(e)) return "";
  const t = Math.round(e * 10) / 10;
  return `${Number.isInteger(t) ? String(t) : t.toFixed(1)}%`;
}
function k(e, t, o, s, i) {
  if (Et(t))
    return Q(e, t);
  if (o) {
    if (i)
      return Mo(e, i);
    if (s)
      return s;
  }
  return Q(e, t);
}
function Io(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1;
  return e.segments.map(
    (i) => k(i.value, o, s, i.formattedValue, i.unitFormatCode)
  );
}
function Qe(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [];
  for (const r of e.series)
    r.values.forEach((l, n) => {
      var a, m;
      i.push(
        k(l, o, s, (a = r.formattedValues) == null ? void 0 : a[n], (m = r.unitFormatCodes) == null ? void 0 : m[n])
      ), i.push(String(l));
    });
  return i;
}
function Eo(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = e.indicators.map((r) => r.name);
  for (const r of e.series)
    r.values.forEach((l, n) => {
      var a, m;
      i.push(
        k(l, o, s, (a = r.formattedValues) == null ? void 0 : a[n], (m = r.unitFormatCodes) == null ? void 0 : m[n])
      );
    });
  return i;
}
function $o(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [...e.xCategories, ...e.yCategories];
  return e.cells.forEach((r, l) => {
    var n, a;
    i.push(
      k(r[2], o, s, (n = e.formattedCells) == null ? void 0 : n[l], (a = e.unitFormatCells) == null ? void 0 : a[l])
    );
  }), i.push(Q(e.min, o), Q(e.max, o)), i;
}
function ko(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [];
  for (const r of e.nodes) {
    r.name && i.push(r.name), i.push(
      k(r.value, o, s, r.formattedValue, r.unitFormatCode)
    );
    for (const l of r.children ?? [])
      l.name && i.push(l.name), i.push(
        k(l.value, o, s, l.formattedValue, l.unitFormatCode)
      );
  }
  return i;
}
function Po(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [];
  function r(l) {
    for (const n of l)
      n.name && i.push(n.name), i.push(
        k(n.value, o, s, n.formattedValue, n.unitFormatCode)
      ), n.children && n.children.length > 0 && r(n.children);
  }
  return r(e.nodes), i;
}
function Bo(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [];
  function r(l) {
    for (const n of l)
      n.name && i.push(n.name), i.push(
        k(n.value, o, s, n.formattedValue, n.unitFormatCode)
      ), n.children && n.children.length > 0 && r(n.children);
  }
  return r(e.nodes), i;
}
function Ro(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [];
  function r(l) {
    for (const n of l)
      n.name && i.push(n.name), i.push(
        k(n.value, o, s, n.formattedValue, n.unitFormatCode)
      ), n.children && n.children.length > 0 && r(n.children);
  }
  return r(e.nodes), i;
}
function Uo(e) {
  const t = [];
  for (const o of e.series) {
    for (const s of o.points)
      s.label && t.push(s.label);
    t.push(o.name);
  }
  return t;
}
function zo(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = [...e.categories, e.leftSeries.name, e.rightSeries.name];
  return e.leftSeries.values.forEach((r, l) => {
    var n, a;
    i.push(
      k(
        Math.abs(r),
        o,
        s,
        (n = e.leftSeries.formattedValues) == null ? void 0 : n[l],
        (a = e.leftSeries.unitFormatCodes) == null ? void 0 : a[l]
      )
    );
  }), e.rightSeries.values.forEach((r, l) => {
    var n, a;
    i.push(
      k(
        r,
        o,
        s,
        (n = e.rightSeries.formattedValues) == null ? void 0 : n[l],
        (a = e.rightSeries.unitFormatCodes) == null ? void 0 : a[l]
      )
    );
  }), i;
}
function me(e, t = "top", o, s, i, r = !1, l) {
  var p, _;
  const n = r || e.dataLabelPosition === "inside" ? "inside" : t, a = e.dataLabelNumberFormat ?? "1,000[.00]", m = e.useUnitDefaultFormat ?? !1, d = W(e), L = (i ?? []).map((u, c) => {
    const x = r ? Xe(u) : k(
      u,
      a,
      m,
      o == null ? void 0 : o[c],
      s == null ? void 0 : s[c]
    );
    return e.dataLabelShowCategory && (l != null && l[c]) ? `${l[c]}: ${x}` : x;
  }), h = Le(d, d.size, L), y = {
    ...h.align ? { align: h.align } : {},
    ...h.rich ? { rich: h.rich } : h.textStyle,
    ...e.dataLabelRotation != null && e.dataLabelRotation !== 0 ? { rotate: e.dataLabelRotation } : {},
    ...(p = e.dataLabelBackgroundColor) != null && p.trim() ? {
      backgroundColor: e.dataLabelBackgroundColor.trim(),
      padding: [2, 4]
    } : {},
    ...(_ = e.dataLabelBorderColor) != null && _.trim() ? {
      borderColor: e.dataLabelBorderColor.trim(),
      borderWidth: e.dataLabelBorderWidth != null && e.dataLabelBorderWidth > 0 ? e.dataLabelBorderWidth : 1
    } : {},
    ...e.dataLabelBorderRadius != null && e.dataLabelBorderRadius > 0 ? { borderRadius: e.dataLabelBorderRadius } : {},
    ...e.dataLabelOffsetX != null && e.dataLabelOffsetX !== 0 || e.dataLabelOffsetY != null && e.dataLabelOffsetY !== 0 ? {
      offset: [
        e.dataLabelOffsetX ?? 0,
        e.dataLabelOffsetY ?? 0
      ]
    } : {},
    formatter: (u) => {
      const c = Number((u == null ? void 0 : u.value) ?? 0);
      if (r)
        return !Number.isFinite(c) || Math.round(c * 10) / 10 === 0 ? "" : h.formatText(Xe(c));
      const x = (u == null ? void 0 : u.dataIndex) ?? -1, f = o == null ? void 0 : o[x], b = s == null ? void 0 : s[x];
      let v = k(c, a, m, f, b);
      if (e.dataLabelShowCategory) {
        const C = x >= 0 && (l == null ? void 0 : l[x]) || ((u == null ? void 0 : u.name) != null && String(u.name).length > 0 ? String(u.name) : "");
        C && (v = `${C}: ${v}`);
      }
      return h.formatText(v);
    }
  };
  return e.dataLabelVisibility === "onHover" ? {
    label: { show: !1 },
    emphasis: {
      label: {
        show: !0,
        position: n,
        ...y
      }
    }
  } : {
    label: {
      show: !0,
      position: n,
      ...y
    }
  };
}
const et = 40, j = 120, ne = 10, tt = 0.55, go = 22;
function xt(e, t, o) {
  var m;
  const s = Math.max(20, t - go), i = tt * o.size, r = Math.max(1, Math.floor(s / i)), l = e.split(/\s+/);
  if (l.length <= 1)
    return e.length <= r ? e : ((m = e.match(new RegExp(`(.{1,${r}})`, "g"))) == null ? void 0 : m.join(`
`)) ?? e;
  const n = [];
  let a = "";
  for (const d of l) {
    const L = a ? `${a} ${d}` : d;
    if (L.length <= r)
      a = L;
    else if (a && (n.push(a), a = ""), d.length > r) {
      const h = d.match(new RegExp(`(.{1,${r}})`, "g")) ?? [d];
      for (let y = 0; y < h.length - 1; y++) n.push(h[y]);
      a = h[h.length - 1];
    } else
      a = d;
  }
  return a && n.push(a), n.join(`
`);
}
function J(e) {
  if (!(e === void 0 || e === ""))
    return Number(e);
}
function ot(e) {
  const t = e.chartVariant;
  return t === "stacked-vertical" || t === "stacked-horizontal" || t === "stacked";
}
function Oo(e) {
  return e != null;
}
const ft = 28, Lt = 28, Be = 62, st = 50, Vo = 16, _t = Be, Pt = 220, rt = 14;
function Bt(e, t) {
  if (!e.length) return _t;
  const o = e.reduce(
    (i, r) => Math.max(i, String(r ?? "").length),
    0
  ), s = Math.ceil(o * t.size * tt) + rt;
  return Math.min(Math.max(s, _t), Pt);
}
function At(e, t) {
  const o = t.dataLabelNumberFormat;
  if (!e || !Et(o)) return Be;
  let s = 0;
  for (const a of e.series)
    for (const m of a.values)
      Number.isFinite(m) && (s = Math.max(s, Math.abs(m)));
  const i = t.yAxisMax != null ? Math.abs(Number(t.yAxisMax)) : NaN;
  Number.isFinite(i) && (s = Math.max(s, i));
  const r = Q(s, o), l = oe(t), n = Math.ceil(r.length * l.size * tt) + rt;
  return Math.min(Math.max(n, Be), Pt);
}
function Go(e) {
  return Math.max(24, e - rt);
}
function Rt(e, t) {
  return t ? Be + (e.secondaryYAxisLabel ? st : 0) : 0;
}
function Wo(e, t) {
  return Rt(e, t) + Vo + j + ne;
}
function we(e, t, o = !0) {
  return !o || !e.enableSecondaryYAxis || !t ? !1 : t.series.some((s) => s.yAxisIndex === 1);
}
function Ho(e, t, o = !0) {
  return we(e, t, o) && e.showSecondaryYAxis !== !1;
}
function it(e, t, o, s = !0) {
  if (we(e, t, s))
    return o.yAxisIndex === 1 ? 1 : 0;
}
function Ut(e) {
  return e.showLegend && (e.legendBackground || e.legendBorder) ? 12 : 0;
}
function lt(e) {
  const t = Z(e);
  return t > 0 ? t + Lo : 0;
}
function zt(e, t) {
  const o = Z(e);
  if (!e.showLegend || e.legendPosition !== "top")
    return 20 + o;
  const s = Se(e, t), i = lt(e);
  return (i > 0 ? i : Ae) + s + Ut(e) + _o;
}
function gt(e, t) {
  return t ? e.seriesSymbolSize ?? (e.type === "scatter" ? 10 : 6) : 14;
}
function Se(e, t) {
  const o = gt(e, t);
  return Math.max(o, e.legendFont.size) + 8;
}
function ve(e, t, o) {
  return q(e, e.size, t, o);
}
function nt(e) {
  const t = e.dataLabelNumberFormat;
  if (!t) return;
  const o = t.trim();
  if (o.startsWith("locale:") || o.startsWith("precision:") || /^\{[^{}]*\}$/.test(o))
    return (i) => {
      const r = typeof i == "number" ? i : Number(i);
      return Number.isFinite(r) ? Q(r, t) : String(i);
    };
}
function Ue(...e) {
  const t = e.filter(Boolean);
  if (t.length !== 0)
    return t.length === 1 ? t[0] : (o) => t.reduce((s, i) => i(s), o);
}
function Ce(e, t, o, s, i) {
  if (!e) return {};
  const r = de(e, t, o);
  return {
    name: r.name,
    nameLocation: "middle",
    nameGap: s,
    nameTextStyle: {
      ...r.nameTextStyle,
      ...i ? { align: i } : {}
    }
  };
}
function Yo(e) {
  const t = (e ?? "").toUpperCase().replace(/-/g, "_");
  return t === "SOLID" ? "solid" : t === "DOT" || t === "DOTTED" ? "dotted" : "dashed";
}
function H(e, t) {
  if (!e)
    return { show: t };
  const o = e.width;
  if (!(o === void 0 ? t : o > 0)) return { show: !1 };
  const i = {};
  return e.color && (i.color = e.color), o !== void 0 && (i.width = o), {
    show: !0,
    ...Object.keys(i).length > 0 ? { lineStyle: i } : {}
  };
}
function K(e, t, o = !0) {
  if (e) {
    if (!e.show) return { show: !1 };
    const s = {
      type: Yo(e.dashStyle),
      color: e.color || "#e0e0e0",
      opacity: 0.9
    };
    return e.width !== void 0 && (s.width = e.width), { show: !0, lineStyle: s };
  }
  return o ? t ? { show: !0, lineStyle: { type: "dashed", color: "#e0e0e0", opacity: 0.9 } } : { show: !1 } : { show: !1 };
}
function Y(e) {
  return { show: e !== !1 };
}
function ee(e, t) {
  var n;
  const o = String(e ?? "");
  if (!o) return o;
  const s = 16;
  if (o.length <= s) return o;
  const i = o.split(/\s+/);
  if (i.length <= 1)
    return ((n = o.match(new RegExp(`(.{1,${s}})`, "g"))) == null ? void 0 : n.join(`
`)) ?? o;
  const r = [];
  let l = "";
  for (const a of i) {
    const m = l ? `${l} ${a}` : a;
    if (m.length <= s)
      l = m;
    else if (l && r.push(l), a.length > s) {
      const d = a.match(new RegExp(`(.{1,${s}})`, "g")) ?? [a];
      for (let L = 0; L < d.length - 1; L++) r.push(d[L]);
      l = d[d.length - 1] ?? "";
    } else
      l = a;
  }
  return l && r.push(l), r.join(`
`);
}
function pe(e, t) {
  return t === "x" ? e.showXAxisTickLabels !== void 0 ? e.showXAxisTickLabels : e.showXAxis : e.showYAxisTickLabels !== void 0 ? e.showYAxisTickLabels : e.showYAxis;
}
function ye(e, t, o, s, i = !0, r) {
  const l = e.legendPosition, n = Z(e), a = Ho(e, s, i), m = r ?? At(s, e);
  let d = e.showYAxis ? m : 15, L = a ? At(s, e) : 15, h = 20 + n, y = e.showXAxis ? 56 : 15;
  e.yAxisLabel && (d += Lt), a && e.secondaryYAxisLabel && (L += st), e.xAxisLabel && (y += ft);
  const p = Se(e, o);
  return e.showLegend && !e.legendFloating ? l === "top" ? h = zt(e, o) : l === "bottom" ? y = (e.showXAxis ? 56 : 15) + p + (e.xAxisLabel ? ft : 0) : l === "left" ? d = j + (e.showYAxis ? m : 15) + (e.yAxisLabel ? Lt : 0) : l === "right" && (L = Wo(e, a)) : e.showLegend && e.legendFloating && a && l === "right" && (L = Rt(e, a) + 15), e.grid && (e.grid.left !== void 0 && (d = e.grid.left), e.grid.right !== void 0 && (L = e.grid.right), e.grid.top !== void 0 && (h = e.grid.top), e.grid.bottom !== void 0 && (y = e.grid.bottom)), {
    grid: {
      left: d,
      right: L,
      top: h,
      bottom: y,
      containLabel: !1
    }
  };
}
function at(e, t) {
  if (!t.showXAxis)
    return { xAxis: { show: !1 } };
  const o = t.xAxisLabelRotation !== void 0 ? t.xAxisLabelRotation : t.labelOrientation === "vertical" ? 45 : 0, s = t.xAxisLabelWrap, i = pe(t, "x"), r = $t(t.dataLabelNumberFormat);
  return {
    xAxis: {
      show: !0,
      type: "category",
      data: e.categories,
      axisLine: H(t.xAxisLine, !0),
      axisTick: i ? Y(t.xAxisTicks) : { show: !1 },
      splitLine: K(t.xAxisGrid, t.showGrid, !1),
      ...t.xAxisLabel ? Ce(
        t.xAxisLabel,
        t.xAxisLabelFont,
        t.labelFont.size,
        30,
        t.xAxisLabelAlign
      ) : {},
      axisLabel: i ? ve(
        ae(t),
        { rotate: o },
        Ue(
          r ? (l) => kt(String(l), r) : void 0,
          s ? (l) => ee(l) : void 0
        )
      ) : { show: !1 }
    }
  };
}
function wt(e, t) {
  const o = J(e.yAxisMin), s = J(e.yAxisMax), i = J(e.yAxisInterval), r = o !== void 0 || s !== void 0, l = ot(e);
  let n;
  return r ? n = {
    scale: !1,
    // Stacked charts still need min 0 when the user only set a max.
    ...o !== void 0 ? { min: o } : l ? { min: 0 } : {},
    ...s !== void 0 ? { max: s } : {},
    ...i !== void 0 ? { interval: i } : {}
  } : l ? n = { scale: !1, min: 0 } : n = { scale: !0 }, {
    show: t,
    type: "value",
    ...n,
    splitLine: t ? K(e.yAxisGrid, e.showGrid, !0) : { show: !1 },
    axisLine: H(e.yAxisLine, t),
    axisTick: t && pe(e, "y") ? Y(e.yAxisTicks) : { show: !1 },
    ...t && e.yAxisLabel ? Ce(
      e.yAxisLabel,
      e.yAxisLabelFont,
      e.labelFont.size,
      50,
      e.yAxisLabelAlign
    ) : {},
    axisLabel: t && pe(e, "y") ? ve(
      oe(e),
      {
        ...e.yAxisLabelRotation !== void 0 ? { rotate: e.yAxisLabelRotation } : {}
      },
      Ue(
        nt(e),
        e.yAxisLabelWrap ? (a) => ee(a) : void 0
      )
    ) : { show: !1 }
  };
}
function Xo(e, t) {
  const o = J(e.secondaryYAxisMin), s = J(e.secondaryYAxisMax), i = J(e.secondaryYAxisInterval), r = o !== void 0 || s !== void 0, l = ot(e);
  let n;
  return r ? n = {
    scale: !1,
    ...o !== void 0 ? { min: o } : l ? { min: 0 } : {},
    ...s !== void 0 ? { max: s } : {},
    ...i !== void 0 ? { interval: i } : {}
  } : l ? n = { scale: !1, min: 0 } : n = { scale: !0 }, {
    show: t,
    type: "value",
    position: "right",
    ...n,
    // Avoid double grid lines; primary axis owns splitLine.
    splitLine: { show: !1 },
    axisLine: H(e.secondaryYAxisLine ?? e.yAxisLine, t),
    axisTick: t && (e.secondaryYAxisTicks !== void 0 ? e.secondaryYAxisTicks : e.yAxisTicks !== !1) ? Y(
      e.secondaryYAxisTicks !== void 0 ? e.secondaryYAxisTicks : e.yAxisTicks
    ) : { show: !1 },
    ...t && e.secondaryYAxisLabel ? Ce(
      e.secondaryYAxisLabel,
      e.secondaryYAxisLabelFont,
      e.labelFont.size,
      st
    ) : {},
    axisLabel: t ? ve(
      No(e),
      {
        ...e.secondaryYAxisLabelRotation !== void 0 ? { rotate: e.secondaryYAxisLabelRotation } : {}
      },
      nt(e)
    ) : { show: !1 }
  };
}
function mt(e, t, o, s = !0) {
  if (!we(e, o, s) || !o)
    return e.showYAxis ? { yAxis: wt(e, !0) } : { yAxis: { show: !1 } };
  const i = o.series.some((a) => a.yAxisIndex !== 1), r = o.series.some((a) => a.yAxisIndex === 1), l = e.showYAxis && i, n = e.showSecondaryYAxis !== !1 && r;
  return {
    yAxis: [
      wt(e, l),
      Xo(e, n)
    ]
  };
}
function Ot(e, t, o) {
  if (!t.showYAxis)
    return { yAxis: { show: !1 } };
  const s = o !== void 0 && !t.yAxisLabelRotation, i = t.yAxisLabelWrap, r = pe(t, "y"), l = $t(t.dataLabelNumberFormat);
  return {
    yAxis: {
      show: !0,
      type: "category",
      data: e.categories,
      axisLine: H(t.yAxisLine, !0),
      axisTick: r ? Y(t.yAxisTicks) : { show: !1 },
      splitLine: K(t.yAxisGrid, t.showGrid, !1),
      ...t.yAxisLabel ? Ce(
        t.yAxisLabel,
        t.yAxisLabelFont,
        t.labelFont.size,
        50,
        t.yAxisLabelAlign
      ) : {},
      axisLabel: r ? ve(
        oe(t),
        {
          ...t.yAxisLabelRotation !== void 0 ? { rotate: t.yAxisLabelRotation } : {},
          ...s && !i ? { width: Go(o), overflow: "truncate" } : {}
        },
        Ue(
          l ? (n) => kt(String(n), l) : void 0,
          i ? (n) => ee(n) : void 0
        )
      ) : { show: !1 }
    }
  };
}
function Vt(e) {
  if (!e.showXAxis)
    return { xAxis: { show: !1 } };
  const t = e.xAxisLabelRotation !== void 0 ? e.xAxisLabelRotation : e.labelOrientation === "vertical" ? 45 : 0, o = J(e.yAxisMin), s = J(e.yAxisMax), i = J(e.yAxisInterval), r = o !== void 0 || s !== void 0, l = ot(e), n = pe(e, "x");
  let a = {};
  return r ? a = {
    scale: !1,
    ...o !== void 0 ? { min: o } : l ? { min: 0 } : {},
    ...s !== void 0 ? { max: s } : {},
    ...i !== void 0 ? { interval: i } : {}
  } : l && (a = { scale: !1, min: 0 }), {
    xAxis: {
      show: !0,
      type: "value",
      ...a,
      splitLine: K(e.xAxisGrid, e.showGrid, !0),
      axisLine: H(e.xAxisLine, !0),
      axisTick: n ? Y(e.xAxisTicks) : { show: !1 },
      ...e.xAxisLabel ? Ce(
        e.xAxisLabel,
        e.xAxisLabelFont,
        e.labelFont.size,
        30,
        e.xAxisLabelAlign
      ) : {},
      axisLabel: n ? ve(
        ae(e),
        t !== 0 ? { rotate: t } : {},
        Ue(
          nt(e),
          e.xAxisLabelWrap ? (m) => ee(m) : void 0
        )
      ) : { show: !1 }
    }
  };
}
function te(e, t, o, s, i, r, l = !0) {
  var _, u, c;
  if (!e.showLegend)
    return { legend: { show: !1 } };
  if (s && s.length === 0)
    return { legend: { show: !1 } };
  const n = e.legendPosition, a = n === "left" || n === "right", m = Oo(t), d = gt(e, o), L = Se(e, o), h = a ? (s ?? []).flatMap(
    (x) => xt(x, j, e.legendFont).split(`
`)
  ) : s ?? [], y = Le(
    e.legendFont,
    e.legendFont.size,
    h,
    "left"
  ), p = {
    show: !0,
    orient: a ? "vertical" : "horizontal",
    itemWidth: d,
    itemHeight: d,
    itemGap: 14,
    textStyle: y.rich ? { rich: y.rich } : { ...y.textStyle },
    ...o ? { icon: o } : {},
    ...e.legendFloating ? { floating: !0 } : {},
    ...e.legendBackground ? { backgroundColor: e.legendBackground } : {},
    ...(_ = e.legendBorder) != null && _.color ? { borderColor: e.legendBorder.color } : {},
    ...((u = e.legendBorder) == null ? void 0 : u.width) != null ? { borderWidth: e.legendBorder.width } : {},
    ...((c = e.legendBorder) == null ? void 0 : c.radius) != null ? { borderRadius: e.legendBorder.radius } : {},
    ...e.legendBackground || e.legendBorder ? { padding: [6, 10] } : {}
  };
  return s && s.length > 0 && (p.data = s), n === "top" ? (p.top = Ae, p.left = "center") : n === "bottom" ? (p.bottom = 0, p.left = "center") : n === "left" ? (p.left = ne, p.top = "center") : (p.right = ne, p.top = "center"), a && (p.width = j), (a || e.legendFont.underline) && (p.formatter = (x) => {
    let f = x;
    return a && (f = xt(x, j, e.legendFont)), e.legendFont.underline ? f.split(`
`).map((b) => y.formatText(b)).join(`
`) : f;
  }), m && (p.type = "scroll", p.pageFormatter = "{current}/{total}", a || (p.height = Math.min(et, L))), { legend: p };
}
function le(e, t) {
  return t ? `<div style="display:flex;gap:6px;margin-top:2px"><span style="opacity:0.65;white-space:nowrap">${e}:</span><span>${t}</span></div>` : "";
}
function Ko(e, t, o, s, i) {
  var A, S, T, w, I, E, D;
  const r = e, l = (r == null ? void 0 : r.seriesIndex) ?? 0, n = (r == null ? void 0 : r.dataIndex) ?? 0, a = (S = (A = t.series[l]) == null ? void 0 : A.formattedValues) == null ? void 0 : S[n], m = (w = (T = t.series[l]) == null ? void 0 : T.unitFormatCodes) == null ? void 0 : w[n], d = k(Number((r == null ? void 0 : r.value) ?? 0), s, i, a, m), L = (r == null ? void 0 : r.seriesName) ?? ((I = t.series[l]) == null ? void 0 : I.name) ?? "", h = (D = (E = t.pointMeta) == null ? void 0 : E[l]) == null ? void 0 : D[n], y = o.tooltipFields ?? {}, p = y.indicator !== !1, _ = y.unit === !0, u = y.timePeriod !== !1, c = y.subgroup !== !1, x = y.area !== !1, f = y.source === !0, b = y.footnote === !0, v = Array.isArray(r == null ? void 0 : r.axisValue) ? r.axisValue[0] ?? "" : (r == null ? void 0 : r.axisValueLabel) ?? (r == null ? void 0 : r.name) ?? "", C = !!(h != null && h.indicatorName) && L.trim().toLowerCase() === h.indicatorName.trim().toLowerCase(), N = !p && C ? v || "" : L, M = (r == null ? void 0 : r.marker) ?? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${(r == null ? void 0 : r.color) ?? "#aaa"};margin-right:4px;vertical-align:middle"></span>`;
  let F = N ? `<div style="font-weight:600;margin-bottom:6px;display:flex;align-items:center">${M}${N}</div>` : `<div style="margin-bottom:6px;display:flex;align-items:center">${M}</div>`;
  return F += `<div style="font-size:1.05em;font-weight:600;margin-bottom:4px">${d}</div>`, h ? (F += le("Indicator", p ? h.indicatorName : void 0), F += le("Unit", _ ? h.unitName : void 0), F += le("Time Period", u ? h.timePeriodName : void 0), F += le("Subgroup", c ? h.subgroupName : void 0), F += le("Area", x ? h.areaName : void 0), f && h.sourceName && (F += le("Source", h.sourceName)), b && h.footnote && (F += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.1);font-size:0.9em;opacity:0.8">${h.footnote}</div>`)) : v && N !== v && (F += le("Category", v)), `<div style="min-width:160px;max-width:280px;line-height:1.5">${F}</div>`;
}
function xe(e, t, o = !1) {
  if ((e == null ? void 0 : e.tooltipEnabled) === !1)
    return { tooltip: { show: !1 } };
  const s = (e == null ? void 0 : e.useUnitDefaultFormat) ?? !1, i = (e == null ? void 0 : e.dataLabelNumberFormat) ?? "1,000[.00]";
  return o && t ? {
    tooltip: {
      trigger: (e == null ? void 0 : e.tooltipTrigger) === "item" ? "item" : "axis",
      confine: !0,
      formatter: (l) => {
        const n = Array.isArray(l) ? l : [l];
        if (n.length === 0) return "";
        const a = n[0];
        let m = `<div style="font-weight:600;margin-bottom:4px">${a.axisValueLabel ?? a.name ?? ""}</div>`;
        for (const d of n) {
          const L = d, h = Xe(Number(L.value ?? 0));
          m += `<div>${L.marker ?? ""} ${L.seriesName}: <b>${h}</b></div>`;
        }
        return m;
      }
    }
  } : (e == null ? void 0 : e.tooltipTrigger) === "item" && t ? {
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (l) => Ko(l, t, e, i, s)
    }
  } : s && (t == null ? void 0 : t.series.some((l) => {
    var n, a;
    return ((n = l.formattedValues) == null ? void 0 : n.some(Boolean)) || ((a = l.unitFormatCodes) == null ? void 0 : a.some(Boolean));
  })) && t ? {
    tooltip: {
      trigger: "axis",
      confine: !0,
      formatter: (l) => {
        var d, L, h, y;
        const n = Array.isArray(l) ? l : [l];
        if (n.length === 0) return "";
        const a = n[0];
        let m = `<div style="font-weight:600;margin-bottom:4px">${a.axisValueLabel ?? a.name ?? ""}</div>`;
        for (const p of n) {
          const _ = p, u = _.seriesIndex ?? 0, c = _.dataIndex ?? 0, x = (L = (d = t.series[u]) == null ? void 0 : d.formattedValues) == null ? void 0 : L[c], f = (y = (h = t.series[u]) == null ? void 0 : h.unitFormatCodes) == null ? void 0 : y[c], b = k(Number(_.value ?? 0), i, s, x, f);
          m += `<div>${_.marker ?? ""} ${_.seriesName}: <b>${b}</b></div>`;
        }
        return m;
      }
    }
  } : {
    tooltip: {
      trigger: "axis",
      confine: !0,
      formatter: (l) => {
        var d, L, h, y;
        const n = Array.isArray(l) ? l : [l];
        if (n.length === 0) return "";
        const a = n[0];
        let m = `<div style="font-weight:600;margin-bottom:4px">${a.axisValueLabel ?? a.name ?? ""}</div>`;
        for (const p of n) {
          const _ = p, u = _.seriesIndex ?? 0, c = _.dataIndex ?? 0, x = (L = (d = t == null ? void 0 : t.series[u]) == null ? void 0 : d.formattedValues) == null ? void 0 : L[c], f = (y = (h = t == null ? void 0 : t.series[u]) == null ? void 0 : h.unitFormatCodes) == null ? void 0 : y[c], b = k(Number(_.value ?? 0), i, s, x, f);
          m += `<div>${_.marker ?? ""} ${_.seriesName}: <b>${b}</b></div>`;
        }
        return m;
      }
    }
  };
}
function Gt(e) {
  if ("categories" in e && "series" in e) {
    const t = e;
    return t.categories.length === 0 || t.series.length === 0;
  }
  if ("segments" in e)
    return e.segments.length === 0;
  if ("series" in e && "xAxisLabel" in e)
    return e.series.length === 0;
  if ("kind" in e && e.kind === "map") {
    const t = e.features;
    return !t || t.length === 0;
  }
  return !1;
}
function Te(e, t, o) {
  return e.color ? e.color : e.values && e.values.length === 0 ? o.primaryColor : o.palette[t % o.palette.length] ?? o.primaryColor;
}
function Fe(e, t) {
  var o;
  return ((o = e.lineStyle) == null ? void 0 : o.width) ?? t.lineThickness ?? 2;
}
function Me(e) {
  var o;
  const t = (o = e.lineStyle) == null ? void 0 : o.type;
  return t && t.length > 0 ? t : void 0;
}
function ie(e, t) {
  var m, d;
  const o = t.seriesSymbol ?? "circle", s = o !== "none", i = e.showSymbol ?? s, r = i ? e.symbol ?? (s ? o : "circle") : "none", l = e.symbolSize ?? t.seriesSymbolSize ?? 6, n = ((m = e.itemStyle) == null ? void 0 : m.borderWidth) ?? t.seriesSymbolBorderWidth, a = ((d = e.itemStyle) == null ? void 0 : d.borderColor) ?? e.borderColor ?? t.seriesSymbolBorderColor;
  return {
    showSymbol: i,
    symbol: i ? r : "none",
    symbolSize: l,
    ...n != null && i ? { borderWidth: n } : {},
    ...a != null && i ? { borderColor: a } : {}
  };
}
function ct(e, t) {
  return e ? e === "area" ? "line" : e === "line" || e === "bar" || e === "scatter" ? e : t : t;
}
function Zo(e) {
  return e === void 0 || e === "area";
}
function Ne(e, t) {
  var o;
  return ((o = e.itemStyle) == null ? void 0 : o.color) ?? t;
}
function ze(e, t) {
  if (!t) return e;
  const o = e != null && e.itemStyle && typeof e.itemStyle == "object" ? e.itemStyle : {};
  return {
    ...e ?? {},
    itemStyle: {
      ...o,
      color: t
    }
  };
}
function De(e, t, o) {
  const s = !!(t != null && t.some((r) => !!(r != null && r.trim()))), i = !!(o != null && o.some((r) => !!(r != null && r.trim())));
  return !s && !i ? e : e.map((r, l) => {
    var m, d;
    const n = (m = t == null ? void 0 : t[l]) == null ? void 0 : m.trim();
    if (n) return { value: r, itemStyle: { color: n } };
    const a = (d = o == null ? void 0 : o[l]) == null ? void 0 : d.trim();
    return a ? { value: r, itemStyle: { color: a } } : r;
  });
}
function Us(e, t) {
  return De(e, void 0, t);
}
function jo(e) {
  return e.chartVariant === "polar_line";
}
function Jo(e) {
  const t = Z(e), o = e.legendPosition, s = e.showLegend ? Se(e) : 0, i = o === "top" && e.showLegend, r = o === "bottom" && e.showLegend, l = (o === "left" || o === "right") && e.showLegend, n = t + (i ? s + 20 : t > 0 ? 8 : 0), a = r ? s + 8 : 0, m = Math.min(18, n * 0.04 + (i ? 3 : 0)), d = `${Math.min(58, 50 + m - a * 0.02)}%`, h = n > 40 || a > 20 || l ? "58%" : "68%";
  return { center: ["50%", d], radius: h };
}
function qo(e, t) {
  const s = ie(e.series[0] ?? {}, t), i = s.showSymbol ? s.symbol : "circle", r = Jo(t), l = e.series.length, n = ae(t), a = oe(t), m = e.series.map((h, y) => {
    var v;
    const p = t.showLabels ? me(t, "top", h.formattedValues, h.unitFormatCodes, h.values, !1, e.categories) : { label: { show: !1 } }, _ = Te(h, y, t), u = Ne(h, _), c = Fe(h, t), x = Me(h), f = ie(h, t), b = ze(
      p.emphasis,
      h.emphasisColor
    );
    return {
      name: h.name,
      type: "line",
      coordinateSystem: "polar",
      data: De(h.values, (v = e.pointColors) == null ? void 0 : v[y], e.categoryColors),
      smooth: !1,
      lineStyle: {
        width: c,
        color: _,
        ...x ? { type: x } : {}
      },
      itemStyle: {
        color: u,
        ...f.borderWidth != null ? { borderWidth: f.borderWidth } : {},
        ...f.borderColor != null ? { borderColor: f.borderColor } : {}
      },
      showSymbol: f.showSymbol,
      symbol: f.showSymbol ? f.symbol : "none",
      symbolSize: f.symbolSize,
      label: p.label,
      ...b ? { emphasis: b } : {}
    };
  }), d = t.yAxisMin === void 0 || t.yAxisMin === "" ? void 0 : Number(t.yAxisMin), L = t.yAxisMax === void 0 || t.yAxisMax === "" ? void 0 : Number(t.yAxisMax);
  return {
    polar: {
      center: r.center,
      radius: r.radius
    },
    angleAxis: {
      type: "category",
      data: e.categories,
      show: t.showXAxis,
      clockwise: !0,
      startAngle: 90,
      axisLabel: {
        show: t.showXAxis,
        ...q(
          n,
          n.size,
          void 0,
          t.xAxisLabelWrap ? (h) => ee(h) : void 0
        )
      },
      axisLine: H(t.xAxisLine, t.showXAxis),
      axisTick: Y(t.xAxisTicks !== void 0 ? t.xAxisTicks : t.showXAxis),
      splitLine: K(t.xAxisGrid, t.showGrid, !0)
    },
    radiusAxis: {
      type: "value",
      show: t.showYAxis,
      min: d,
      max: L,
      name: t.yAxisLabel || void 0,
      nameGap: 12,
      axisLabel: {
        show: t.showYAxis,
        ...q(
          a,
          a.size,
          void 0,
          t.yAxisLabelWrap ? (h) => ee(h) : void 0
        )
      },
      axisLine: H(t.yAxisLine, t.showYAxis),
      axisTick: Y(t.yAxisTicks !== void 0 ? t.yAxisTicks : t.showYAxis),
      splitLine: K(t.yAxisGrid, t.showGrid, !0)
    },
    // Hide cartesian axes left over when switching from a cartesian chart.
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    series: m,
    ...te(t, l, i, e.series.map((h) => h.name)),
    ...xe(t, e)
  };
}
function Qo(e, t) {
  if (jo(t))
    return qo(e, t);
  const o = t.chartVariant === "curved", s = t.chartVariant === "stepped" ? "end" : !1, i = !!t.inverted, r = ie(e.series[0] ?? {}, t), l = r.showSymbol ? r.symbol : "circle", n = e.series.length, a = e.series.map((m, d) => {
    var b;
    const L = t.showLabels ? me(
      t,
      i ? "right" : "top",
      m.formattedValues,
      m.unitFormatCodes,
      m.values,
      !1,
      e.categories
    ) : { label: { show: !1 } }, h = Te(m, d, t), y = Ne(m, h), p = Fe(m, t), _ = Me(m), u = ie(m, t), c = i ? void 0 : it(t, e, m), x = ct(m.seriesType, "line"), f = ze(
      L.emphasis,
      m.emphasisColor
    );
    return {
      name: m.name,
      type: x,
      data: De(m.values, (b = e.pointColors) == null ? void 0 : b[d], e.categoryColors),
      smooth: x === "line" ? !!o : void 0,
      step: x === "line" ? s : void 0,
      lineStyle: {
        width: p,
        color: h,
        ..._ ? { type: _ } : {}
      },
      itemStyle: {
        color: y,
        ...u.borderWidth != null ? { borderWidth: u.borderWidth } : {},
        ...u.borderColor != null ? { borderColor: u.borderColor } : {},
        ...m.borderColor && x === "bar" ? { borderColor: m.borderColor } : {}
      },
      showSymbol: x === "line" || x === "scatter" ? u.showSymbol : void 0,
      symbol: x === "line" || x === "scatter" ? u.showSymbol ? u.symbol : "none" : void 0,
      symbolSize: x === "line" || x === "scatter" ? u.symbolSize : void 0,
      label: L.label,
      ...f ? { emphasis: f } : {},
      ...c !== void 0 ? { yAxisIndex: c } : {}
    };
  });
  if (i) {
    const m = t.showYAxis ? Bt(e.categories, oe(t)) : void 0;
    return {
      ...ye(t, n, l, e, !1, m),
      ...Ot(e, t, m),
      ...Vt(t),
      series: a,
      ...te(t, n, l, e.series.map((d) => d.name), void 0, e, !1),
      ...xe(t, e)
    };
  }
  return {
    ...ye(t, n, l, e),
    ...at(e, t),
    ...mt(t, Qe(e, t), e),
    series: a,
    ...te(t, n, l, e.series.map((m) => m.name)),
    ...xe(t, e)
  };
}
const Wt = "percent";
function Ht(e) {
  return e.categories.map(
    (t, o) => e.series.reduce((s, i) => s + (Number(i.values[o]) || 0), 0)
  );
}
function Yt(e, t) {
  return e.map((o, s) => {
    const i = t[s];
    return i ? Number(o) / i * 100 : 0;
  });
}
function Ke(e, t) {
  const o = { ...e };
  t || (o.min = 0, o.max = 100);
  const s = o.axisLabel;
  if (s && typeof s == "object" && !Array.isArray(s)) {
    const i = s;
    i.show !== !1 && (o.axisLabel = { ...i, formatter: "{value}%" });
  }
  return o;
}
function Xt(e) {
  return e.yAxisMin !== void 0 && e.yAxisMin !== "" || e.yAxisMax !== void 0 && e.yAxisMax !== "";
}
function es(e, t) {
  const o = t.chartVariant === "stacked_percent", s = t.chartVariant === "stacked_percent_bar", i = o || s, r = t.chartVariant === "horizontal" || t.chartVariant === "stacked-horizontal" || s, l = t.chartVariant === "stacked-vertical" || t.chartVariant === "stacked-horizontal" || i, n = typeof t.columnSpacing == "number" ? `${t.columnSpacing}%` : "43%", a = r ? "right" : "top", m = !r && !i, d = we(t, e, m), L = i ? Ht(e) : [], h = e.series.length, y = e.series.map((c, x) => {
    var E, D;
    const f = i ? Yt(c.values, L) : c.values, b = t.showLabels ? i ? me(t, a, void 0, void 0, f, !0, e.categories) : me(t, a, c.formattedValues, c.unitFormatCodes, c.values, !1, e.categories) : { label: { show: !1 } }, v = it(t, e, c, m), C = c.stack ?? "default", N = i ? Wt : l && d ? `${C}__y${v ?? 0}` : l ? C : void 0, M = Te(c, x, t), F = Ne(c, M), A = ct(c.seriesType, "bar"), S = Fe(c, t), T = Me(c), w = ie(c, t), I = ze(
      b.emphasis,
      c.emphasisColor
    );
    return {
      name: c.name,
      type: A,
      data: De(
        f,
        (E = e.pointColors) == null ? void 0 : E[x],
        e.categoryColors
      ),
      ...N !== void 0 && A === "bar" ? { stack: N } : {},
      itemStyle: {
        color: F,
        ...c.borderColor ? { borderColor: c.borderColor } : {},
        ...A === "bar" && ((D = c.itemStyle) == null ? void 0 : D.borderWidth) != null ? { borderWidth: c.itemStyle.borderWidth } : {},
        ...A !== "bar" ? {
          ...w.borderWidth != null ? { borderWidth: w.borderWidth } : {},
          ...w.borderColor != null ? { borderColor: w.borderColor } : {}
        } : {}
      },
      ...A === "line" || A === "scatter" ? {
        lineStyle: {
          width: S,
          color: M,
          ...T ? { type: T } : {}
        },
        showSymbol: w.showSymbol,
        symbol: w.showSymbol ? w.symbol : "none",
        symbolSize: w.symbolSize
      } : {},
      ...A === "bar" ? { barCategoryGap: n } : {},
      label: b.label,
      ...I ? { emphasis: I } : {},
      ...v !== void 0 ? { yAxisIndex: v } : {}
    };
  }), p = r && t.showYAxis ? Bt(e.categories, oe(t)) : void 0;
  let _ = r ? Vt(t) : at(e, t), u = r ? Ot(e, t, p) : mt(t, Qe(e, t), e, m);
  if (i) {
    const c = Xt(t);
    if (s)
      _ = { xAxis: Ke(_.xAxis, !1) };
    else {
      const x = u.yAxis;
      Array.isArray(x) || (u = { yAxis: Ke(x, c) });
    }
  }
  return {
    ...ye(t, h, void 0, e, m, p),
    ..._,
    ...u,
    series: y,
    ...te(t, h, void 0, e.series.map((c) => c.name), void 0, e, m),
    ...xe(t, e, i)
  };
}
function ts(e, t) {
  const o = t.chartVariant === "stacked_percent", s = t.chartVariant === "stacked" || o, i = t.chartVariant === "curved", r = t.chartVariant === "stepped" ? "end" : !1, l = ie(e.series[0] ?? {}, t), n = l.showSymbol ? l.symbol : "circle", a = !o, m = we(t, e, a), d = o ? Ht(e) : [], L = e.series.length, h = e.series.map((p, _) => {
    var w;
    const u = o ? Yt(p.values, d) : p.values, c = t.showLabels ? o ? me(t, "top", void 0, void 0, u, !0, e.categories) : me(t, "top", p.formattedValues, p.unitFormatCodes, p.values, !1, e.categories) : { label: { show: !1 } }, x = Te(p, _, t), f = Ne(p, x), b = Fe(p, t), v = Me(p), C = ie(p, t), N = it(t, e, p, a), M = p.stack ?? "default", F = o ? Wt : s && m ? `${M}__y${N ?? 0}` : s ? M : void 0, A = ct(p.seriesType, "line"), S = Zo(p.seriesType) && A === "line", T = ze(
      c.emphasis,
      p.emphasisColor
    );
    return {
      name: p.name,
      type: A,
      data: De(
        u,
        (w = e.pointColors) == null ? void 0 : w[_],
        e.categoryColors
      ),
      smooth: A === "line" ? !!i : void 0,
      step: A === "line" ? r : void 0,
      ...F !== void 0 && (A === "line" || A === "bar") ? { stack: F } : {},
      lineStyle: {
        width: b,
        color: x,
        ...v ? { type: v } : {}
      },
      itemStyle: {
        color: f,
        ...C.borderWidth != null && C.showSymbol ? { borderWidth: C.borderWidth } : {},
        ...C.borderColor != null && C.showSymbol ? { borderColor: C.borderColor } : {},
        ...p.borderColor && A === "bar" ? { borderColor: p.borderColor } : {}
      },
      ...S ? { areaStyle: { color: x, opacity: 0.3 } } : {},
      ...A === "line" || A === "scatter" ? {
        showSymbol: C.showSymbol,
        symbol: C.showSymbol ? C.symbol : "none",
        symbolSize: C.symbolSize
      } : {},
      ...A === "bar" ? { barCategoryGap: typeof t.columnSpacing == "number" ? `${t.columnSpacing}%` : "43%" } : {},
      label: c.label,
      ...T ? { emphasis: T } : {},
      ...N !== void 0 ? { yAxisIndex: N } : {}
    };
  });
  let y = mt(t, Qe(e, t), e, a);
  if (o) {
    const p = y.yAxis;
    Array.isArray(p) || (y = {
      yAxis: Ke(p, Xt(t))
    });
  }
  return {
    ...ye(t, L, n, e, a),
    ...at(e, t),
    ...y,
    series: h,
    ...te(t, L, n, e.series.map((p) => p.name), void 0, e, a),
    ...xe(t, e, o)
  };
}
const os = 12, ss = 16;
function rs(e) {
  const t = e.dataLabelLeaderLineEnabled !== !1;
  if (e.pieLabelsInside || e.pieLabelsOutside) {
    const o = e.dataLabelVisibility === "onHover", s = !!e.pieLabelsOutside;
    return {
      show: !o,
      position: e.pieLabelsInside ? "inside" : "outside",
      showLabelLine: s && t,
      showOnHover: o
    };
  }
  if (e.showLabels) {
    const o = e.dataLabelPosition === "inside", s = e.dataLabelVisibility === "onHover";
    return {
      show: !s,
      position: o ? "inside" : "outside",
      showLabelLine: !o && t,
      showOnHover: s
    };
  }
  return { show: !1, position: "outside", showLabelLine: !1, showOnHover: !1 };
}
function is(e) {
  const t = Z(e), o = e.legendPosition, s = e.showLegend ? Se(e) : 0, i = o === "top" && e.showLegend, r = o === "bottom" && e.showLegend, l = t + (i ? os + s + ss : t > 0 ? 8 : 0), n = r ? s + 8 : 0, a = Math.min(24, l * 0.05 + (i ? 4 : 0)), m = e.pieSemi ? 70 : 50, d = `${Math.min(88, m + a - n * 0.02)}%`, L = l > 40 || n > 20, h = e.pieDonut ? L ? ["34%", "58%"] : ["40%", "70%"] : L ? "58%" : "65%";
  return {
    centerY: d,
    radius: h
  };
}
function ls(e, t) {
  const o = is(t), s = t.pieSemi ? 180 : 90, i = t.pieSemi ? 0 : 450, r = e.segments.map((b, v) => {
    var C;
    return {
      name: b.label,
      value: b.value,
      itemStyle: {
        color: ((C = b.color) == null ? void 0 : C.trim()) || t.palette[v % t.palette.length] || t.primaryColor
      }
    };
  }), l = e.segments.length, n = e.segments.map((b) => b.label), a = rs(t), m = t.useUnitDefaultFormat ?? !1, d = t.dataLabelNumberFormat ?? "1,000[.00]", L = Io(e, t), h = W(t), y = Le(
    h,
    h.size,
    L
  ), p = y.rich ? { rich: y.rich, ...y.align ? { align: y.align } : {} } : { ...y.textStyle }, _ = (b) => {
    const v = b.dataIndex ?? 0, C = e.segments[v], N = b.value, M = typeof N == "number" ? N : Number(N ?? 0), F = k(M, d, m, C == null ? void 0 : C.formattedValue, C == null ? void 0 : C.unitFormatCode);
    return y.formatText(F);
  }, u = (b) => {
    var A, S;
    const v = b, C = v.dataIndex ?? 0, N = (A = e.segments[C]) == null ? void 0 : A.formattedValue, M = (S = e.segments[C]) == null ? void 0 : S.unitFormatCode, F = k(Number(v.value ?? 0), d, m, N, M);
    return `${v.marker ?? ""} ${v.name}: <b>${F}</b>`;
  }, { legend: c } = te(t, l, void 0, n), x = {
    type: "pie",
    radius: o.radius,
    center: ["50%", o.centerY],
    startAngle: s,
    endAngle: i,
    data: r,
    label: {
      show: a.show,
      position: a.position,
      ...p,
      formatter: _
    },
    labelLine: { show: a.showLabelLine && a.show },
    emphasis: {
      itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.2)" },
      ...a.showOnHover ? {
        label: {
          show: !0,
          position: a.position,
          ...p,
          formatter: _
        },
        labelLine: { show: a.showLabelLine }
      } : {}
    }
  };
  return {
    tooltip: { trigger: "item", confine: !0, formatter: u },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    legend: c,
    series: [x]
  };
}
function ns(e, t) {
  const o = t.seriesSymbolSize ?? t.scatterSymbolSize ?? 10, s = (t.seriesSymbol !== "none" ? t.seriesSymbol : void 0) ?? t.scatterSymbol ?? "circle", i = t.dataLabelNumberFormat ?? "1,000[.00]", r = Uo(e), l = W(t), n = ae(t), a = oe(t), m = e.series.length, d = X(t, r, l), L = (b) => d.formatText(b.name ?? ""), h = e.series.map((b, v) => {
    var A, S, T, w;
    const C = b.color ?? t.palette[v % t.palette.length] ?? t.primaryColor, N = ((A = b.itemStyle) == null ? void 0 : A.color) ?? C, M = t.showLabels && t.dataLabelVisibility === "onHover" ? {
      label: {
        show: !0,
        position: "top",
        formatter: L,
        ...d.typography
      }
    } : void 0, F = b.emphasisColor ? {
      ...M ?? {},
      itemStyle: { color: b.emphasisColor }
    } : M;
    return {
      name: b.name,
      type: "scatter",
      data: b.points.map((I) => ({
        value: [I.x, I.y],
        name: I.label
      })),
      symbolSize: b.symbolSize ?? o,
      symbol: b.symbol ?? s,
      itemStyle: {
        color: N,
        ...b.borderColor || (S = b.itemStyle) != null && S.borderColor ? { borderColor: ((T = b.itemStyle) == null ? void 0 : T.borderColor) ?? b.borderColor } : {},
        ...((w = b.itemStyle) == null ? void 0 : w.borderWidth) != null ? { borderWidth: b.itemStyle.borderWidth } : {}
      },
      label: t.showLabels ? {
        show: t.dataLabelVisibility !== "onHover",
        position: "top",
        formatter: L,
        ...d.typography
      } : { show: !1 },
      ...F ? { emphasis: F } : {}
    };
  }), y = t.xAxisLabel ?? e.xAxisLabel, p = t.yAxisLabel ?? e.yAxisLabel, _ = y ? de(y, t.xAxisLabelFont, t.labelFont.size) : null, u = p ? de(p, t.yAxisLabelFont, t.labelFont.size) : null, c = t.showXAxis ? {
    show: !0,
    type: "value",
    ..._ ? {
      name: _.name,
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: {
        ..._.nameTextStyle,
        ...t.xAxisLabelAlign ? { align: t.xAxisLabelAlign } : {}
      }
    } : {},
    axisLine: H(t.xAxisLine, !0),
    axisTick: Y(t.xAxisTicks),
    splitLine: K(t.xAxisGrid, t.showGrid, !0),
    axisLabel: q(
      n,
      n.size,
      t.xAxisLabelRotation !== void 0 ? { rotate: t.xAxisLabelRotation } : void 0,
      t.xAxisLabelWrap ? (b) => ee(b) : void 0
    )
  } : { show: !1 }, x = t.showYAxis ? {
    show: !0,
    type: "value",
    ...u ? {
      name: u.name,
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: {
        ...u.nameTextStyle,
        ...t.yAxisLabelAlign ? { align: t.yAxisLabelAlign } : {}
      }
    } : {},
    axisLine: H(t.yAxisLine, !0),
    axisTick: Y(t.yAxisTicks),
    splitLine: K(t.yAxisGrid, t.showGrid, !0),
    axisLabel: q(
      a,
      a.size,
      t.yAxisLabelRotation !== void 0 ? { rotate: t.yAxisLabelRotation } : void 0,
      t.yAxisLabelWrap ? (b) => ee(b) : void 0
    )
  } : { show: !1 }, f = {
    ...t,
    xAxisLabel: y || t.xAxisLabel,
    yAxisLabel: p || t.yAxisLabel
  };
  return {
    ...ye(f, m, s),
    xAxis: c,
    yAxis: x,
    series: h,
    ...te(t, m, s, e.series.map((b) => b.name)),
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (b) => {
        var I;
        const v = b.value;
        if (!v) return "";
        const C = t.useUnitDefaultFormat ?? !1, N = b.seriesIndex ?? 0, M = b.dataIndex ?? 0, F = (I = e.series[N]) == null ? void 0 : I.points[M], A = k(v[0], i, C, F == null ? void 0 : F.formattedX, F == null ? void 0 : F.unitFormatCodeX), S = k(v[1], i, C, F == null ? void 0 : F.formattedY, F == null ? void 0 : F.unitFormatCodeY), T = b.name ? `<strong>${b.name}</strong><br/>` : "";
        return `${m > 1 && b.seriesName ? `${b.seriesName}<br/>` : ""}${T}${y}: ${A}<br/>${p}: ${S}`;
      }
    }
  };
}
function as(e) {
  const t = e.trim().replace("#", "");
  return t.length === 3 ? [
    parseInt(t[0] + t[0], 16),
    parseInt(t[1] + t[1], 16),
    parseInt(t[2] + t[2], 16)
  ] : t.length === 6 ? [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)] : null;
}
function St(e) {
  const t = as(e);
  if (!t) return 0.5;
  const [o, s, i] = t.map((r) => {
    const l = r / 255;
    return l <= 0.04045 ? l / 12.92 : Math.pow((l + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * o + 0.7152 * s + 0.0722 * i;
}
function ms(e) {
  return e.length === 0 ? ["#f5f5f5", "#4a90d9"] : e.length === 1 ? ["#f5f5f5", e[0]] : [...e].sort((t, o) => St(o) - St(t));
}
function cs(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.legendPosition, i = s === "left" || s === "right", r = $o(e, t), l = ae(t), n = oe(t), a = W(t), m = X(t, r, a), d = X(t, r, t.legendFont);
  let L = (t.showYAxis, 10), h = 15, y = 20 + Z(t), p = t.showXAxis ? 40 : 10;
  t.showLegend && (s === "top" ? y = lt(t) + 45 + Ut(t) + 12 : s === "bottom" ? p = (t.showXAxis ? 40 : 10) + et : s === "left" ? L = j + 10 : h = j + 15), t.grid && (t.grid.left !== void 0 && (L = t.grid.left), t.grid.right !== void 0 && (h = t.grid.right), t.grid.top !== void 0 && (y = t.grid.top), t.grid.bottom !== void 0 && (p = t.grid.bottom));
  const u = t.palette.length > 0 ? t.palette : [t.primaryColor], c = ms(u), x = {
    type: "continuous",
    calculable: !0,
    min: e.min,
    max: e.max,
    inRange: { color: c },
    show: t.showLegend,
    text: [
      d.formatText(Q(e.max, o)),
      d.formatText(Q(e.min, o))
    ],
    textStyle: d.typography,
    orient: i ? "vertical" : "horizontal"
  };
  s === "top" ? (x.top = Ae, x.left = "center") : s === "bottom" ? (x.bottom = 0, x.left = "center") : s === "left" ? (x.left = ne, x.top = "center") : (x.right = ne, x.top = "center");
  const f = t.xAxisLabel ? de(t.xAxisLabel, t.xAxisLabelFont, t.labelFont.size) : null, b = t.yAxisLabel ? de(t.yAxisLabel, t.yAxisLabelFont, t.labelFont.size) : null, v = t.xAxisLabelRotation !== void 0 ? t.xAxisLabelRotation : t.labelOrientation === "vertical" ? 45 : 0, C = {
    show: t.showXAxis,
    type: "category",
    data: e.xCategories,
    splitArea: { show: !0 },
    ...f ? { name: f.name, nameLocation: "middle", nameGap: 30, nameTextStyle: f.nameTextStyle } : {},
    axisLabel: q(l, l.size, { rotate: v })
  }, N = {
    show: t.showYAxis,
    type: "category",
    data: e.yCategories,
    splitArea: { show: !0 },
    ...b ? { name: b.name, nameLocation: "middle", nameGap: 50, nameTextStyle: b.nameTextStyle } : {},
    axisLabel: q(
      n,
      n.size,
      t.yAxisLabelRotation !== void 0 ? { rotate: t.yAxisLabelRotation } : void 0
    )
  }, M = t.showLabels && t.dataLabelVisibility !== "onHover", F = t.showLabels && t.dataLabelVisibility === "onHover", A = m.typography, S = t.useUnitDefaultFormat ?? !1, T = (D) => {
    var g, z, O;
    const $ = D.dataIndex ?? 0, U = (g = e.formattedCells) == null ? void 0 : g[$], B = (z = e.unitFormatCells) == null ? void 0 : z[$], R = k(Number(((O = D.data) == null ? void 0 : O[2]) ?? 0), o, S, U, B);
    return m.formatText(R);
  }, w = M ? { show: !0, position: "inside", formatter: T, ...A } : { show: !1 }, I = F ? { show: !0, position: "inside", formatter: T, ...A } : { show: !1 }, E = (D) => {
    var G, P;
    const $ = D;
    if (!Array.isArray($ == null ? void 0 : $.data) || $.data.length < 3) return "";
    const U = e.xCategories[$.data[0]] ?? String($.data[0]), B = e.yCategories[$.data[1]] ?? String($.data[1]), R = $.dataIndex ?? 0, g = (G = e.formattedCells) == null ? void 0 : G[R], z = (P = e.unitFormatCells) == null ? void 0 : P[R], O = k($.data[2], o, S, g, z);
    return `<strong>${B}</strong><br/>${U}: <strong>${O}</strong>`;
  };
  return {
    grid: {
      left: L,
      right: h,
      top: y,
      bottom: p,
      containLabel: !0
    },
    xAxis: C,
    yAxis: N,
    visualMap: [x],
    series: [
      {
        type: "heatmap",
        data: e.cells,
        label: w,
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.3)" },
          label: I
        }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: E
    }
  };
}
function us(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.palette.length > 0 ? t.palette : [t.primaryColor], i = ko(e, t), r = W(t), l = X(t, i, r), n = e.nodes.map((u, c) => {
    var x;
    return {
      ...u,
      itemStyle: { color: s[c % s.length] },
      ...(x = u.children) != null && x.length ? {
        children: u.children.map((f) => ({ ...f }))
      } : {}
    };
  }), a = t.showLabels && t.dataLabelVisibility !== "onHover", m = t.showLabels && t.dataLabelVisibility === "onHover", d = t.useUnitDefaultFormat ?? !1, L = (u) => {
    if (u)
      for (const c of e.nodes) {
        if (c.name === u && c.formattedValue) return c.formattedValue;
        for (const x of c.children ?? [])
          if (x.name === u && x.formattedValue) return x.formattedValue;
      }
  }, h = (u) => {
    if (u)
      for (const c of e.nodes) {
        if (c.name === u && c.unitFormatCode) return c.unitFormatCode;
        for (const x of c.children ?? [])
          if (x.name === u && x.unitFormatCode) return x.unitFormatCode;
      }
  }, y = (u) => {
    const c = L(u == null ? void 0 : u.name), x = h(u == null ? void 0 : u.name), f = k(Number((u == null ? void 0 : u.value) ?? 0), o, d, c, x), b = l.formatText((u == null ? void 0 : u.name) ?? ""), v = l.formatText(f);
    return `${b}
${v}`;
  }, p = (u) => l.formatText((u == null ? void 0 : u.name) ?? ""), _ = (u) => {
    var C;
    const c = u, x = ((C = c == null ? void 0 : c.treePathInfo) == null ? void 0 : C.map((N) => N.name).filter(Boolean).join(" → ")) ?? (c == null ? void 0 : c.name) ?? "", f = L(c == null ? void 0 : c.name), b = h(c == null ? void 0 : c.name), v = k(Number((c == null ? void 0 : c.value) ?? 0), o, d, f, b);
    return `<strong>${x}</strong><br/>Value: <strong>${v}</strong>`;
  };
  return {
    legend: { show: !1 },
    series: [
      {
        type: "treemap",
        data: n,
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
        label: a ? { show: !0, formatter: y, ...l.typography } : { show: !1 },
        upperLabel: a ? {
          show: !0,
          height: 24,
          formatter: p,
          ...l.typography
        } : { show: !1 },
        emphasis: {
          label: m ? { show: !0, formatter: y, ...l.typography } : { show: !1 }
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
      formatter: _
    }
  };
}
function bs(e, t, o, s = 2) {
  const i = [];
  return ut(e, t, 1, void 0, o, "alternate", "horizontal", s, i), i;
}
function ds(e, t, o, s = "vertical", i = 2) {
  const r = [];
  return ut(e, t, 1, void 0, o, "fixed", s, i, r), r;
}
function ut(e, t, o, s, i, r, l, n, a) {
  const m = e.reduce((_, u) => _ + Math.max(u.value, 0), 0);
  if (m === 0 || t.width <= 0 || t.height <= 0) return;
  const d = l === "horizontal";
  let L = d ? t.x : t.y;
  const h = d ? t.width : t.height, y = (e.length - 1) * n, p = Math.max(h - y, 0);
  e.forEach((_, u) => {
    const c = Math.max(_.value, 0) / m, x = u === e.length - 1, f = x ? d ? t.x + t.width - L : t.y + t.height - L : Math.round(c * p), b = d ? f : t.width, v = d ? t.height : f, C = i[u % i.length];
    if (a.push({
      name: _.name,
      value: _.value,
      x: t.x + (d ? L - t.x : 0),
      y: t.y + (d ? 0 : L - t.y),
      width: Math.max(b, 0),
      height: Math.max(v, 0),
      depth: o,
      color: C,
      parentName: s,
      formattedValue: _.formattedValue,
      unitFormatCode: _.unitFormatCode
    }), _.children && _.children.length > 0) {
      const N = {
        x: t.x + (d ? L - t.x : 0),
        y: t.y + (d ? 0 : L - t.y),
        width: Math.max(b, 0),
        height: Math.max(v, 0)
      }, M = r === "alternate" ? l === "horizontal" ? "vertical" : "horizontal" : l;
      ut(_.children, N, o + 1, _.name, i, r, M, n, a);
    }
    L += f + (x ? 0 : n);
  });
}
function Kt(e) {
  var N, M, F;
  const l = [];
  e.title && l.push({ fontSize: ((N = e.titleFont) == null ? void 0 : N.size) ?? 18 }), e.subtitle && l.push({ fontSize: ((M = e.subtitleFont) == null ? void 0 : M.size) ?? 14 }), e.customLabel && l.push({ fontSize: ((F = e.customLabelFont) == null ? void 0 : F.size) ?? 12 });
  let n = 0;
  if (l.length > 0) {
    let A = 4;
    for (const S of l) A += S.fontSize + 4;
    n = A + 8;
  }
  const a = 16, m = 10, d = 40, L = 120, h = 10, y = 4, p = e.showLegend, _ = e.legendPosition, u = p && (e.legendBackground || e.legendBorder) ? 12 : 0, c = p && (_ === "top" || _ === "bottom") ? Math.max(14, e.legendFont.size) + 8 + u : 0, x = p && (_ === "left" || _ === "right") ? L + h : 0;
  let f = 0, b = y, v = y, C = y;
  return p && _ === "top" ? f = (n > 0 ? n + a : 0) + c + m : p && _ === "bottom" ? (f = n + (n > 0 ? y : 20), b = d + 8) : p && _ === "left" ? (f = n + (n > 0 ? y : 20), v = x) : p && _ === "right" ? (f = n + (n > 0 ? y : 20), C = x) : f = n + (n > 0 ? y : 20), { top: f, bottom: b, left: v, right: C };
}
const vt = 0.1;
function Zt(e, t, o) {
  const s = e * vt, i = t * vt, r = Math.max(o.left, s), l = Math.max(o.right, s), n = Math.max(o.top, i), a = Math.max(o.bottom, i);
  return {
    x: r,
    y: n,
    width: Math.max(e - r - l, 1),
    height: Math.max(t - n - a, 1)
  };
}
const Ct = 3;
function jt(e) {
  const {
    group: t,
    px: o,
    py: s,
    pw: i,
    ph: r,
    name: l,
    val: n,
    showValue: a,
    config: m,
    dataFont: d,
    layout: L = "auto",
    uniformFontSize: h,
    measureTextWidth: y,
    resolveUnderlineColor: p
  } = e, _ = 2, u = i - _ * 2, c = r - _ * 2;
  if (u < 1 && c < 1) return;
  const x = d.size ?? m.labelFont.size ?? 12, f = d.family ?? m.labelFont.family ?? "sans-serif", b = d.bold ? "bold" : "normal", v = d.italic ? "italic" : "normal", C = d.underline ?? !1, N = C ? p(d) : "#fff", M = d.color && d.color !== "inherit" ? d.color : m.labelFont.color && m.labelFont.color !== "inherit" ? m.labelFont.color : "#ffffff", F = o + i / 2, A = s + r / 2, S = Math.max(h ?? x, 8), T = (w, I, E, D, $, U = 1, B = !1) => {
    const R = { ...d, size: D }, g = !B && y(w, R, D) > $;
    if (t.children.push({
      type: "text",
      z: 100,
      style: {
        x: I,
        y: E,
        text: w,
        textAlign: "center",
        textVerticalAlign: "middle",
        fill: U < 1 ? `rgba(255,255,255,${U})` : M,
        fontSize: D,
        fontFamily: f,
        fontWeight: b,
        fontStyle: v,
        ...B ? {} : g ? { width: $, overflow: "truncate" } : {}
      }
    }), C && D >= 6) {
      const z = Math.min(y(w, R, D), $), O = E + D * 0.55;
      t.children.push({
        type: "line",
        z: 101,
        shape: { x1: I - z / 2, y1: O, x2: I + z / 2, y2: O },
        style: { stroke: N, lineWidth: Math.max(1, D >= 10 ? 1 : 0.75) }
      });
    }
  };
  if (h != null) {
    if (L === "thinHorizontal" || L === "thinVertical" || !a) {
      const w = a ? `${l}  ${n}` : l;
      T(w, F, A, S, Math.max(u, 1), 1, !0);
      return;
    }
    if (a && c >= S * 2.2) {
      const w = Math.max(Math.floor(S * 0.9), 8);
      T(l, F, A - S * 0.55, S, Math.max(u, 1), 1, !0), T(n, F, A + w * 0.55, w, Math.max(u, 1), 0.85, !0);
      return;
    }
    T(`${l}  ${n}`, F, A, S, Math.max(u, 1), 1, !0);
    return;
  }
  if (L === "thinHorizontal") {
    const w = a ? `${l}  ${n}` : l;
    T(w, F, A, S, u, 1, !0);
    return;
  }
  if (L === "thinVertical") {
    const w = a ? `${l}  ${n}` : l;
    T(w, F, A, S, u, 1, !0);
    return;
  }
  if (!(u < Ct || c < Ct)) {
    if (a && c >= S * 2.2) {
      const w = Math.max(Math.floor(S * 0.9), 8);
      T(l, F, A - S * 0.55, S, u, 1, !0), T(n, F, A + w * 0.55, w, u, 0.85, !0);
      return;
    }
    T(a ? `${l}  ${n}` : l, F, A, S, u, 1, !0);
  }
}
function Jt(e, t = /* @__PURE__ */ new Set()) {
  for (const o of e)
    o.children && o.children.length > 0 ? Jt(o.children, t) : o.name && t.add(o.name);
  return t;
}
function fe(e, t, o = /* @__PURE__ */ new Map()) {
  for (const s of e)
    s.name && o.set(s.name, s[t]), s.children && fe(s.children, t, o);
  return o;
}
const Ie = 1e3;
function hs(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = t.palette.length > 0 ? t.palette : [t.primaryColor];
  Bo(e, t);
  const r = W(t), l = t.showLabels && t.dataLabelVisibility !== "onHover", n = t.showLabels && t.dataLabelVisibility === "onHover", a = fe(e.nodes, "formattedValue"), m = fe(e.nodes, "unitFormatCode"), d = Kt({ ...t, showLegend: !1 }), L = bs(
    e.nodes,
    { x: 0, y: 0, width: Ie, height: Ie },
    i,
    2
  ), h = L.map((_, u) => ({ value: [u] }));
  return {
    // Slice & Dice legend not applicable — custom series cells cannot bind to ECharts legend items.
    legend: { show: !1 },
    series: [
      {
        type: "custom",
        coordinateSystem: "none",
        emphasis: { focus: "self" },
        data: h,
        renderItem: (_, u) => {
          var $, U;
          const c = L[_.dataIndex];
          if (!c) return null;
          const x = u.getWidth(), f = u.getHeight(), { x: b, y: v, width: C, height: N } = Zt(x, f, d), M = C / Ie, F = N / Ie, A = b + c.x * M, S = v + c.y * F, T = Math.max(c.width * M - 1, 0), w = Math.max(c.height * F - 1, 0), I = c.depth === 1 ? "#ffffff" : "rgba(255,255,255,0.6)", E = c.depth === 1 ? 2 : 1, D = {
            type: "group",
            children: [
              {
                type: "rect",
                shape: { x: A, y: S, width: T, height: w },
                style: {
                  fill: c.color,
                  stroke: I,
                  lineWidth: E
                },
                emphasis: {
                  style: {
                    fill: c.color,
                    stroke: "#fff",
                    lineWidth: 2,
                    shadowBlur: 8,
                    shadowColor: "rgba(0,0,0,0.4)"
                  }
                }
              }
            ]
          };
          if (l || n) {
            const B = a.get(c.name), R = m.get(c.name), g = k(c.value, o, s, B, R), z = !((U = ($ = e.nodes.find((G) => G.name === c.name)) == null ? void 0 : $.children) != null && U.length), O = c.depth >= 2 || z;
            jt({
              group: D,
              px: A,
              py: S,
              pw: T,
              ph: w,
              name: c.name,
              val: g,
              showValue: O,
              config: t,
              dataFont: r,
              uniformFontSize: r.size ?? t.labelFont.size ?? 12,
              measureTextWidth: ce,
              resolveUnderlineColor: _e
            });
          }
          return D;
        }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (_) => {
        const u = _, c = L[(u == null ? void 0 : u.dataIndex) ?? -1];
        if (!c) return "";
        const x = c.parentName ? `${c.parentName} → ${c.name}` : c.name, f = a.get(c.name), b = m.get(c.name), v = k(c.value, o, s, f, b);
        return `<strong>${x}</strong><br/>Value: <strong>${v}</strong>`;
      }
    }
  };
}
const Ee = 1e3;
function ps(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = t.palette.length > 0 ? t.palette : [t.primaryColor];
  Ro(e, t);
  const r = W(t), l = e.direction ?? "vertical", n = t.showLabels && t.dataLabelVisibility !== "onHover", a = t.showLabels && t.dataLabelVisibility === "onHover", m = fe(e.nodes, "formattedValue"), d = fe(e.nodes, "unitFormatCode"), L = Kt({ ...t, showLegend: !1 }), h = ds(
    e.nodes,
    { x: 0, y: 0, width: Ee, height: Ee },
    i,
    l,
    2
  ), y = Jt(e.nodes), p = l === "vertical" ? "thinHorizontal" : "thinVertical", _ = h.map((x, f) => ({ value: [f] }));
  return {
    // Stripes legend not applicable — custom series cells cannot bind to ECharts legend items.
    legend: { show: !1 },
    series: [
      {
        type: "custom",
        coordinateSystem: "none",
        emphasis: { focus: "self" },
        data: _,
        renderItem: (x, f) => {
          const b = h[x.dataIndex];
          if (!b) return null;
          const v = f.getWidth(), C = f.getHeight(), { x: N, y: M, width: F, height: A } = Zt(v, C, L), S = F / Ee, T = A / Ee, w = N + b.x * S, I = M + b.y * T, E = Math.max(b.width * S - 1, 0), D = Math.max(b.height * T - 1, 0), $ = b.depth === 1 ? "#ffffff" : "rgba(255,255,255,0.6)", U = b.depth === 1 ? 2 : 1, B = {
            type: "group",
            children: [
              {
                type: "rect",
                shape: { x: w, y: I, width: E, height: D },
                style: {
                  fill: b.color,
                  stroke: $,
                  lineWidth: U
                },
                emphasis: {
                  style: {
                    fill: b.color,
                    stroke: "#fff",
                    lineWidth: 2,
                    shadowBlur: 8,
                    shadowColor: "rgba(0,0,0,0.4)"
                  }
                }
              }
            ]
          };
          if (n || a) {
            if (!y.has(b.name)) return B;
            const R = m.get(b.name), g = d.get(b.name), z = k(b.value, o, s, R, g);
            jt({
              group: B,
              px: w,
              py: I,
              pw: E,
              ph: D,
              name: b.name,
              val: z,
              showValue: !0,
              config: t,
              dataFont: r,
              layout: p,
              uniformFontSize: r.size ?? t.labelFont.size ?? 12,
              measureTextWidth: ce,
              resolveUnderlineColor: _e
            });
          }
          return B;
        }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: (x) => {
        const f = x, b = h[(f == null ? void 0 : f.dataIndex) ?? -1];
        if (!b) return "";
        const v = b.parentName ? `${b.parentName} → ${b.name}` : b.name, C = m.get(b.name), N = d.get(b.name), M = k(b.value, o, s, C, N);
        return `<strong>${v}</strong><br/>Value: <strong>${M}</strong>`;
      }
    }
  };
}
function ue(e, t) {
  return t ? `<div style="display:flex;gap:6px;margin-top:2px"><span style="opacity:0.65;white-space:nowrap">${e}:</span><span>${t}</span></div>` : "";
}
function ys(e, t, o, s, i) {
  var N, M, F, A, S, T;
  const r = e, l = (r == null ? void 0 : r.seriesIndex) ?? (r == null ? void 0 : r.dataIndex) ?? 0, n = ((N = r == null ? void 0 : r.data) == null ? void 0 : N.name) ?? (r == null ? void 0 : r.name) ?? ((M = t.series[l]) == null ? void 0 : M.name) ?? "", a = (F = r == null ? void 0 : r.data) == null ? void 0 : F.value;
  if (!Array.isArray(a)) return "";
  const m = o.tooltipFields ?? {}, d = m.indicator !== !1, L = m.unit === !0, h = m.timePeriod !== !1, y = m.subgroup !== !1, p = m.area !== !1, _ = m.source === !0, u = m.footnote === !0, c = (S = (A = t.spokeMeta) == null ? void 0 : A[l]) == null ? void 0 : S[0], x = !!(c != null && c.indicatorName) && n.trim().toLowerCase() === c.indicatorName.trim().toLowerCase(), f = !d && x ? "" : n;
  let b = f ? `<div style="font-weight:600;margin-bottom:6px">${f}</div>` : "";
  const v = (T = t.spokeMeta) == null ? void 0 : T[l], C = a.map((w, I) => {
    var g, z, O, G, P;
    const E = ((g = t.indicators[I]) == null ? void 0 : g.name) ?? String(I), D = (O = (z = t.series[l]) == null ? void 0 : z.formattedValues) == null ? void 0 : O[I], $ = (P = (G = t.series[l]) == null ? void 0 : G.unitFormatCodes) == null ? void 0 : P[I], U = k(Number(w), s, i, D, $), B = v == null ? void 0 : v[I];
    let R = '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.07)">';
    return R += `<div style="font-weight:500">${d ? E : "Value"}: <b>${U}</b></div>`, B && (L && B.unitName && (R += ue("Unit", B.unitName)), h && B.timePeriodName && (R += ue("Time Period", B.timePeriodName)), y && B.subgroupName && (R += ue("Subgroup", B.subgroupName)), p && B.areaName && (R += ue("Area", B.areaName)), _ && B.sourceName && (R += ue("Source", B.sourceName)), u && B.footnote && (R += `<div style="margin-top:3px;font-size:0.9em;opacity:0.8">${B.footnote}</div>`)), R += "</div>", R;
  });
  return b += C.join(""), `<div style="min-width:160px;max-width:300px;line-height:1.5">${b}</div>`;
}
function xs(e) {
  if (!(e === void 0 || e === ""))
    return Number(e);
}
function fs(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = xs(t.yAxisMax), i = t.palette.length > 0 ? t.palette : [t.primaryColor], r = Eo(e, t), l = ae(t), n = W(t), a = X(t, e.indicators.map((f) => f.name), l), m = X(t, r, n), d = e.series.map((f) => f.name), L = t.showLabels && t.dataLabelVisibility !== "onHover", h = t.showLabels && t.dataLabelVisibility === "onHover", y = t.useUnitDefaultFormat ?? !1, p = e.series.map((f, b) => {
    const v = Te(f, b, { ...t, palette: i }), C = ie(f, t), N = Ne(f, v), M = Me(f);
    return {
      value: f.values,
      name: f.name,
      symbol: C.symbol,
      symbolSize: C.symbolSize,
      lineStyle: {
        width: Fe(f, t),
        color: v,
        ...M ? { type: M } : {}
      },
      itemStyle: {
        color: N,
        ...C.borderColor ? { borderColor: C.borderColor } : {},
        ...C.borderWidth != null ? { borderWidth: C.borderWidth } : {}
      },
      areaStyle: { opacity: 0.12, color: v },
      ...f.emphasisColor ? { emphasis: { itemStyle: { color: f.emphasisColor } } } : {}
    };
  }), _ = (f) => {
    var A, S, T, w;
    const b = f, v = (b == null ? void 0 : b.dataIndex) ?? 0, C = (b == null ? void 0 : b.dimensionIndex) ?? 0, N = (S = (A = e.series[v]) == null ? void 0 : A.formattedValues) == null ? void 0 : S[C], M = (w = (T = e.series[v]) == null ? void 0 : T.unitFormatCodes) == null ? void 0 : w[C], F = k(Number((b == null ? void 0 : b.value) ?? 0), o, y, N, M);
    return m.formatText(F);
  }, u = t.tooltipEnabled !== !1, c = u && t.tooltipTrigger === "item";
  return {
    tooltip: u ? {
      trigger: "item",
      confine: !0,
      formatter: (f) => {
        var S, T, w, I;
        if (c)
          return ys(f, e, t, o, y);
        const b = f, v = ((S = b == null ? void 0 : b.data) == null ? void 0 : S.name) ?? (b == null ? void 0 : b.name) ?? "", C = (T = b == null ? void 0 : b.data) == null ? void 0 : T.value;
        if (!Array.isArray(C)) return "";
        const N = (b == null ? void 0 : b.dataIndex) ?? 0, M = (w = e.series[N]) == null ? void 0 : w.formattedValues, F = (I = e.series[N]) == null ? void 0 : I.unitFormatCodes, A = C.map((E, D) => {
          var R;
          const $ = ((R = e.indicators[D]) == null ? void 0 : R.name) ?? String(D), U = M == null ? void 0 : M[D], B = F == null ? void 0 : F[D];
          return `${$}: ${k(Number(E), o, y, U, B)}`;
        }).join("<br/>");
        return `<strong>${v}</strong><br/>${A}`;
      }
    } : { show: !1 },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    ...te(t, e.series.length, void 0, d),
    radar: {
      indicator: e.indicators.map((f) => ({
        name: a.formatText(f.name),
        max: s !== void 0 ? s : f.max > 0 ? f.max : 1
      })),
      center: ["50%", "55%"],
      radius: "62%",
      axisName: a.typography,
      splitArea: { show: t.showGrid },
      splitLine: { show: t.showGrid }
    },
    series: [
      {
        type: "radar",
        data: p,
        symbol: t.seriesSymbol && t.seriesSymbol !== "none" ? t.seriesSymbol : "circle",
        symbolSize: t.seriesSymbolSize ?? 6,
        label: {
          show: L,
          formatter: _,
          ...m.typography
        },
        emphasis: {
          label: h ? {
            show: !0,
            formatter: _,
            ...m.typography
          } : { show: !1 }
        }
      }
    ]
  };
}
function Ls(e) {
  const t = e.legendPosition;
  let s = 20 + Z(e), i = e.showXAxis ? 40 : 15, r = 10, l = 10;
  return e.showLegend && (t === "top" ? s = zt(e) : t === "bottom" ? i = (e.showXAxis ? 40 : 15) + et : t === "left" ? r = j + 10 : t === "right" && (l = j + 10)), e.grid && (e.grid.left !== void 0 && (r = e.grid.left), e.grid.right !== void 0 && (l = e.grid.right), e.grid.top !== void 0 && (s = e.grid.top), e.grid.bottom !== void 0 && (i = e.grid.bottom)), { left: r, right: l, top: s, bottom: i, containLabel: !0 };
}
function _s(e, t) {
  if (e.categories.length === 0)
    return {};
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.palette.length > 0 ? t.palette : [t.primaryColor], i = s[0] ?? t.primaryColor, r = s[1] ?? s[0] ?? t.primaryColor, l = t.yAxisMax !== void 0 && t.yAxisMax !== "" ? Number(t.yAxisMax) : null, n = Math.max(
    ...e.leftSeries.values.map((A) => Math.abs(A)),
    ...e.rightSeries.values,
    0
  ), a = n > 0 ? n * 1.1 : 1, m = l !== null && l > 0 ? l : a, d = Ls(t), L = zo(e, t), h = ae(t), y = oe(t), p = W(t), _ = X(t, L, p), u = [e.leftSeries.name, e.rightSeries.name], { legend: c } = te(t, 2, void 0, u), x = t.showLabels && t.dataLabelVisibility !== "onHover", f = t.showLabels && t.dataLabelVisibility === "onHover", b = t.dataLabelPosition === "inside", v = t.useUnitDefaultFormat ?? !1, C = (A) => {
    var $, U;
    const S = A, T = (S == null ? void 0 : S.value) ?? 0, w = (S == null ? void 0 : S.dataIndex) ?? 0, I = ($ = e.leftSeries.formattedValues) == null ? void 0 : $[w], E = (U = e.leftSeries.unitFormatCodes) == null ? void 0 : U[w], D = k(Math.abs(T), o, v, I, E);
    return _.formatText(D);
  }, N = (A) => {
    var $, U;
    const S = A, T = (S == null ? void 0 : S.value) ?? 0, w = (S == null ? void 0 : S.dataIndex) ?? 0, I = ($ = e.rightSeries.formattedValues) == null ? void 0 : $[w], E = (U = e.rightSeries.unitFormatCodes) == null ? void 0 : U[w], D = k(T, o, v, I, E);
    return _.formatText(D);
  }, M = (A, S) => ({
    show: x,
    position: b ? "inside" : S,
    formatter: A,
    ..._.typography
  }), F = (A, S) => ({
    label: f ? { show: !0, position: b ? "inside" : S, formatter: A, ..._.typography } : { show: !1 }
  });
  return {
    grid: d,
    legend: c,
    tooltip: {
      trigger: "axis",
      confine: !0,
      axisPointer: { type: "shadow" },
      formatter: (A) => {
        var E;
        const S = A;
        if (!S || S.length === 0) return "";
        const T = ((E = S[0]) == null ? void 0 : E.dataIndex) ?? 0, w = e.categories[T] ?? "", I = S.map((D) => {
          var g, z, O, G;
          const $ = D.dataIndex ?? 0, U = D.seriesIndex === 0 ? (g = e.leftSeries.formattedValues) == null ? void 0 : g[$] : (z = e.rightSeries.formattedValues) == null ? void 0 : z[$], B = D.seriesIndex === 0 ? (O = e.leftSeries.unitFormatCodes) == null ? void 0 : O[$] : (G = e.rightSeries.unitFormatCodes) == null ? void 0 : G[$], R = k(Math.abs(D.value ?? 0), o, v, U, B);
          return `${D.marker ?? ""}${D.seriesName ?? ""}: ${R}`;
        }).join("<br/>");
        return `<strong>${w}</strong><br/>${I}`;
      }
    },
    xAxis: {
      type: "value",
      min: -m,
      max: m,
      show: t.showXAxis,
      axisLine: H(t.xAxisLine, t.showXAxis),
      axisTick: Y(t.xAxisTicks),
      splitLine: K(t.xAxisGrid, t.showGrid, !0),
      axisLabel: q(
        h,
        h.size,
        { show: t.showXAxis },
        (A) => Q(Math.abs(Number(A)), o)
      )
    },
    yAxis: {
      type: "category",
      data: e.categories,
      show: t.showYAxis,
      axisLine: H(t.yAxisLine, t.showYAxis),
      axisTick: Y(t.yAxisTicks),
      splitLine: K(t.yAxisGrid, t.showGrid, !1),
      axisLabel: q(
        y,
        y.size,
        { show: t.showYAxis },
        t.yAxisLabelWrap ? (A) => ee(A) : void 0
      )
    },
    series: [
      {
        name: e.leftSeries.name,
        type: "bar",
        data: e.leftSeries.values,
        itemStyle: { color: i },
        label: M(C, "insideLeft"),
        emphasis: F(C, "insideLeft")
      },
      {
        name: e.rightSeries.name,
        type: "bar",
        barGap: "-100%",
        data: e.rightSeries.values,
        itemStyle: { color: r },
        label: M(N, "right"),
        emphasis: F(N, "right")
      }
    ]
  };
}
function As(e) {
  const t = W(e), o = {
    fontSize: t.size,
    fontFamily: t.family,
    fontWeight: t.bold ? "bold" : "normal",
    fontStyle: t.italic ? "italic" : "normal",
    color: t.color ?? "#333"
  };
  return {
    font: t,
    normal: o,
    emphasis: { ...o, fontSize: t.size + 2 }
  };
}
function ws(e, t) {
  var A, S;
  Tt.registerMap(e.mapName, e.geoJSON);
  const { breaks: o, colors: s, labels: i } = e.classification, r = s.length, l = [];
  for (let T = 0; T < r; T++)
    l.push({
      min: o[T],
      max: o[T + 1],
      label: i[T] ?? `${o[T]}–${o[T + 1]}`,
      color: s[T]
    });
  const n = t.legendPosition, a = n === "left" || n === "right", d = [...i.map((T, w) => T ?? `${o[w]}–${o[w + 1]}`)], L = X(t, d, t.legendFont), h = As(t), y = {
    type: "piecewise",
    pieces: l,
    orient: a ? "vertical" : "horizontal",
    textStyle: L.typography,
    show: t.showLegend !== !1,
    formatter: (T) => L.formatText(String(T))
  };
  n === "top" ? (y.top = Ae, y.left = "center") : n === "bottom" ? (y.bottom = 0, y.left = "center") : n === "left" ? (y.left = ne, y.top = "center") : (y.right = ne, y.top = "center");
  const p = t.mapLabels, _ = p && (p.showAreaName || p.showDataValue || p.showAreaId), u = !_ && t.dataLabelPosition === "inside" && t.dataLabelVisibility !== "onHover", c = _ || u, x = (p == null ? void 0 : p.showAreaName) ?? !1, f = (p == null ? void 0 : p.showAreaId) ?? !1, b = (p == null ? void 0 : p.showDataValue) || u, v = () => (T) => {
    var E;
    const w = T, I = [];
    return x && w.name && I.push(w.name), f && ((E = w.data) != null && E.areaId) && I.push(x ? `(${w.data.areaId})` : w.data.areaId), b && (w.value != null && !Number.isNaN(w.value) ? I.push(String(w.value)) : I.push("—")), I.join(`
`);
  }, C = e.features.map((T) => {
    const w = {
      name: T.name,
      areaId: T.areaId
    };
    return T.value == null ? {
      ...w,
      value: NaN,
      itemStyle: { areaColor: T.selected ? e.nullColor : e.dimColor },
      emphasis: { disabled: !T.selected }
    } : T.selected ? { ...w, value: T.value } : {
      ...w,
      value: T.value,
      itemStyle: { areaColor: e.dimColor },
      emphasis: { disabled: !0 }
    };
  }), N = c && t.dataLabelVisibility === "onHover", M = c && !N ? { show: !0, formatter: v(), ...h.normal } : { show: !1 };
  return {
    tooltip: {
      trigger: "item",
      formatter: (T) => {
        var D;
        const w = T, I = w.name ?? "", E = (D = w.data) != null && D.areaId ? ` (${w.data.areaId})` : "";
        return w.value == null || Number.isNaN(w.value) ? `<strong>${I}${E}</strong><br/>No data` : `<strong>${I}${E}</strong><br/>${w.value}`;
      }
    },
    visualMap: y,
    series: [
      {
        type: "map",
        map: e.mapName,
        roam: !0,
        data: C,
        nameProperty: "NAME1_",
        label: M,
        emphasis: {
          label: c ? { show: !0, formatter: v(), ...h.emphasis } : { show: !1 },
          ...(A = e.hoverOverColor) != null && A.trim() ? { itemStyle: { areaColor: e.hoverOverColor.trim() } } : {}
        },
        select: {
          disabled: !0
        },
        itemStyle: {
          borderColor: ((S = e.borderColor) == null ? void 0 : S.trim()) || "#fff",
          borderWidth: 0.5
        }
      }
    ]
  };
}
function Ss(e) {
  const t = Z(e);
  if (t <= 0)
    return { centerY: "50%", outerPct: 88 };
  const o = Math.min(18, 6 + t * 0.08), s = `${Math.min(64, 50 + o)}%`, i = t > 40 ? 52 : 64;
  return { centerY: s, outerPct: i };
}
function qt(e, t = 1) {
  let o = t;
  for (const s of e)
    s.children && s.children.length > 0 && (o = Math.max(o, qt(s.children, t + 1)));
  return o;
}
function Ze(e, t, o = /* @__PURE__ */ new Map()) {
  for (const s of e)
    s.name && o.set(s.name, s[t]), s.children && Ze(s.children, t, o);
  return o;
}
function Qt(e, t, o, s) {
  return e.map((i, r) => {
    const l = o === 1 ? r % t.length : s, n = {
      name: i.name,
      value: i.value,
      itemStyle: { color: t[l] }
    };
    return i.children && i.children.length > 0 && (n.children = Qt(i.children, t, o + 1, l)), n;
  });
}
function vs(e, t) {
  const o = t.dataLabelNumberFormat ?? "1,000[.00]", s = t.useUnitDefaultFormat ?? !1, i = t.palette.length > 0 ? t.palette : [t.primaryColor], r = Po(e, t), l = W(t), n = X(t, r, t.labelFont), a = X(t, r, l), m = !!t.labelFont.underline, d = !!l.underline, L = re(t.labelFont, {
    size: t.labelFont.size,
    family: t.labelFont.family
  }), h = re(l, { size: l.size, family: l.family }), p = { rich: {
    nm: { ...L, align: "center" },
    vl: { ...h, align: "center" },
    ...n.typography.rich ?? {},
    ...a.typography.rich ?? {}
  }, align: "center" }, _ = (P) => m ? n.formatText(P) : `{nm|${ke(P)}}`, u = (P) => d ? a.formatText(P) : `{vl|${ke(P)}}`, c = Ze(e.nodes, "formattedValue"), x = Ze(e.nodes, "unitFormatCode"), f = t.showLabels && t.dataLabelVisibility !== "onHover", b = t.showLabels && t.dataLabelVisibility === "onHover", v = qt(e.nodes), C = v >= 2, N = v >= 3, M = Ss(t), F = M.outerPct / 88, A = (P) => `${Math.round(P * F)}%`, S = "0%", T = A(N ? 38 : C ? 52 : 88), w = A(N ? 64 : 88), I = A(88), E = (P) => n.formatText((P == null ? void 0 : P.name) ?? ""), D = (P) => {
    const V = c.get((P == null ? void 0 : P.name) ?? ""), ge = x.get((P == null ? void 0 : P.name) ?? ""), Oe = k(Number((P == null ? void 0 : P.value) ?? 0), o, s, V, ge);
    return `${_((P == null ? void 0 : P.name) ?? "")}
${u(Oe)}`;
  }, $ = (P) => {
    var bt;
    const V = P, ge = ((bt = V == null ? void 0 : V.treePathInfo) == null ? void 0 : bt.map((no) => no.name).filter(Boolean).join(" › ")) ?? (V == null ? void 0 : V.name) ?? "", Oe = c.get((V == null ? void 0 : V.name) ?? ""), io = x.get((V == null ? void 0 : V.name) ?? ""), lo = k(Number((V == null ? void 0 : V.value) ?? 0), o, s, Oe, io);
    return `<strong>${ge}</strong><br/>Value: <strong>${lo}</strong>`;
  }, U = Qt(e.nodes, i, 1, 0), R = {
    ...{ itemStyle: { borderColor: "rgba(255,255,255,0.8)", borderWidth: 2 } },
    r0: S,
    r: T,
    label: f ? { show: !0, rotate: "radial", minAngle: 5, formatter: E, ...n.typography } : { show: !1 }
  }, g = C ? {
    r0: T,
    r: w,
    itemStyle: { borderColor: "rgba(255,255,255,0.6)", borderWidth: 1 },
    label: f ? {
      show: !0,
      rotate: "radial",
      minAngle: 5,
      formatter: N ? E : D,
      ...N ? n.typography : p
    } : { show: !1 }
  } : null, z = N ? {
    r0: w,
    r: I,
    itemStyle: { borderColor: "rgba(255,255,255,0.5)", borderWidth: 1 },
    label: f ? { show: !0, rotate: "radial", minAngle: 4, formatter: D, ...p } : { show: !1 }
  } : null, O = [
    {},
    // Level 0: invisible center root
    R,
    ...g ? [g] : [],
    ...z ? [z] : []
  ], G = b ? { show: !0, formatter: D, ...p } : { show: !1 };
  return {
    // Sunburst legend not applicable — hierarchical rings cannot bind to ECharts legend items.
    legend: { show: !1 },
    series: [
      {
        type: "sunburst",
        data: U,
        center: ["50%", M.centerY],
        radius: [S, I],
        nodeClick: !1,
        sort: "desc",
        emphasis: {
          focus: "ancestor",
          label: G
        },
        levels: O,
        label: f ? { show: !0, rotate: "radial", minAngle: 5, formatter: E, ...n.typography } : { show: !1 }
      }
    ],
    tooltip: {
      trigger: "item",
      confine: !0,
      formatter: $
    }
  };
}
const be = 10, Cs = be * be, Ts = "rgba(180, 180, 180, 0.45)";
function Fs(e) {
  return Number.isFinite(e) ? Math.min(100, Math.max(0, e)) : 0;
}
function Ms(e, t) {
  const o = Fs(e.value), s = Math.floor(o), i = o - s, r = t.palette[0] ?? t.primaryColor, l = t.palette[1] ?? Ts, n = Z(t), a = t.dataLabelNumberFormat ?? "1,000[.00]", m = t.useUnitDefaultFormat ?? !1, d = k(o, a, m, e.formattedValue, void 0), L = Array.from({ length: Cs }, (_, u) => ({ value: [u] })), h = () => e.label ? `<strong>${e.label}</strong><br/>${d}%` : `<strong>${d}%</strong>`, y = (_, u) => {
    const c = _.dataIndex, x = u.getWidth(), f = u.getHeight(), b = n + 8, v = 16, C = x - 32, N = f - b - v, M = Math.max(40, Math.min(C, N)), F = (x - M) / 2, A = b + Math.max(0, (N - M) / 2), S = M / be, T = c % be, w = Math.floor(c / be), I = F + T * S + S / 2, E = A + w * S + S / 2, D = S * 0.36;
    return c < s ? {
      type: "circle",
      shape: { cx: I, cy: E, r: D },
      style: { fill: r }
    } : c === s && i > 1e-3 ? {
      type: "group",
      children: [
        {
          type: "circle",
          shape: { cx: I, cy: E, r: D },
          style: { fill: l }
        },
        {
          type: "group",
          children: [
            {
              type: "circle",
              shape: { cx: I, cy: E, r: D },
              style: { fill: r }
            }
          ],
          clipPath: {
            type: "rect",
            shape: {
              x: I - D,
              y: E - D,
              width: Math.max(0.5, 2 * D * i),
              height: 2 * D
            }
          }
        }
      ]
    } : {
      type: "circle",
      shape: { cx: I, cy: E, r: D },
      style: { fill: l }
    };
  };
  return {
    tooltip: {
      show: t.tooltipEnabled !== !1,
      trigger: "item",
      confine: !0,
      formatter: h
    },
    legend: { show: !1 },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    grid: { show: !1, left: 0, right: 0, top: 0, bottom: 0 },
    series: [
      {
        type: "custom",
        coordinateSystem: "none",
        data: L,
        renderItem: y
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }
    ]
  };
}
const Ns = "#2a2a2a";
function Ds(e) {
  return Number.isFinite(e) ? Math.min(100, Math.max(0, e)) : 0;
}
function Is(e, t) {
  const o = Ds(e.value), s = 100 - o, i = t.palette[0] ?? t.primaryColor, r = t.palette[1] ?? Ns, l = Z(t), n = t.showLabels !== !1, a = W(t), m = t.dataLabelNumberFormat ?? "1,000[.00]", d = t.useUnitDefaultFormat ?? !1, L = e.formattedValue ?? k(o, m, d, void 0, void 0), h = Le(a, a.size, [L]), y = h.rich ? { rich: h.rich, ...h.align ? { align: h.align } : {} } : { ...h.textStyle }, _ = `${50 + Math.min(12, l * 0.04)}%`, u = l > 40 ? ["38%", "62%"] : ["42%", "68%"], c = [
    {
      name: e.label ?? "Value",
      value: o,
      itemStyle: { color: i },
      label: { show: !1 }
    },
    {
      name: "Remainder",
      value: s,
      itemStyle: { color: r },
      label: { show: !1 },
      tooltip: { show: !1 }
    }
  ], x = (N) => {
    const M = N;
    if ((M == null ? void 0 : M.name) === "Remainder") return "";
    const F = e.label ? `${e.label}: ` : "";
    return `${(M == null ? void 0 : M.marker) ?? ""} ${F}<b>${L}%</b>`;
  }, f = n ? {
    type: "pie",
    radius: u,
    center: ["50%", _],
    silent: !0,
    label: {
      show: !0,
      position: "center",
      formatter: () => h.formatText(L),
      ...y
    },
    labelLine: { show: !1 },
    data: [{ value: 1, name: "", itemStyle: { color: "transparent" }, tooltip: { show: !1 } }],
    z: 2
  } : null, b = {
    type: "pie",
    radius: u,
    center: ["50%", _],
    startAngle: 90,
    data: c,
    label: { show: !1 },
    labelLine: { show: !1 },
    emphasis: {
      itemStyle: { shadowBlur: 8, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.2)" },
      label: { show: !1 }
    },
    z: 1
  }, v = f ? [b, f] : [b];
  return {
    tooltip: {
      show: t.tooltipEnabled !== !1,
      trigger: "item",
      confine: !0,
      formatter: x
    },
    legend: { show: !1 },
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    series: v
  };
}
function zs(e) {
  return "categories" in e && "series" in e;
}
function gs(e) {
  return "segments" in e;
}
function Os(e) {
  return "xAxisLabel" in e && "yAxisLabel" in e;
}
function Vs(e) {
  return e.kind === "pyramid" && "categories" in e && Array.isArray(e.categories);
}
function Gs(e) {
  return "xCategories" in e && "yCategories" in e && "cells" in e;
}
function Ws(e) {
  return "nodes" in e && e.kind !== "sunburst" && e.kind !== "sliceDice" && e.kind !== "stripes";
}
function Hs(e) {
  return e.kind === "sliceDice" && "nodes" in e;
}
function Ys(e) {
  return e.kind === "stripes" && "nodes" in e;
}
function Xs(e) {
  return e.kind === "sunburst" && "nodes" in e;
}
function Ks(e) {
  return e.kind === "dotMatrix" && typeof e.value == "number";
}
function Zs(e) {
  return e.kind === "hundredMinus" && typeof e.value == "number";
}
function js(e) {
  return "indicators" in e && Array.isArray(e.indicators);
}
function Js(e) {
  return e.kind === "map" && "geoJSON" in e;
}
const eo = {
  // Include polar axes so switching polar_line ↔ cartesian line does not leave stale coords.
  replaceMerge: [
    "series",
    "legend",
    "grid",
    "visualMap",
    "xAxis",
    "yAxis",
    "radar",
    "polar",
    "angleAxis",
    "radiusAxis",
    "title",
    "graphic",
    "tooltip"
  ]
};
function to(e, t) {
  var p, _, u, c;
  const o = ((p = e.plotAreaBackgroundImageUrl) == null ? void 0 : p.trim()) ?? "", s = ((_ = e.chartAreaBackgroundImageUrl) == null ? void 0 : _.trim()) ?? "", i = o.length > 0, r = s.length > 0, l = ((u = e.plotAreaBackgroundColor) == null ? void 0 : u.trim()) ?? "", n = !i && l.length > 0 && !/^transparent$/i.test(l) && l !== "rgba(0,0,0,0)", a = ((c = e.chartAreaBackgroundColor) == null ? void 0 : c.trim()) ?? "", m = !r && a.length > 0 && !/^transparent$/i.test(a) && a !== "rgba(0,0,0,0)", d = e.plotAreaBorder, L = d && (d.width ?? 0) > 0, h = {
    ...t,
    backgroundColor: m ? a : "transparent"
  }, y = t.grid;
  if (y && typeof y == "object" && !Array.isArray(y)) {
    const x = n || !!L || i;
    h.grid = {
      ...y,
      show: x,
      backgroundColor: n ? l : "transparent",
      ...L ? { borderColor: d.color ?? "#cccccc", borderWidth: d.width ?? 1 } : { borderWidth: 0 }
    };
  } else if ((n || L || i) && ((n && !m && !r || n && (m || r)) && (h.backgroundColor = l), L)) {
    const x = t.graphic, f = {
      type: "rect",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      z: -100,
      silent: !0,
      style: {
        fill: n ? l : "transparent",
        stroke: d.color ?? "#cccccc",
        lineWidth: d.width ?? 1
      }
    };
    Array.isArray(x) ? h.graphic = [...x, f] : x ? h.graphic = [x, f] : h.graphic = [f];
  }
  return h;
}
const oo = "dfa-chart-bg-image", je = "dfa-plot-bg-image";
function Es(e) {
  var t, o;
  return !!((t = e.chartAreaBackgroundImageUrl) != null && t.trim() || (o = e.plotAreaBackgroundImageUrl) != null && o.trim());
}
function $e(e, t) {
  if (typeof e == "number" && Number.isFinite(e)) return e;
  if (typeof e == "string") {
    const o = e.trim();
    if (o.endsWith("%")) {
      const i = parseFloat(o);
      return Number.isFinite(i) ? i / 100 * t : 0;
    }
    const s = parseFloat(o);
    return Number.isFinite(s) ? s : 0;
  }
  return 0;
}
function $s(e) {
  var m, d, L, h, y, p;
  const t = e.getWidth(), o = e.getHeight();
  if (!(t > 0 && o > 0)) return null;
  try {
    const _ = e, u = (p = (y = (h = (L = (d = (m = _.getModel) == null ? void 0 : m.call(_)) == null ? void 0 : d.getComponent) == null ? void 0 : L.call(d, "grid", 0)) == null ? void 0 : h.coordinateSystem) == null ? void 0 : y.getRect) == null ? void 0 : p.call(y);
    if (u && u.width > 0 && u.height > 0)
      return { x: u.x, y: u.y, width: u.width, height: u.height };
  } catch {
  }
  const s = e.getOption(), i = Array.isArray(s.grid) ? s.grid[0] : s.grid;
  if (!i) return null;
  const r = $e(i.left, t), l = $e(i.right, t), n = $e(i.top, o), a = $e(i.bottom, o);
  return {
    x: r,
    y: n,
    width: Math.max(0, t - r - l),
    height: Math.max(0, o - n - a)
  };
}
function ks(e, t) {
  var n, a;
  const o = (n = t.chartAreaBackgroundImageUrl) == null ? void 0 : n.trim(), s = (a = t.plotAreaBackgroundImageUrl) == null ? void 0 : a.trim();
  if (!o && !s) return;
  const i = e.getWidth(), r = e.getHeight();
  if (!(i > 0 && r > 0)) return;
  const l = [];
  if (o && l.push({
    id: oo,
    type: "image",
    left: 0,
    top: 0,
    z: -200,
    silent: !0,
    style: { image: o, x: 0, y: 0, width: i, height: r }
  }), s) {
    const m = $s(e) ?? { x: 0, y: 0, width: i, height: r };
    l.push({
      id: je,
      type: "image",
      left: m.x,
      top: m.y,
      z: -100,
      silent: !0,
      style: {
        image: s,
        x: 0,
        y: 0,
        width: m.width,
        height: m.height
      }
    });
  }
  e.setOption({ graphic: l });
}
function Je(e, t) {
  Es(t) && requestAnimationFrame(() => {
    try {
      ks(e, t);
    } catch {
    }
  });
}
function so(e, t) {
  var n, a;
  const o = (n = e.chartAreaBackgroundImageUrl) == null ? void 0 : n.trim(), s = (a = e.plotAreaBackgroundImageUrl) == null ? void 0 : a.trim();
  if (!o && !s) return t;
  const i = [];
  if (o && i.push({
    id: oo,
    type: "image",
    left: 0,
    top: 0,
    z: -200,
    silent: !0,
    style: { image: o, x: 0, y: 0, width: 1, height: 1 }
  }), s) {
    const m = t.grid;
    if (m && typeof m == "object" && !Array.isArray(m)) {
      const d = m;
      i.push({
        id: je,
        type: "image",
        left: d.left ?? 0,
        top: d.top ?? 0,
        z: -100,
        silent: !0,
        // Exact width/height applied in syncBackgroundImageSizes from grid.getRect().
        style: { image: s, x: 0, y: 0, width: 1, height: 1 }
      });
    } else
      i.push({
        id: je,
        type: "image",
        left: 0,
        top: 0,
        z: -100,
        silent: !0,
        style: { image: s, x: 0, y: 0, width: 1, height: 1 }
      });
  }
  const r = t.graphic, l = Array.isArray(r) ? r : r ? [r] : [];
  return {
    ...t,
    ...o ? { backgroundColor: "transparent" } : {},
    graphic: [...i, ...l]
  };
}
function Ps(e) {
  const t = {
    ...e,
    plotAreaBorder: void 0,
    plotAreaBackgroundColor: void 0
  }, s = to(t, {
    xAxis: { show: !1 },
    yAxis: { show: !1 },
    grid: { show: !1, left: 16, right: 16, top: 16, bottom: 16 },
    legend: { show: !1 },
    series: [],
    tooltip: { show: !1 }
  }), i = so(e, s), r = Dt(e), l = { ...i };
  r.title && (l.title = r.title);
  const n = r.graphic ?? [];
  if (n.length > 0) {
    const a = i.graphic, m = Array.isArray(a) ? a : a ? [a] : [];
    l.graphic = [...m, ...n];
  }
  return l;
}
function ro(e, t) {
  if (Gt(e))
    return Ps(t);
  let o;
  switch (t.type) {
    case "line":
      o = Qo(e, t);
      break;
    case "bar":
      o = es(e, t);
      break;
    case "area":
      o = ts(e, t);
      break;
    case "pie":
      o = ls(e, t);
      break;
    case "scatter":
      o = ns(e, t);
      break;
    case "heatmap":
      o = cs(e, t);
      break;
    case "treemap":
      o = us(e, t);
      break;
    case "treemapSliceDice":
      o = hs(e, t);
      break;
    case "treemapStripes":
      o = ps(e, t);
      break;
    case "radar":
      o = fs(e, t);
      break;
    case "pyramid":
      o = _s(e, t);
      break;
    case "map":
      o = ws(e, t);
      break;
    case "sunburst":
      o = vs(e, t);
      break;
    case "dotMatrix":
      o = Ms(e, t);
      break;
    case "hundredMinus":
      o = Is(e, t);
      break;
    default:
      o = {};
  }
  if (t.showLegend && t.legendPosition === "top") {
    const d = lt(t), L = t.type === "pie" ? 8 : 0, h = (d > 0 ? d : Ae) + L, y = o.legend;
    y && typeof y == "object" && !Array.isArray(y) && (o = { ...o, legend: { ...y, top: h } });
    const p = o.visualMap;
    if (p) {
      const _ = Array.isArray(p) ? p : [p];
      o = {
        ...o,
        visualMap: _.map(
          (u) => u && typeof u == "object" ? { ...u, top: h } : u
        )
      };
    }
  }
  const s = to(t, o), i = so(t, s), r = Dt(t), l = { ...i };
  r.title && (l.title = r.title);
  const n = i.graphic, a = Array.isArray(n) ? n : n ? [n] : [], m = r.graphic ?? [];
  return (a.length > 0 || m.length > 0) && (l.graphic = [...a, ...m]), l;
}
function qs(e, t, o, s) {
  const i = Tt.init;
  if (!i) throw new Error("echarts.init is not available");
  const r = i(e, void 0, { renderer: "canvas" }), l = ro(t, o);
  r.setOption(l, eo), r._bgImageConfig = o, Je(r, o), s != null && s.onPointClick && r.on("click", (a) => {
    var m;
    a.componentType === "series" && ((m = s.onPointClick) == null || m.call(s, {
      seriesName: a.seriesName,
      name: a.name,
      value: a.value,
      dataIndex: a.dataIndex
    }));
  }), s != null && s.onLegendClick && r.on("legendselectchanged", (a) => {
    var d;
    const m = a;
    (m == null ? void 0 : m.name) != null && ((d = s.onLegendClick) == null || d.call(s, { name: m.name }));
  });
  const n = new ResizeObserver(() => {
    var m;
    (m = r == null ? void 0 : r.resize) == null || m.call(r);
    const a = r._bgImageConfig;
    a && Je(r, a);
  });
  return n.observe(e), r._resizeObserver = n, r;
}
function Qs(e, t, o) {
  var i;
  const s = ro(t, o);
  (i = e == null ? void 0 : e.setOption) == null || i.call(
    e,
    s,
    Gt(t) ? { notMerge: !0 } : eo
  ), e._bgImageConfig = o, Je(e, o);
}
function er(e) {
  var o, s;
  const t = e._resizeObserver;
  t && ((o = e == null ? void 0 : e.getDom) != null && o.call(e)) && t.disconnect(), (s = e == null ? void 0 : e.dispose) == null || s.call(e);
}
function tr(e, t = "png") {
  var o;
  return ((o = e == null ? void 0 : e.getDataURL) == null ? void 0 : o.call(e, { type: t, pixelRatio: 2 })) ?? "";
}
export {
  de as A,
  xo as B,
  Le as C,
  ke as D,
  Bs as E,
  ze as F,
  Te as G,
  ct as H,
  Ne as I,
  Me as J,
  Fe as K,
  ie as L,
  Zo as M,
  Gt as a,
  co as b,
  Z as c,
  er as d,
  Mo as e,
  Rs as f,
  tr as g,
  Ks as h,
  qs as i,
  Gs as j,
  Zs as k,
  zs as l,
  Js as m,
  gs as n,
  Vs as o,
  js as p,
  Os as q,
  Hs as r,
  Ys as s,
  Xs as t,
  Qs as u,
  Ws as v,
  ce as w,
  _e as x,
  Us as y,
  De as z
};
//# sourceMappingURL=index-DO4DObT6.mjs.map
