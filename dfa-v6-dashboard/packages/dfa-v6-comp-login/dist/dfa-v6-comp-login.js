var Be = Object.defineProperty;
var Me = (r, a, s) => a in r ? Be(r, a, { enumerable: !0, configurable: !0, writable: !0, value: s }) : r[a] = s;
var Ee = (r, a, s) => Me(r, typeof a != "symbol" ? a + "" : a, s);
import { jsxs as c, Fragment as Wt, jsx as n } from "react/jsx-runtime";
import o, { useState as N, useRef as Dt, useLayoutEffect as Te, useEffect as Bt, useCallback as et } from "react";
import Fe from "react-dom";
function He(r) {
  if (typeof document > "u") return;
  let a = document.head || document.getElementsByTagName("head")[0], s = document.createElement("style");
  s.type = "text/css", a.appendChild(s), s.styleSheet ? s.styleSheet.cssText = r : s.appendChild(document.createTextNode(r));
}
const je = (r) => {
  switch (r) {
    case "success":
      return ze;
    case "info":
      return Ve;
    case "warning":
      return We;
    case "error":
      return Ye;
    default:
      return null;
  }
}, Oe = Array(12).fill(0), $e = ({ visible: r, className: a }) => /* @__PURE__ */ o.createElement("div", {
  className: [
    "sonner-loading-wrapper",
    a
  ].filter(Boolean).join(" "),
  "data-visible": r
}, /* @__PURE__ */ o.createElement("div", {
  className: "sonner-spinner"
}, Oe.map((s, l) => /* @__PURE__ */ o.createElement("div", {
  className: "sonner-loading-bar",
  key: `spinner-bar-${l}`
})))), ze = /* @__PURE__ */ o.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "currentColor",
  height: "20",
  width: "20"
}, /* @__PURE__ */ o.createElement("path", {
  fillRule: "evenodd",
  d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
  clipRule: "evenodd"
})), We = /* @__PURE__ */ o.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
  height: "20",
  width: "20"
}, /* @__PURE__ */ o.createElement("path", {
  fillRule: "evenodd",
  d: "M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z",
  clipRule: "evenodd"
})), Ve = /* @__PURE__ */ o.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "currentColor",
  height: "20",
  width: "20"
}, /* @__PURE__ */ o.createElement("path", {
  fillRule: "evenodd",
  d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
  clipRule: "evenodd"
})), Ye = /* @__PURE__ */ o.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 20 20",
  fill: "currentColor",
  height: "20",
  width: "20"
}, /* @__PURE__ */ o.createElement("path", {
  fillRule: "evenodd",
  d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z",
  clipRule: "evenodd"
})), Ue = /* @__PURE__ */ o.createElement("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "12",
  height: "12",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /* @__PURE__ */ o.createElement("line", {
  x1: "18",
  y1: "6",
  x2: "6",
  y2: "18"
}), /* @__PURE__ */ o.createElement("line", {
  x1: "6",
  y1: "6",
  x2: "18",
  y2: "18"
})), Ke = () => {
  const [r, a] = o.useState(document.hidden);
  return o.useEffect(() => {
    const s = () => {
      a(document.hidden);
    };
    return document.addEventListener("visibilitychange", s), () => window.removeEventListener("visibilitychange", s);
  }, []), r;
};
let me = 1;
class Ge {
  constructor() {
    this.subscribe = (a) => (this.subscribers.push(a), () => {
      const s = this.subscribers.indexOf(a);
      this.subscribers.splice(s, 1);
    }), this.publish = (a) => {
      this.subscribers.forEach((s) => s(a));
    }, this.addToast = (a) => {
      this.publish(a), this.toasts = [
        ...this.toasts,
        a
      ];
    }, this.create = (a) => {
      var s;
      const { message: l, ...f } = a, d = typeof (a == null ? void 0 : a.id) == "number" || ((s = a.id) == null ? void 0 : s.length) > 0 ? a.id : me++, h = this.toasts.find((p) => p.id === d), y = a.dismissible === void 0 ? !0 : a.dismissible;
      return this.dismissedToasts.has(d) && this.dismissedToasts.delete(d), h ? this.toasts = this.toasts.map((p) => p.id === d ? (this.publish({
        ...p,
        ...a,
        id: d,
        title: l
      }), {
        ...p,
        ...a,
        id: d,
        dismissible: y,
        title: l
      }) : p) : this.addToast({
        title: l,
        ...f,
        dismissible: y,
        id: d
      }), d;
    }, this.dismiss = (a) => (a ? (this.dismissedToasts.add(a), requestAnimationFrame(() => this.subscribers.forEach((s) => s({
      id: a,
      dismiss: !0
    })))) : this.toasts.forEach((s) => {
      this.subscribers.forEach((l) => l({
        id: s.id,
        dismiss: !0
      }));
    }), a), this.message = (a, s) => this.create({
      ...s,
      message: a
    }), this.error = (a, s) => this.create({
      ...s,
      message: a,
      type: "error"
    }), this.success = (a, s) => this.create({
      ...s,
      type: "success",
      message: a
    }), this.info = (a, s) => this.create({
      ...s,
      type: "info",
      message: a
    }), this.warning = (a, s) => this.create({
      ...s,
      type: "warning",
      message: a
    }), this.loading = (a, s) => this.create({
      ...s,
      type: "loading",
      message: a
    }), this.promise = (a, s) => {
      if (!s)
        return;
      let l;
      s.loading !== void 0 && (l = this.create({
        ...s,
        promise: a,
        type: "loading",
        message: s.loading,
        description: typeof s.description != "function" ? s.description : void 0
      }));
      const f = Promise.resolve(a instanceof Function ? a() : a);
      let d = l !== void 0, h;
      const y = f.then(async (u) => {
        if (h = [
          "resolve",
          u
        ], o.isValidElement(u))
          d = !1, this.create({
            id: l,
            type: "default",
            message: u
          });
        else if (qe(u) && !u.ok) {
          d = !1;
          const t = typeof s.error == "function" ? await s.error(`HTTP error! status: ${u.status}`) : s.error, R = typeof s.description == "function" ? await s.description(`HTTP error! status: ${u.status}`) : s.description, C = typeof t == "object" && !o.isValidElement(t) ? t : {
            message: t
          };
          this.create({
            id: l,
            type: "error",
            description: R,
            ...C
          });
        } else if (u instanceof Error) {
          d = !1;
          const t = typeof s.error == "function" ? await s.error(u) : s.error, R = typeof s.description == "function" ? await s.description(u) : s.description, C = typeof t == "object" && !o.isValidElement(t) ? t : {
            message: t
          };
          this.create({
            id: l,
            type: "error",
            description: R,
            ...C
          });
        } else if (s.success !== void 0) {
          d = !1;
          const t = typeof s.success == "function" ? await s.success(u) : s.success, R = typeof s.description == "function" ? await s.description(u) : s.description, C = typeof t == "object" && !o.isValidElement(t) ? t : {
            message: t
          };
          this.create({
            id: l,
            type: "success",
            description: R,
            ...C
          });
        }
      }).catch(async (u) => {
        if (h = [
          "reject",
          u
        ], s.error !== void 0) {
          d = !1;
          const w = typeof s.error == "function" ? await s.error(u) : s.error, t = typeof s.description == "function" ? await s.description(u) : s.description, $ = typeof w == "object" && !o.isValidElement(w) ? w : {
            message: w
          };
          this.create({
            id: l,
            type: "error",
            description: t,
            ...$
          });
        }
      }).finally(() => {
        d && (this.dismiss(l), l = void 0), s.finally == null || s.finally.call(s);
      }), p = () => new Promise((u, w) => y.then(() => h[0] === "reject" ? w(h[1]) : u(h[1])).catch(w));
      return typeof l != "string" && typeof l != "number" ? {
        unwrap: p
      } : Object.assign(l, {
        unwrap: p
      });
    }, this.custom = (a, s) => {
      const l = (s == null ? void 0 : s.id) || me++;
      return this.create({
        jsx: a(l),
        id: l,
        ...s
      }), l;
    }, this.getActiveToasts = () => this.toasts.filter((a) => !this.dismissedToasts.has(a.id)), this.subscribers = [], this.toasts = [], this.dismissedToasts = /* @__PURE__ */ new Set();
  }
}
const V = new Ge(), Xe = (r, a) => {
  const s = (a == null ? void 0 : a.id) || me++;
  return V.addToast({
    title: r,
    ...a,
    id: s
  }), s;
}, qe = (r) => r && typeof r == "object" && "ok" in r && typeof r.ok == "boolean" && "status" in r && typeof r.status == "number", Ze = Xe, Je = () => V.toasts, Qe = () => V.getActiveToasts(), le = Object.assign(Ze, {
  success: V.success,
  info: V.info,
  warning: V.warning,
  error: V.error,
  custom: V.custom,
  message: V.message,
  promise: V.promise,
  dismiss: V.dismiss,
  loading: V.loading
}, {
  getHistory: Je,
  getToasts: Qe
});
He("[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}");
function Zt(r) {
  return r.label !== void 0;
}
const tn = 3, en = "24px", nn = "16px", Se = 4e3, sn = 356, an = 14, rn = 45, on = 200;
function ot(...r) {
  return r.filter(Boolean).join(" ");
}
function ln(r) {
  const [a, s] = r.split("-"), l = [];
  return a && l.push(a), s && l.push(s), l;
}
const cn = (r) => {
  var a, s, l, f, d, h, y, p, u;
  const { invert: w, toast: t, unstyled: R, interacting: $, setHeights: C, visibleToasts: Mt, heights: ft, index: v, toasts: z, expanded: lt, removeToast: Z, defaultRichColors: Nt, closeButton: F, style: e, cancelButtonStyle: ct, actionButtonStyle: Ft, className: _ = "", descriptionClassName: J = "", duration: nt, position: Y, gap: dt, expandByDefault: Et, classNames: x, icons: L, closeButtonAriaLabel: X = "Close toast" } = r, [ut, j] = o.useState(null), [mt, bt] = o.useState(null), [b, E] = o.useState(!1), [S, B] = o.useState(!1), [wt, k] = o.useState(!1), [vt, pt] = o.useState(!1), [Rt, st] = o.useState(!1), [ee, Tt] = o.useState(0), [ne, H] = o.useState(0), at = o.useRef(t.duration || nt || Se), rt = o.useRef(null), W = o.useRef(null), Ht = v === 0, se = v + 1 <= Mt, M = t.type, Q = t.dismissible !== !1, At = t.className || "", Yt = t.descriptionClassName || "", yt = o.useMemo(() => ft.findIndex((m) => m.toastId === t.id) || 0, [
    ft,
    t.id
  ]), Pt = o.useMemo(() => {
    var m;
    return (m = t.closeButton) != null ? m : F;
  }, [
    t.closeButton,
    F
  ]), St = o.useMemo(() => t.duration || nt || Se, [
    t.duration,
    nt
  ]), gt = o.useRef(0), U = o.useRef(0), tt = o.useRef(0), kt = o.useRef(null), [It, ae] = Y.split("-"), _t = o.useMemo(() => ft.reduce((m, T, g) => g >= yt ? m : m + T.height, 0), [
    ft,
    yt
  ]), Ut = Ke(), jt = t.invert || w, Ot = M === "loading";
  U.current = o.useMemo(() => yt * dt + _t, [
    yt,
    _t
  ]), o.useEffect(() => {
    at.current = St;
  }, [
    St
  ]), o.useEffect(() => {
    E(!0);
  }, []), o.useEffect(() => {
    const m = W.current;
    if (m) {
      const T = m.getBoundingClientRect().height;
      return H(T), C((g) => [
        {
          toastId: t.id,
          height: T,
          position: t.position
        },
        ...g
      ]), () => C((g) => g.filter((O) => O.toastId !== t.id));
    }
  }, [
    C,
    t.id
  ]), o.useLayoutEffect(() => {
    if (!b) return;
    const m = W.current, T = m.style.height;
    m.style.height = "auto";
    const g = m.getBoundingClientRect().height;
    m.style.height = T, H(g), C((O) => O.find((I) => I.toastId === t.id) ? O.map((I) => I.toastId === t.id ? {
      ...I,
      height: g
    } : I) : [
      {
        toastId: t.id,
        height: g,
        position: t.position
      },
      ...O
    ]);
  }, [
    b,
    t.title,
    t.description,
    C,
    t.id,
    t.jsx,
    t.action,
    t.cancel
  ]);
  const q = o.useCallback(() => {
    B(!0), Tt(U.current), C((m) => m.filter((T) => T.toastId !== t.id)), setTimeout(() => {
      Z(t);
    }, on);
  }, [
    t,
    Z,
    C,
    U
  ]);
  o.useEffect(() => {
    if (t.promise && M === "loading" || t.duration === 1 / 0 || t.type === "loading") return;
    let m;
    return lt || $ || Ut ? (() => {
      if (tt.current < gt.current) {
        const O = (/* @__PURE__ */ new Date()).getTime() - gt.current;
        at.current = at.current - O;
      }
      tt.current = (/* @__PURE__ */ new Date()).getTime();
    })() : (() => {
      at.current !== 1 / 0 && (gt.current = (/* @__PURE__ */ new Date()).getTime(), m = setTimeout(() => {
        t.onAutoClose == null || t.onAutoClose.call(t, t), q();
      }, at.current));
    })(), () => clearTimeout(m);
  }, [
    lt,
    $,
    t,
    M,
    Ut,
    q
  ]), o.useEffect(() => {
    t.delete && (q(), t.onDismiss == null || t.onDismiss.call(t, t));
  }, [
    q,
    t.delete
  ]);
  function re() {
    var m;
    if (L != null && L.loading) {
      var T;
      return /* @__PURE__ */ o.createElement("div", {
        className: ot(x == null ? void 0 : x.loader, t == null || (T = t.classNames) == null ? void 0 : T.loader, "sonner-loader"),
        "data-visible": M === "loading"
      }, L.loading);
    }
    return /* @__PURE__ */ o.createElement($e, {
      className: ot(x == null ? void 0 : x.loader, t == null || (m = t.classNames) == null ? void 0 : m.loader),
      visible: M === "loading"
    });
  }
  const Lt = t.icon || (L == null ? void 0 : L[M]) || je(M);
  var $t, Kt;
  return /* @__PURE__ */ o.createElement("li", {
    tabIndex: 0,
    ref: W,
    className: ot(_, At, x == null ? void 0 : x.toast, t == null || (a = t.classNames) == null ? void 0 : a.toast, x == null ? void 0 : x.default, x == null ? void 0 : x[M], t == null || (s = t.classNames) == null ? void 0 : s[M]),
    "data-sonner-toast": "",
    "data-rich-colors": ($t = t.richColors) != null ? $t : Nt,
    "data-styled": !(t.jsx || t.unstyled || R),
    "data-mounted": b,
    "data-promise": !!t.promise,
    "data-swiped": Rt,
    "data-removed": S,
    "data-visible": se,
    "data-y-position": It,
    "data-x-position": ae,
    "data-index": v,
    "data-front": Ht,
    "data-swiping": wt,
    "data-dismissible": Q,
    "data-type": M,
    "data-invert": jt,
    "data-swipe-out": vt,
    "data-swipe-direction": mt,
    "data-expanded": !!(lt || Et && b),
    "data-testid": t.testId,
    style: {
      "--index": v,
      "--toasts-before": v,
      "--z-index": z.length - v,
      "--offset": `${S ? ee : U.current}px`,
      "--initial-height": Et ? "auto" : `${ne}px`,
      ...e,
      ...t.style
    },
    onDragEnd: () => {
      k(!1), j(null), kt.current = null;
    },
    onPointerDown: (m) => {
      m.button !== 2 && (Ot || !Q || (rt.current = /* @__PURE__ */ new Date(), Tt(U.current), m.target.setPointerCapture(m.pointerId), m.target.tagName !== "BUTTON" && (k(!0), kt.current = {
        x: m.clientX,
        y: m.clientY
      })));
    },
    onPointerUp: () => {
      var m, T, g;
      if (vt || !Q) return;
      kt.current = null;
      const O = Number(((m = W.current) == null ? void 0 : m.style.getPropertyValue("--swipe-amount-x").replace("px", "")) || 0), Ct = Number(((T = W.current) == null ? void 0 : T.style.getPropertyValue("--swipe-amount-y").replace("px", "")) || 0), I = (/* @__PURE__ */ new Date()).getTime() - ((g = rt.current) == null ? void 0 : g.getTime()), D = ut === "x" ? O : Ct, xt = Math.abs(D) / I;
      if (Math.abs(D) >= rn || xt > 0.11) {
        Tt(U.current), t.onDismiss == null || t.onDismiss.call(t, t), bt(ut === "x" ? O > 0 ? "right" : "left" : Ct > 0 ? "down" : "up"), q(), pt(!0);
        return;
      } else {
        var K, G;
        (K = W.current) == null || K.style.setProperty("--swipe-amount-x", "0px"), (G = W.current) == null || G.style.setProperty("--swipe-amount-y", "0px");
      }
      st(!1), k(!1), j(null);
    },
    onPointerMove: (m) => {
      var T, g, O;
      if (!kt.current || !Q || ((T = window.getSelection()) == null ? void 0 : T.toString().length) > 0) return;
      const I = m.clientY - kt.current.y, D = m.clientX - kt.current.x;
      var xt;
      const K = (xt = r.swipeDirections) != null ? xt : ln(Y);
      !ut && (Math.abs(D) > 1 || Math.abs(I) > 1) && j(Math.abs(D) > Math.abs(I) ? "x" : "y");
      let G = {
        x: 0,
        y: 0
      };
      const Gt = (ht) => 1 / (1.5 + Math.abs(ht) / 20);
      if (ut === "y") {
        if (K.includes("top") || K.includes("bottom"))
          if (K.includes("top") && I < 0 || K.includes("bottom") && I > 0)
            G.y = I;
          else {
            const ht = I * Gt(I);
            G.y = Math.abs(ht) < Math.abs(I) ? ht : I;
          }
      } else if (ut === "x" && (K.includes("left") || K.includes("right")))
        if (K.includes("left") && D < 0 || K.includes("right") && D > 0)
          G.x = D;
        else {
          const ht = D * Gt(D);
          G.x = Math.abs(ht) < Math.abs(D) ? ht : D;
        }
      (Math.abs(G.x) > 0 || Math.abs(G.y) > 0) && st(!0), (g = W.current) == null || g.style.setProperty("--swipe-amount-x", `${G.x}px`), (O = W.current) == null || O.style.setProperty("--swipe-amount-y", `${G.y}px`);
    }
  }, Pt && !t.jsx && M !== "loading" ? /* @__PURE__ */ o.createElement("button", {
    "aria-label": X,
    "data-disabled": Ot,
    "data-close-button": !0,
    onClick: Ot || !Q ? () => {
    } : () => {
      q(), t.onDismiss == null || t.onDismiss.call(t, t);
    },
    className: ot(x == null ? void 0 : x.closeButton, t == null || (l = t.classNames) == null ? void 0 : l.closeButton)
  }, (Kt = L == null ? void 0 : L.close) != null ? Kt : Ue) : null, (M || t.icon || t.promise) && t.icon !== null && ((L == null ? void 0 : L[M]) !== null || t.icon) ? /* @__PURE__ */ o.createElement("div", {
    "data-icon": "",
    className: ot(x == null ? void 0 : x.icon, t == null || (f = t.classNames) == null ? void 0 : f.icon)
  }, t.promise || t.type === "loading" && !t.icon ? t.icon || re() : null, t.type !== "loading" ? Lt : null) : null, /* @__PURE__ */ o.createElement("div", {
    "data-content": "",
    className: ot(x == null ? void 0 : x.content, t == null || (d = t.classNames) == null ? void 0 : d.content)
  }, /* @__PURE__ */ o.createElement("div", {
    "data-title": "",
    className: ot(x == null ? void 0 : x.title, t == null || (h = t.classNames) == null ? void 0 : h.title)
  }, t.jsx ? t.jsx : typeof t.title == "function" ? t.title() : t.title), t.description ? /* @__PURE__ */ o.createElement("div", {
    "data-description": "",
    className: ot(J, Yt, x == null ? void 0 : x.description, t == null || (y = t.classNames) == null ? void 0 : y.description)
  }, typeof t.description == "function" ? t.description() : t.description) : null), /* @__PURE__ */ o.isValidElement(t.cancel) ? t.cancel : t.cancel && Zt(t.cancel) ? /* @__PURE__ */ o.createElement("button", {
    "data-button": !0,
    "data-cancel": !0,
    style: t.cancelButtonStyle || ct,
    onClick: (m) => {
      Zt(t.cancel) && Q && (t.cancel.onClick == null || t.cancel.onClick.call(t.cancel, m), q());
    },
    className: ot(x == null ? void 0 : x.cancelButton, t == null || (p = t.classNames) == null ? void 0 : p.cancelButton)
  }, t.cancel.label) : null, /* @__PURE__ */ o.isValidElement(t.action) ? t.action : t.action && Zt(t.action) ? /* @__PURE__ */ o.createElement("button", {
    "data-button": !0,
    "data-action": !0,
    style: t.actionButtonStyle || Ft,
    onClick: (m) => {
      Zt(t.action) && (t.action.onClick == null || t.action.onClick.call(t.action, m), !m.defaultPrevented && q());
    },
    className: ot(x == null ? void 0 : x.actionButton, t == null || (u = t.classNames) == null ? void 0 : u.actionButton)
  }, t.action.label) : null);
};
function Ce() {
  if (typeof window > "u" || typeof document > "u") return "ltr";
  const r = document.documentElement.getAttribute("dir");
  return r === "auto" || !r ? window.getComputedStyle(document.documentElement).direction : r;
}
function dn(r, a) {
  const s = {};
  return [
    r,
    a
  ].forEach((l, f) => {
    const d = f === 1, h = d ? "--mobile-offset" : "--offset", y = d ? nn : en;
    function p(u) {
      [
        "top",
        "right",
        "bottom",
        "left"
      ].forEach((w) => {
        s[`${h}-${w}`] = typeof u == "number" ? `${u}px` : u;
      });
    }
    typeof l == "number" || typeof l == "string" ? p(l) : typeof l == "object" ? [
      "top",
      "right",
      "bottom",
      "left"
    ].forEach((u) => {
      l[u] === void 0 ? s[`${h}-${u}`] = y : s[`${h}-${u}`] = typeof l[u] == "number" ? `${l[u]}px` : l[u];
    }) : p(y);
  }), s;
}
const un = /* @__PURE__ */ o.forwardRef(function(a, s) {
  const { id: l, invert: f, position: d = "bottom-right", hotkey: h = [
    "altKey",
    "KeyT"
  ], expand: y, closeButton: p, className: u, offset: w, mobileOffset: t, theme: R = "light", richColors: $, duration: C, style: Mt, visibleToasts: ft = tn, toastOptions: v, dir: z = Ce(), gap: lt = an, icons: Z, containerAriaLabel: Nt = "Notifications" } = a, [F, e] = o.useState([]), ct = o.useMemo(() => l ? F.filter((b) => b.toasterId === l) : F.filter((b) => !b.toasterId), [
    F,
    l
  ]), Ft = o.useMemo(() => Array.from(new Set([
    d
  ].concat(ct.filter((b) => b.position).map((b) => b.position)))), [
    ct,
    d
  ]), [_, J] = o.useState([]), [nt, Y] = o.useState(!1), [dt, Et] = o.useState(!1), [x, L] = o.useState(R !== "system" ? R : typeof window < "u" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), X = o.useRef(null), ut = h.join("+").replace(/Key/g, "").replace(/Digit/g, ""), j = o.useRef(null), mt = o.useRef(!1), bt = o.useCallback((b) => {
    e((E) => {
      var S;
      return (S = E.find((B) => B.id === b.id)) != null && S.delete || V.dismiss(b.id), E.filter(({ id: B }) => B !== b.id);
    });
  }, []);
  return o.useEffect(() => V.subscribe((b) => {
    if (b.dismiss) {
      requestAnimationFrame(() => {
        e((E) => E.map((S) => S.id === b.id ? {
          ...S,
          delete: !0
        } : S));
      });
      return;
    }
    setTimeout(() => {
      Fe.flushSync(() => {
        e((E) => {
          const S = E.findIndex((B) => B.id === b.id);
          return S !== -1 ? [
            ...E.slice(0, S),
            {
              ...E[S],
              ...b
            },
            ...E.slice(S + 1)
          ] : [
            b,
            ...E
          ];
        });
      });
    });
  }), [
    F
  ]), o.useEffect(() => {
    if (R !== "system") {
      L(R);
      return;
    }
    if (R === "system" && (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? L("dark") : L("light")), typeof window > "u") return;
    const b = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      b.addEventListener("change", ({ matches: E }) => {
        L(E ? "dark" : "light");
      });
    } catch {
      b.addListener(({ matches: S }) => {
        try {
          L(S ? "dark" : "light");
        } catch (B) {
          console.error(B);
        }
      });
    }
  }, [
    R
  ]), o.useEffect(() => {
    F.length <= 1 && Y(!1);
  }, [
    F
  ]), o.useEffect(() => {
    const b = (E) => {
      var S;
      if (h.every((k) => E[k] || E.code === k)) {
        var wt;
        Y(!0), (wt = X.current) == null || wt.focus();
      }
      E.code === "Escape" && (document.activeElement === X.current || (S = X.current) != null && S.contains(document.activeElement)) && Y(!1);
    };
    return document.addEventListener("keydown", b), () => document.removeEventListener("keydown", b);
  }, [
    h
  ]), o.useEffect(() => {
    if (X.current)
      return () => {
        j.current && (j.current.focus({
          preventScroll: !0
        }), j.current = null, mt.current = !1);
      };
  }, [
    X.current
  ]), // Remove item from normal navigation flow, only available via hotkey
  /* @__PURE__ */ o.createElement("section", {
    ref: s,
    "aria-label": `${Nt} ${ut}`,
    tabIndex: -1,
    "aria-live": "polite",
    "aria-relevant": "additions text",
    "aria-atomic": "false",
    suppressHydrationWarning: !0
  }, Ft.map((b, E) => {
    var S;
    const [B, wt] = b.split("-");
    return ct.length ? /* @__PURE__ */ o.createElement("ol", {
      key: b,
      dir: z === "auto" ? Ce() : z,
      tabIndex: -1,
      ref: X,
      className: u,
      "data-sonner-toaster": !0,
      "data-sonner-theme": x,
      "data-y-position": B,
      "data-x-position": wt,
      style: {
        "--front-toast-height": `${((S = _[0]) == null ? void 0 : S.height) || 0}px`,
        "--width": `${sn}px`,
        "--gap": `${lt}px`,
        ...Mt,
        ...dn(w, t)
      },
      onBlur: (k) => {
        mt.current && !k.currentTarget.contains(k.relatedTarget) && (mt.current = !1, j.current && (j.current.focus({
          preventScroll: !0
        }), j.current = null));
      },
      onFocus: (k) => {
        k.target instanceof HTMLElement && k.target.dataset.dismissible === "false" || mt.current || (mt.current = !0, j.current = k.relatedTarget);
      },
      onMouseEnter: () => Y(!0),
      onMouseMove: () => Y(!0),
      onMouseLeave: () => {
        dt || Y(!1);
      },
      onDragEnd: () => Y(!1),
      onPointerDown: (k) => {
        k.target instanceof HTMLElement && k.target.dataset.dismissible === "false" || Et(!0);
      },
      onPointerUp: () => Et(!1)
    }, ct.filter((k) => !k.position && E === 0 || k.position === b).map((k, vt) => {
      var pt, Rt;
      return /* @__PURE__ */ o.createElement(cn, {
        key: k.id,
        icons: Z,
        index: vt,
        toast: k,
        defaultRichColors: $,
        duration: (pt = v == null ? void 0 : v.duration) != null ? pt : C,
        className: v == null ? void 0 : v.className,
        descriptionClassName: v == null ? void 0 : v.descriptionClassName,
        invert: f,
        visibleToasts: ft,
        closeButton: (Rt = v == null ? void 0 : v.closeButton) != null ? Rt : p,
        interacting: dt,
        position: b,
        style: v == null ? void 0 : v.style,
        unstyled: v == null ? void 0 : v.unstyled,
        classNames: v == null ? void 0 : v.classNames,
        cancelButtonStyle: v == null ? void 0 : v.cancelButtonStyle,
        actionButtonStyle: v == null ? void 0 : v.actionButtonStyle,
        closeButtonAriaLabel: v == null ? void 0 : v.closeButtonAriaLabel,
        removeToast: bt,
        toasts: ct.filter((st) => st.position == k.position),
        heights: _.filter((st) => st.position == k.position),
        setHeights: J,
        expandByDefault: y,
        gap: lt,
        expanded: nt,
        swipeDirections: a.swipeDirections
      });
    })) : null;
  }));
});
class pe extends Error {
  constructor(s, l) {
    super(s);
    Ee(this, "code");
    this.name = "CaptchaApiError", this.code = l;
  }
}
function te(r, a) {
  var d;
  if (!r || typeof r != "object")
    return new pe(a);
  const s = r, l = s.err_message ?? s.message ?? a, f = (d = s.errors) == null ? void 0 : d.code;
  return new pe(l, f);
}
const mn = "/captcha/challenge";
function pn(r) {
  return `${r.replace(/\/$/, "")}${mn}`;
}
const gn = `async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hasLeadingZeroBits(hexHash, difficulty) {
  const bitsNeeded = Math.ceil(difficulty / 4);
  const prefix = hexHash.slice(0, bitsNeeded);
  const binary = parseInt(prefix, 16).toString(2).padStart(bitsNeeded * 4, "0");
  return binary.startsWith("0".repeat(difficulty));
}
self.onmessage = async ({ data }) => {
  const { nonce, difficulty, challenge_id } = data;
  let solution = 0;
  while (true) {
    const hash = await sha256Hex(nonce + ":" + solution);
    if (hasLeadingZeroBits(hash, difficulty)) {
      self.postMessage({ challenge_id, solution });
      return;
    }
    solution++;
  }
};`;
let Jt = null;
const Qt = /* @__PURE__ */ new Set();
function hn() {
  if (Jt) return Jt;
  if (typeof window > "u" || typeof Worker > "u")
    throw new Error("CAPTCHA worker is not available in this environment");
  const r = new Blob([gn], { type: "application/javascript" });
  return Jt = URL.createObjectURL(r), Jt;
}
function fn() {
  for (const r of Qt)
    r.terminate();
  Qt.clear();
}
async function bn(r, a) {
  const s = pn(r), l = await fetch(s, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...a
    }
  }), f = await l.json();
  if (!l.ok || !f.success)
    throw te(f, "Failed to load CAPTCHA challenge");
  return f.data;
}
function wn(r) {
  return new Promise((a, s) => {
    let l;
    try {
      l = new Worker(hn());
    } catch (d) {
      s(d instanceof Error ? d : new Error("Failed to start CAPTCHA worker"));
      return;
    }
    Qt.add(l);
    const f = () => {
      Qt.delete(l), l.terminate();
    };
    l.onmessage = ({ data: d }) => {
      f(), a(d);
    }, l.onerror = (d) => {
      f(), s(new Error(d.message || "CAPTCHA worker failed"));
    }, l.postMessage(r);
  });
}
async function Ae(r, a) {
  const s = await bn(r, a);
  return wn(s);
}
function ce({ className: r }) {
  return /* @__PURE__ */ n(
    "svg",
    {
      className: r,
      width: "1em",
      height: "1em",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      "aria-hidden": !0,
      children: /* @__PURE__ */ n("path", { d: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" })
    }
  );
}
const vn = "/login", yn = "/register", kn = "/password/reset-request", xn = "/password/reset-confirm", de = [
  { key: "min_length", labelKey: "pwdRuleMinLength", test: (r) => r.length >= 8 },
  { key: "uppercase", labelKey: "pwdRuleUppercase", test: (r) => /[A-Z]/.test(r) },
  { key: "lowercase", labelKey: "pwdRuleLowercase", test: (r) => /[a-z]/.test(r) },
  { key: "number", labelKey: "pwdRuleNumber", test: (r) => /[0-9]/.test(r) },
  { key: "special", labelKey: "pwdRuleSpecial", test: (r) => /[^A-Za-z0-9]/.test(r) }
], Nn = "© 2026 DFA. All rights reserved.", En = {
  signIn: "Sign in",
  createAccount: "Create account",
  forgotPassword: "Forgot password?",
  alreadyHaveAccountPrompt: "Already have an account?",
  signInLinkText: "Sign in.",
  dontHaveAccountPrompt: "Don't have an account?",
  registerHereLinkText: "Register here.",
  firstName: "First name",
  lastName: "Last name",
  username: "Username",
  email: "Email",
  emailId: "Email ID",
  password: "Password",
  confirmPassword: "Confirm Password",
  language: "Language",
  enterUsername: "Enter username",
  enterPassword: "Enter password",
  reEnterPassword: "Re-enter password",
  enterFirstName: "Enter first name",
  enterLastName: "Enter last name",
  enterEmail: "Enter your email",
  signInError: "Invalid email or password",
  passwordsDoNotMatch: "Passwords do not match",
  registrationNotAvailable: "Registration is not available yet.",
  loginTitle: "Explore. Visualize. Share.",
  loginDescription: "Log in to create charts, explore indicators, and save visualisations in your personal gallery.",
  back: "Back",
  forgotPasswordTitle: "Forgot Password",
  forgotPasswordDescription: "Enter your username and we will send your new credentials to your registered email.",
  send: "Send",
  sending: "Sending…",
  passwordResetSuccessMessage: "Your password has been reset. Check your email for your new credentials.",
  redirectingToLogin: "Redirecting to login page in",
  backToSignIn: "Back to Sign In",
  loginFailed: "Sign in failed",
  registrationFailed: "Registration failed",
  passwordResetFailed: "Password reset failed",
  pwdRuleMinLength: "At least 8 characters",
  pwdRuleUppercase: "At least one uppercase letter (A–Z)",
  pwdRuleLowercase: "At least one lowercase letter (a–z)",
  pwdRuleNumber: "At least one number (0–9)",
  pwdRuleSpecial: "At least one special character (!@#$%^&*…)",
  passwordValidationTitle: "Password requirements not met",
  requiredFieldsError: "Please fill in all required fields",
  resetPasswordTitle: "Set New Password",
  resetPasswordDescription: "Enter and confirm your new password. It must meet the requirements below.",
  newPassword: "New Password",
  enterNewPassword: "Enter new password",
  confirmNewPassword: "Confirm new password",
  setPassword: "Set Password",
  settingPassword: "Setting…",
  passwordResetConfirmSuccessMessage: "Your password has been updated successfully.",
  passwordResetConfirmFailed: "Failed to reset password",
  invalidResetToken: "Invalid or expired reset link.",
  strengthWeak: "Weak",
  strengthFair: "Fair",
  strengthGood: "Good",
  strengthStrong: "Strong",
  strengthExcellent: "Excellent",
  notABot: "I'm not a robot",
  captchaVerifying: "Verifying…",
  captchaProtected: "Protected",
  captchaPrivacy: "Privacy",
  captchaTerms: "Terms",
  captchaExpired: "CAPTCHA expired. Please verify again.",
  copyrightText: Nn
};
function ue({
  label: r,
  verifyingLabel: a,
  protectedLabel: s,
  privacyLabel: l,
  termsLabel: f,
  disabled: d,
  baseUrl: h,
  headers: y,
  onSolutionChange: p,
  onError: u
}) {
  const [w, t] = N("idle");
  Bt(() => () => fn(), []);
  const R = et(async () => {
    if (!(d || w === "loading" || w === "verified")) {
      t("loading"), p == null || p(null);
      try {
        const C = await Ae(h, y);
        t("verified"), p == null || p(C);
      } catch (C) {
        t("error"), p == null || p(null), u == null || u(C instanceof Error ? C.message : "CAPTCHA verification failed");
      }
    }
  }, [h, d, y, u, p, w]);
  return /* @__PURE__ */ n("div", { className: "dtk-signin-captcha", role: "group", "aria-label": r, children: /* @__PURE__ */ c(
    "button",
    {
      type: "button",
      className: "dtk-signin-captcha-panel",
      "data-state": w === "error" ? "idle" : w,
      onClick: () => {
        w === "verified" || w === "loading" || R();
      },
      disabled: d || w === "loading" || w === "verified",
      "aria-busy": w === "loading",
      "aria-pressed": w === "verified",
      children: [
        /* @__PURE__ */ c("span", { className: "dtk-signin-captcha-main", children: [
          /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-check-area", "aria-hidden": !0, children: w === "loading" ? /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-spinner" }) : w === "verified" ? /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-check", children: "✓" }) : null }),
          /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-label", children: w === "loading" ? a : r })
        ] }),
        /* @__PURE__ */ c("span", { className: "dtk-signin-captcha-brand", "aria-hidden": !0, children: [
          /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-logo", children: /* @__PURE__ */ c("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", "aria-hidden": !0, children: [
            /* @__PURE__ */ n(
              "path",
              {
                d: "M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z",
                stroke: "currentColor",
                strokeWidth: "1.5",
                strokeLinejoin: "round"
              }
            ),
            /* @__PURE__ */ n(
              "path",
              {
                d: "M9.5 12.2l1.8 1.8 3.7-3.9",
                stroke: "currentColor",
                strokeWidth: "1.5",
                strokeLinecap: "round",
                strokeLinejoin: "round"
              }
            )
          ] }) }),
          /* @__PURE__ */ n("span", { className: "dtk-signin-captcha-legal-title", children: s }),
          /* @__PURE__ */ c("span", { className: "dtk-signin-captcha-legal-links", children: [
            l,
            " - ",
            f
          ] })
        ] })
      ]
    }
  ) });
}
const Vt = 5;
function ge(r) {
  if (r)
    return {
      challenge_id: r.challenge_id,
      solution: r.solution
    };
}
async function Re(r, a, s, l) {
  const f = `${r.replace(/\/$/, "")}${vn}`, d = {
    username: a.username,
    password: a.password
  }, h = ge(a.captcha);
  h && (d.captcha = h);
  const y = await fetch(f, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...s
    },
    body: JSON.stringify(d)
  }), p = await y.json();
  if (!y.ok)
    throw te(p, l ?? "Invalid username or password");
  return p;
}
async function Tn(r, a, s, l) {
  const f = `${r.replace(/\/$/, "")}${yn}`, d = {
    first_name: a.first_name,
    last_name: a.last_name ?? null,
    username: a.username,
    email: a.email ?? null,
    password: a.password ?? null
  }, h = ge(a.captcha);
  h && (d.captcha = h);
  const y = await fetch(f, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...s
    },
    body: JSON.stringify(d)
  }), p = await y.json();
  if (!y.ok)
    throw te(p, l ?? "Registration failed");
  return p;
}
async function Sn(r, a, s, l, f) {
  const d = `${r.replace(/\/$/, "")}${kn}`, h = { username: a }, y = ge(s);
  y && (h.captcha = y);
  const p = await fetch(d, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...l
    },
    body: JSON.stringify(h)
  }), u = await p.json();
  if (!p.ok)
    throw te(u, f ?? "Password reset failed");
  return { success: !0, message: u.message ?? "" };
}
async function Cn(r, a, s, l, f) {
  const d = `${r.replace(/\/$/, "")}${xn}`, h = await fetch(d, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...l,
      Authorization: `Bearer ${a}`
    },
    body: JSON.stringify({ new_password: s })
  }), y = await h.json();
  if (!h.ok)
    throw new Error(y.err_message ?? y.message ?? f ?? "Failed to reset password");
  return { success: !0, message: y.message ?? "" };
}
function Rn(r) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.trim());
}
function Ln({
  baseUrl: r,
  headers: a,
  onLoginSuccess: s,
  onRegisterSuccess: l,
  onPasswordResetSuccess: f,
  onResetConfirmSuccess: d,
  logoUrl: h,
  appName: y,
  version: p,
  copyrightText: u,
  onBack: w,
  onForgotPasswordSuccess: t,
  initialMode: R = "signin",
  initialResetToken: $,
  onModeChange: C,
  renderAfterSubmit: Mt,
  strings: ft,
  error: v,
  languages: z,
  selectedLanguage: lt,
  onLanguageChange: Z,
  showRegisterPrompt: Nt = !0,
  enableCaptcha: F = !0
}) {
  const e = { ...En, ...ft }, ct = u ?? e.copyrightText, Ft = w != null ? /* @__PURE__ */ n("div", { className: "dtk-signin-back-row", children: /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      className: "dtk-signin-link dtk-signin-back",
      onClick: w,
      "aria-label": e.back,
      children: /* @__PURE__ */ c("span", { className: "dtk-signin-back-inner", children: [
        /* @__PURE__ */ n(ce, { className: "dtk-signin-back-icon" }),
        e.back
      ] })
    }
  ) }) : null, [_, J] = N(
    $ ? "resetconfirm" : R
  ), nt = Dt(C);
  nt.current = C;
  const Y = Dt(!0);
  Te(() => {
    if ($) {
      J((i) => i === "resetconfirm" ? i : "resetconfirm");
      return;
    }
    J((i) => i === R ? i : R);
  }, [R, $]), Bt(() => {
    var i;
    if (Y.current) {
      Y.current = !1;
      return;
    }
    (i = nt.current) == null || i.call(nt, _);
  }, [_]);
  const [dt, Et] = N(""), [x, L] = N(""), [X, ut] = N(!1), [j, mt] = N(""), [bt, b] = N(""), [E, S] = N(""), [B, wt] = N(""), [k, vt] = N(""), [pt, Rt] = N(""), [st, ee] = N(!1), [Tt, ne] = N(!1), [H, at] = N(!1), [rt, W] = N(null), [Ht, se] = N(0), [M, Q] = N(""), [At, Yt] = N(!1), [yt, Pt] = N(!1), [St, gt] = N(Vt), [U] = N($ ?? ""), [tt, kt] = N(""), [It, ae] = N(""), [_t, Ut] = N(!1), [jt, Ot] = N(!1), [q, re] = N(!1), [Lt, $t] = N(!1), [Kt, m] = N(!1);
  Bt(() => {
    if (!yt) return;
    if (St <= 0) {
      t == null || t(), Pt(!1), Q(""), gt(Vt), J("signin");
      return;
    }
    const i = setTimeout(() => gt((A) => A - 1), 1e3);
    return () => clearTimeout(i);
  }, [yt, St, t]);
  const T = et(() => {
    W(null), se((i) => i + 1);
  }, []);
  Bt(() => {
    T();
  }, [_, T]);
  const g = et(
    (i) => {
      le.error(i, { duration: 8e3 }), T();
    },
    [T]
  ), O = Dt(null), Ct = Dt(!1);
  Bt(() => {
    v && v !== O.current && g(v), O.current = v ?? null;
  }, [v, g]), Bt(() => {
    _ === "resetconfirm" && !U && !Ct.current && (Ct.current = !0, g(e.invalidResetToken ?? "Invalid or expired reset link."));
  }, [_, U, g, e.invalidResetToken]);
  const I = et(() => {
    le.error(e.captchaExpired, { duration: 8e3 }), T();
  }, [T, e.captchaExpired]), D = et(
    (i, A) => {
      if (i instanceof pe && i.code === "CAPTCHA_EXPIRED") {
        I();
        return;
      }
      const P = i instanceof Error ? i.message : A;
      g(P);
    },
    [I, g]
  ), xt = !F || rt != null, K = dt.trim().length > 0 && x.length > 0 && xt && !H, G = et(
    async (i) => {
      i.preventDefault();
      const A = dt.trim(), P = x;
      if (!A || !P) {
        g(e.signInError);
        return;
      }
      at(!0);
      try {
        const it = await Re(
          r,
          { username: A, password: P, captcha: rt },
          a,
          e.loginFailed
        );
        await s(it, { username: A });
      } catch (it) {
        D(it, e.loginFailed);
      } finally {
        at(!1);
      }
    },
    [
      dt,
      x,
      r,
      a,
      s,
      rt,
      D,
      g,
      e.signInError,
      e.loginFailed
    ]
  ), Gt = et(
    async (i) => {
      if (i.preventDefault(), !l) {
        g(e.registrationNotAvailable);
        return;
      }
      if (k !== pt) {
        g(e.passwordsDoNotMatch);
        return;
      }
      if (!j.trim() || !E.trim() || !B.trim() || !k.trim() || !pt.trim()) {
        g(e.requiredFieldsError);
        return;
      }
      if (!Rn(B.trim())) {
        g(e.signInError);
        return;
      }
      const A = de.filter((P) => !P.test(k)).map(
        (P) => e[P.labelKey] ?? P.key
      );
      if (A.length > 0) {
        le.error(e.passwordValidationTitle, {
          description: A.join(`
`),
          duration: 1e4
        }), T();
        return;
      }
      at(!0);
      try {
        const P = await Tn(
          r,
          {
            first_name: j.trim(),
            last_name: bt.trim(),
            username: E.trim(),
            email: B.trim(),
            password: k,
            captcha: rt
          },
          a,
          e.registrationFailed
        );
        try {
          const it = F ? await Ae(r, a) : null, zt = await Re(
            r,
            { username: E.trim(), password: k, captcha: it },
            a,
            e.loginFailed
          );
          await s(zt, { username: E.trim() });
        } catch {
          await l(P);
        }
      } catch (P) {
        D(P, e.registrationFailed);
      } finally {
        at(!1);
      }
    },
    [
      l,
      s,
      j,
      bt,
      E,
      B,
      k,
      pt,
      r,
      a,
      F,
      rt,
      D,
      g,
      T,
      e.passwordsDoNotMatch,
      e.registrationNotAvailable,
      e.signInError,
      e.registrationFailed,
      e.loginFailed,
      e.passwordValidationTitle,
      e.pwdRuleMinLength,
      e.pwdRuleUppercase,
      e.pwdRuleLowercase,
      e.pwdRuleNumber,
      e.pwdRuleSpecial,
      e.requiredFieldsError
    ]
  ), ht = et(
    async (i) => {
      i.preventDefault();
      const A = M.trim();
      if (A) {
        if (!f) {
          g(e.registrationNotAvailable);
          return;
        }
        Yt(!0);
        try {
          const P = await Sn(
            r,
            A,
            rt,
            a,
            e.passwordResetFailed
          );
          Pt(!0), gt(Vt), f && await f(P.message);
        } catch (P) {
          D(P, e.passwordResetFailed);
        } finally {
          Yt(!1);
        }
      }
    },
    [
      M,
      r,
      a,
      f,
      rt,
      D,
      g,
      e.registrationNotAvailable,
      e.passwordResetFailed
    ]
  ), he = et(() => {
    if (!f) {
      g(e.registrationNotAvailable);
      return;
    }
    Q(""), Pt(!1), gt(Vt), J("forgotpassword");
  }, [f, g, e.registrationNotAvailable]), Xt = et(() => {
    Q(""), Pt(!1), gt(Vt), J("signin");
  }, []), fe = de.map((i) => ({ ...i, passed: i.test(tt) })), Pe = fe.every((i) => i.passed), be = It.length > 0 && tt !== It, ie = U.length > 0 && tt.length > 0 && It.length > 0 && !be && Pe && !Lt, we = [
    { color: "", label: "" },
    { color: "var(--color-error)", label: e.strengthWeak ?? "Weak" },
    { color: "var(--color-warning)", label: e.strengthFair ?? "Fair" },
    { color: "var(--color-warning)", label: e.strengthGood ?? "Good" },
    { color: "var(--color-success)", label: e.strengthStrong ?? "Strong" },
    { color: "var(--color-success)", label: e.strengthExcellent ?? "Excellent" }
  ], ve = de.filter((i) => i.test(tt)).length, qt = we[ve] ?? we[0], Ie = et(
    async (i) => {
      if (i.preventDefault(), !!ie) {
        $t(!0);
        try {
          const A = await Cn(
            r,
            U,
            tt,
            a,
            e.passwordResetConfirmFailed
          );
          m(!0), await (d == null ? void 0 : d(A.message));
        } catch (A) {
          g(
            A instanceof Error ? A.message : e.passwordResetConfirmFailed ?? "Failed to reset password"
          );
        } finally {
          $t(!1);
        }
      }
    },
    [ie, U, tt, r, a, d, g, e.passwordResetConfirmFailed]
  ), oe = !!(h || y || e.loginTitle || e.loginDescription), _e = _ === "signin" && !Nt && w == null, ye = Dt(null), ke = Dt(null), [Le, xe] = N(1);
  return Te(() => {
    const i = ye.current, A = ke.current;
    if (!i || !A) return;
    const P = () => {
      const zt = i.clientWidth;
      if (i.clientHeight, zt < 768) {
        xe(1);
        return;
      }
      const Ne = A.offsetWidth;
      if (zt <= 0 || Ne <= 0) return;
      const De = Math.min(1, zt / Ne);
      xe(De);
    };
    P();
    const it = new ResizeObserver(P);
    return it.observe(i), it.observe(A), window.addEventListener("resize", P), () => {
      it.disconnect(), window.removeEventListener("resize", P);
    };
  }, [_, oe, F, z == null ? void 0 : z.length, Nt]), /* @__PURE__ */ c(Wt, { children: [
    /* @__PURE__ */ n(un, { position: "top-right", richColors: !0, closeButton: !0 }),
    /* @__PURE__ */ c("div", { className: "dtk-signin-root", children: [
      /* @__PURE__ */ c("div", { className: "dtk-signin-bg", "aria-hidden": !0, children: [
        /* @__PURE__ */ n("div", { className: "dtk-signin-bg-gray" }),
        /* @__PURE__ */ n("div", { className: "dtk-signin-bg-red" })
      ] }),
      /* @__PURE__ */ n("div", { className: "dtk-signin-main" + (oe ? " dtk-signin-main--with-branding" : ""), children: /* @__PURE__ */ n("div", { className: "dtk-signin-viewport-fit", ref: ye, children: /* @__PURE__ */ n(
        "div",
        {
          className: "dtk-signin-scale-inner",
          ref: ke,
          style: { transform: `scale(${Le})` },
          children: /* @__PURE__ */ c("div", { className: "dtk-signin-content-row", children: [
            oe && /* @__PURE__ */ c("div", { className: "dtk-signin-branding", children: [
              h && /* @__PURE__ */ n("div", { className: "dtk-signin-branding-logo", children: /* @__PURE__ */ n("img", { src: h, alt: "" }) }),
              y && /* @__PURE__ */ n("h1", { className: "dtk-signin-branding-app-name", children: y }),
              e.loginTitle != null && e.loginTitle !== "" || e.loginDescription != null && e.loginDescription !== "" ? /* @__PURE__ */ c("div", { className: "dtk-signin-branding-product-lines", children: [
                e.loginTitle != null && e.loginTitle !== "" && /* @__PURE__ */ n("p", { className: "dtk-signin-branding-tagline", children: e.loginTitle }),
                e.loginDescription != null && e.loginDescription !== "" && /* @__PURE__ */ n("p", { className: "dtk-signin-branding-desc", children: e.loginDescription })
              ] }) : null
            ] }),
            /* @__PURE__ */ n("div", { className: "dtk-signin-card-wrap", children: /* @__PURE__ */ n(
              "div",
              {
                className: `dtk-signin-card dtk-signin-card--${_}${_e ? " dtk-signin-card--compact-footer" : ""}`,
                children: _ === "signin" ? /* @__PURE__ */ c(Wt, { children: [
                  /* @__PURE__ */ n("h2", { className: "dtk-signin-card-title", children: e.signIn }),
                  /* @__PURE__ */ c("form", { onSubmit: G, className: "dtk-signin-form", children: [
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-username", className: "dtk-signin-label", children: e.username }),
                      /* @__PURE__ */ n(
                        "input",
                        {
                          id: "dtk-signin-username",
                          type: "text",
                          autoComplete: "username",
                          value: dt,
                          onChange: (i) => Et(i.target.value),
                          placeholder: e.enterUsername,
                          className: "dtk-signin-input",
                          disabled: H
                        }
                      )
                    ] }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-password", className: "dtk-signin-label", children: e.password }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-input-wrap", children: [
                        /* @__PURE__ */ n(
                          "input",
                          {
                            id: "dtk-signin-password",
                            type: X ? "text" : "password",
                            autoComplete: "current-password",
                            value: x,
                            onChange: (i) => L(i.target.value),
                            placeholder: e.enterPassword,
                            className: "dtk-signin-input",
                            disabled: H
                          }
                        ),
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-password-toggle",
                            onClick: () => ut((i) => !i),
                            "aria-label": X ? "Hide password" : "Show password",
                            tabIndex: -1,
                            children: /* @__PURE__ */ n("span", { className: "dtk-signin-eye", "aria-hidden": !0, children: X ? /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
                              /* @__PURE__ */ n("line", { x1: "1", y1: "1", x2: "23", y2: "23" })
                            ] }) : /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
                              /* @__PURE__ */ n("circle", { cx: "12", cy: "12", r: "3" })
                            ] }) })
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ n("div", { className: "dtk-signin-forgot-wrap", children: /* @__PURE__ */ n(
                      "button",
                      {
                        type: "button",
                        className: "dtk-signin-link",
                        onClick: he,
                        children: e.forgotPassword
                      }
                    ) }),
                    z && z.length > 0 && /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-lang", className: "dtk-signin-label", children: e.language }),
                      /* @__PURE__ */ n(
                        "select",
                        {
                          id: "dtk-signin-lang",
                          className: "dtk-signin-select",
                          value: lt ?? "",
                          onChange: (i) => Z == null ? void 0 : Z(i.target.value),
                          disabled: H,
                          children: z.map((i) => /* @__PURE__ */ n("option", { value: i.value, children: i.label }, i.value))
                        }
                      )
                    ] }),
                    F && /* @__PURE__ */ n(
                      ue,
                      {
                        baseUrl: r,
                        headers: a,
                        label: e.notABot,
                        verifyingLabel: e.captchaVerifying,
                        protectedLabel: e.captchaProtected,
                        privacyLabel: e.captchaPrivacy,
                        termsLabel: e.captchaTerms,
                        disabled: H,
                        onSolutionChange: W,
                        onError: g
                      },
                      `captcha-${_}-${Ht}`
                    ),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-form-actions", children: [
                      /* @__PURE__ */ n("button", { type: "submit", className: "dtk-signin-submit", disabled: !K, children: e.signIn }),
                      Mt,
                      Nt && /* @__PURE__ */ n("div", { className: "dtk-signin-bottom-row", children: /* @__PURE__ */ c("p", { className: "dtk-signin-switch", children: [
                        e.dontHaveAccountPrompt,
                        " ",
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-link",
                            onClick: () => J("register"),
                            children: e.registerHereLinkText
                          }
                        )
                      ] }) }),
                      Ft
                    ] })
                  ] })
                ] }) : _ === "register" ? /* @__PURE__ */ c(Wt, { children: [
                  /* @__PURE__ */ n("h2", { className: "dtk-signin-card-title", children: e.createAccount }),
                  /* @__PURE__ */ c("form", { onSubmit: Gt, className: "dtk-signin-form", children: [
                    /* @__PURE__ */ c("div", { className: "dtk-signin-row", children: [
                      /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                        /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-first", className: "dtk-signin-label", children: e.firstName }),
                        /* @__PURE__ */ n(
                          "input",
                          {
                            id: "dtk-signin-first",
                            type: "text",
                            autoComplete: "given-name",
                            value: j,
                            onChange: (i) => mt(i.target.value),
                            placeholder: e.enterFirstName,
                            className: "dtk-signin-input",
                            disabled: H
                          }
                        )
                      ] }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                        /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-last", className: "dtk-signin-label", children: e.lastName }),
                        /* @__PURE__ */ n(
                          "input",
                          {
                            id: "dtk-signin-last",
                            type: "text",
                            autoComplete: "family-name",
                            value: bt,
                            onChange: (i) => b(i.target.value),
                            placeholder: e.enterLastName,
                            className: "dtk-signin-input",
                            disabled: H
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-reg-username", className: "dtk-signin-label", children: e.username }),
                      /* @__PURE__ */ n(
                        "input",
                        {
                          id: "dtk-signin-reg-username",
                          type: "text",
                          autoComplete: "username",
                          value: E,
                          onChange: (i) => S(i.target.value),
                          placeholder: e.enterUsername,
                          className: "dtk-signin-input",
                          disabled: H
                        }
                      )
                    ] }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-reg-email", className: "dtk-signin-label", children: e.emailId }),
                      /* @__PURE__ */ n(
                        "input",
                        {
                          id: "dtk-signin-reg-email",
                          type: "email",
                          autoComplete: "email",
                          value: B,
                          onChange: (i) => wt(i.target.value),
                          placeholder: e.enterEmail,
                          className: "dtk-signin-input",
                          disabled: H
                        }
                      )
                    ] }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-reg-password", className: "dtk-signin-label", children: e.password }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-input-wrap", children: [
                        /* @__PURE__ */ n(
                          "input",
                          {
                            id: "dtk-signin-reg-password",
                            type: st ? "text" : "password",
                            autoComplete: "new-password",
                            value: k,
                            onChange: (i) => vt(i.target.value),
                            placeholder: e.enterPassword,
                            className: "dtk-signin-input",
                            disabled: H
                          }
                        ),
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-password-toggle",
                            onClick: () => ee((i) => !i),
                            "aria-label": st ? "Hide password" : "Show password",
                            tabIndex: -1,
                            children: /* @__PURE__ */ n("span", { className: "dtk-signin-eye", "aria-hidden": !0, children: st ? /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
                              /* @__PURE__ */ n("line", { x1: "1", y1: "1", x2: "23", y2: "23" })
                            ] }) : /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
                              /* @__PURE__ */ n("circle", { cx: "12", cy: "12", r: "3" })
                            ] }) })
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-reg-confirm", className: "dtk-signin-label", children: e.confirmPassword }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-input-wrap", children: [
                        /* @__PURE__ */ n(
                          "input",
                          {
                            id: "dtk-signin-reg-confirm",
                            type: Tt ? "text" : "password",
                            autoComplete: "new-password",
                            value: pt,
                            onChange: (i) => Rt(i.target.value),
                            placeholder: e.reEnterPassword,
                            className: "dtk-signin-input",
                            disabled: H
                          }
                        ),
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-password-toggle",
                            onClick: () => ne((i) => !i),
                            "aria-label": Tt ? "Hide password" : "Show password",
                            tabIndex: -1,
                            children: /* @__PURE__ */ n("span", { className: "dtk-signin-eye", "aria-hidden": !0, children: Tt ? /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
                              /* @__PURE__ */ n("line", { x1: "1", y1: "1", x2: "23", y2: "23" })
                            ] }) : /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                              /* @__PURE__ */ n("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
                              /* @__PURE__ */ n("circle", { cx: "12", cy: "12", r: "3" })
                            ] }) })
                          }
                        )
                      ] })
                    ] }),
                    z && z.length > 0 && /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-signin-reg-lang", className: "dtk-signin-label", children: e.language }),
                      /* @__PURE__ */ n(
                        "select",
                        {
                          id: "dtk-signin-reg-lang",
                          className: "dtk-signin-select",
                          value: lt ?? "",
                          onChange: (i) => Z == null ? void 0 : Z(i.target.value),
                          disabled: H,
                          children: z.map((i) => /* @__PURE__ */ n("option", { value: i.value, children: i.label }, i.value))
                        }
                      )
                    ] }),
                    F && /* @__PURE__ */ n(
                      ue,
                      {
                        baseUrl: r,
                        headers: a,
                        label: e.notABot,
                        verifyingLabel: e.captchaVerifying,
                        protectedLabel: e.captchaProtected,
                        privacyLabel: e.captchaPrivacy,
                        termsLabel: e.captchaTerms,
                        disabled: H,
                        onSolutionChange: W,
                        onError: g
                      },
                      `captcha-${_}-${Ht}`
                    ),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-form-actions", children: [
                      /* @__PURE__ */ n("button", { type: "submit", className: "dtk-signin-submit", disabled: H || !xt, children: e.createAccount }),
                      /* @__PURE__ */ n("div", { className: "dtk-signin-bottom-row", children: /* @__PURE__ */ c("p", { className: "dtk-signin-switch", children: [
                        e.alreadyHaveAccountPrompt,
                        " ",
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-link",
                            onClick: () => J("signin"),
                            children: e.signInLinkText
                          }
                        )
                      ] }) })
                    ] })
                  ] })
                ] }) : _ === "forgotpassword" ? /* @__PURE__ */ c(Wt, { children: [
                  /* @__PURE__ */ n("h2", { className: "dtk-signin-card-title", children: e.forgotPasswordTitle }),
                  /* @__PURE__ */ n("p", { className: "dtk-signin-fp-desc", children: e.forgotPasswordDescription }),
                  yt ? /* @__PURE__ */ c("div", { className: "dtk-signin-fp-success-wrap", children: [
                    /* @__PURE__ */ n("div", { className: "dtk-signin-fp-success", role: "status", children: e.passwordResetSuccessMessage }),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-fp-countdown", "aria-live": "polite", children: [
                      /* @__PURE__ */ n("span", { className: "dtk-signin-fp-countdown-text", children: e.redirectingToLogin }),
                      /* @__PURE__ */ n("span", { className: "dtk-signin-fp-badge", "aria-label": String(St), children: St })
                    ] }),
                    /* @__PURE__ */ n("div", { className: "dtk-signin-form-actions", children: /* @__PURE__ */ n(
                      "button",
                      {
                        type: "button",
                        className: "dtk-signin-submit",
                        onClick: Xt,
                        children: e.backToSignIn
                      }
                    ) })
                  ] }) : /* @__PURE__ */ c("form", { onSubmit: ht, className: "dtk-signin-form", children: [
                    /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                      /* @__PURE__ */ n("label", { htmlFor: "dtk-fp-username", className: "dtk-signin-label", children: e.username }),
                      /* @__PURE__ */ n(
                        "input",
                        {
                          id: "dtk-fp-username",
                          type: "text",
                          autoComplete: "username",
                          value: M,
                          onChange: (i) => Q(i.target.value),
                          placeholder: e.enterUsername,
                          className: "dtk-signin-input",
                          disabled: At,
                          autoFocus: !0
                        }
                      )
                    ] }),
                    F && /* @__PURE__ */ n(
                      ue,
                      {
                        baseUrl: r,
                        headers: a,
                        label: e.notABot,
                        verifyingLabel: e.captchaVerifying,
                        protectedLabel: e.captchaProtected,
                        privacyLabel: e.captchaPrivacy,
                        termsLabel: e.captchaTerms,
                        disabled: At,
                        onSolutionChange: W,
                        onError: g
                      },
                      `captcha-${_}-${Ht}`
                    ),
                    /* @__PURE__ */ c("div", { className: "dtk-signin-form-actions", children: [
                      /* @__PURE__ */ n(
                        "button",
                        {
                          type: "submit",
                          className: "dtk-signin-submit",
                          disabled: !M.trim() || At || !xt,
                          children: At ? e.sending : e.send
                        }
                      ),
                      /* @__PURE__ */ n("div", { className: "dtk-signin-back-row", children: /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          className: "dtk-signin-link dtk-signin-back",
                          onClick: Xt,
                          "aria-label": e.back,
                          children: /* @__PURE__ */ c("span", { className: "dtk-signin-back-inner", children: [
                            /* @__PURE__ */ n(ce, { className: "dtk-signin-back-icon" }),
                            e.back
                          ] })
                        }
                      ) })
                    ] })
                  ] })
                ] }) : (
                  /* resetconfirm mode */
                  /* @__PURE__ */ c(Wt, { children: [
                    /* @__PURE__ */ n("h2", { className: "dtk-signin-card-title", children: e.resetPasswordTitle }),
                    /* @__PURE__ */ n("p", { className: "dtk-signin-fp-desc", children: e.resetPasswordDescription }),
                    U ? Kt ? /* @__PURE__ */ c("div", { className: "dtk-signin-fp-success-wrap", children: [
                      /* @__PURE__ */ n("div", { className: "dtk-signin-fp-success", role: "status", children: e.passwordResetConfirmSuccessMessage }),
                      /* @__PURE__ */ n("div", { className: "dtk-signin-form-actions", style: { marginTop: "1rem" }, children: /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          className: "dtk-signin-submit",
                          onClick: Xt,
                          children: e.backToSignIn
                        }
                      ) })
                    ] }) : /* @__PURE__ */ c("form", { onSubmit: Ie, className: "dtk-signin-form", children: [
                      /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                        /* @__PURE__ */ n("label", { htmlFor: "dtk-rc-new-password", className: "dtk-signin-label", children: e.newPassword }),
                        /* @__PURE__ */ c("div", { className: "dtk-signin-input-wrap", children: [
                          /* @__PURE__ */ n(
                            "input",
                            {
                              id: "dtk-rc-new-password",
                              type: _t ? "text" : "password",
                              autoComplete: "new-password",
                              value: tt,
                              onChange: (i) => {
                                kt(i.target.value), q || re(!0);
                              },
                              placeholder: e.enterNewPassword,
                              className: "dtk-signin-input",
                              disabled: Lt,
                              autoFocus: !0
                            }
                          ),
                          /* @__PURE__ */ n(
                            "button",
                            {
                              type: "button",
                              className: "dtk-signin-password-toggle",
                              onClick: () => Ut((i) => !i),
                              "aria-label": _t ? "Hide password" : "Show password",
                              tabIndex: -1,
                              children: /* @__PURE__ */ n("span", { className: "dtk-signin-eye", "aria-hidden": !0, children: _t ? /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                                /* @__PURE__ */ n("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
                                /* @__PURE__ */ n("line", { x1: "1", y1: "1", x2: "23", y2: "23" })
                              ] }) : /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                                /* @__PURE__ */ n("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
                                /* @__PURE__ */ n("circle", { cx: "12", cy: "12", r: "3" })
                              ] }) })
                            }
                          )
                        ] }),
                        q && tt.length > 0 && /* @__PURE__ */ c("div", { className: "dtk-signin-pwd-strength", children: [
                          /* @__PURE__ */ n("div", { className: "dtk-signin-pwd-strength-bars", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ n(
                            "div",
                            {
                              className: "dtk-signin-pwd-strength-seg",
                              style: {
                                backgroundColor: i <= ve ? qt.color : void 0
                              }
                            },
                            i
                          )) }),
                          qt.label && /* @__PURE__ */ n(
                            "p",
                            {
                              className: "dtk-signin-pwd-strength-label",
                              style: { color: qt.color },
                              children: qt.label
                            }
                          )
                        ] }),
                        q && /* @__PURE__ */ n("ul", { className: "dtk-signin-pwd-rules", children: fe.map((i) => /* @__PURE__ */ c(
                          "li",
                          {
                            className: `dtk-signin-pwd-rule ${i.passed ? "dtk-signin-pwd-rule--pass" : "dtk-signin-pwd-rule--fail"}`,
                            children: [
                              /* @__PURE__ */ n("span", { className: "dtk-signin-pwd-rule-icon", "aria-hidden": !0, children: i.passed ? "✓" : "✗" }),
                              e[i.labelKey] ?? i.key
                            ]
                          },
                          i.key
                        )) })
                      ] }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-field", children: [
                        /* @__PURE__ */ n("label", { htmlFor: "dtk-rc-confirm-password", className: "dtk-signin-label", children: e.confirmPassword }),
                        /* @__PURE__ */ c("div", { className: "dtk-signin-input-wrap", children: [
                          /* @__PURE__ */ n(
                            "input",
                            {
                              id: "dtk-rc-confirm-password",
                              type: jt ? "text" : "password",
                              autoComplete: "new-password",
                              value: It,
                              onChange: (i) => ae(i.target.value),
                              placeholder: e.confirmNewPassword,
                              className: "dtk-signin-input",
                              disabled: Lt
                            }
                          ),
                          /* @__PURE__ */ n(
                            "button",
                            {
                              type: "button",
                              className: "dtk-signin-password-toggle",
                              onClick: () => Ot((i) => !i),
                              "aria-label": jt ? "Hide password" : "Show password",
                              tabIndex: -1,
                              children: /* @__PURE__ */ n("span", { className: "dtk-signin-eye", "aria-hidden": !0, children: jt ? /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                                /* @__PURE__ */ n("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" }),
                                /* @__PURE__ */ n("line", { x1: "1", y1: "1", x2: "23", y2: "23" })
                              ] }) : /* @__PURE__ */ c("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                                /* @__PURE__ */ n("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
                                /* @__PURE__ */ n("circle", { cx: "12", cy: "12", r: "3" })
                              ] }) })
                            }
                          )
                        ] }),
                        be && /* @__PURE__ */ n("p", { className: "dtk-signin-field-error", children: e.passwordsDoNotMatch })
                      ] }),
                      /* @__PURE__ */ c("div", { className: "dtk-signin-form-actions", children: [
                        /* @__PURE__ */ n(
                          "button",
                          {
                            type: "submit",
                            className: "dtk-signin-submit",
                            disabled: !ie,
                            children: Lt ? e.settingPassword : e.setPassword
                          }
                        ),
                        /* @__PURE__ */ n("div", { className: "dtk-signin-back-row", children: /* @__PURE__ */ n(
                          "button",
                          {
                            type: "button",
                            className: "dtk-signin-link dtk-signin-back",
                            onClick: Xt,
                            "aria-label": e.back,
                            children: /* @__PURE__ */ c("span", { className: "dtk-signin-back-inner", children: [
                              /* @__PURE__ */ n(ce, { className: "dtk-signin-back-icon" }),
                              e.back
                            ] })
                          }
                        ) })
                      ] })
                    ] }) : null
                  ] })
                )
              }
            ) })
          ] })
        }
      ) }) }),
      /* @__PURE__ */ c("footer", { className: "dtk-signin-footer", children: [
        p != null && p !== "" && /* @__PURE__ */ c("span", { className: "dtk-signin-footer-version", children: [
          "Version ",
          p
        ] }),
        /* @__PURE__ */ n("span", { className: "dtk-signin-footer-copy", children: ct })
      ] })
    ] })
  ] });
}
export {
  Ln as Login
};
//# sourceMappingURL=dfa-v6-comp-login.js.map
