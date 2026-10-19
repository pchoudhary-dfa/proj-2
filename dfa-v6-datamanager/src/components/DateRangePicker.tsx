"use client";

import { useEffect, useRef, useState } from "react";
import { useCoreOptional } from "@/contexts/CoreContext";

const MONTH_KEYS = [
  "MONTH_JANUARY", "MONTH_FEBRUARY", "MONTH_MARCH", "MONTH_APRIL",
  "MONTH_MAY", "MONTH_JUNE", "MONTH_JULY", "MONTH_AUGUST",
  "MONTH_SEPTEMBER", "MONTH_OCTOBER", "MONTH_NOVEMBER", "MONTH_DECEMBER",
] as const;

const MONTH_FALLBACKS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export interface DateRangeValue {
  from: string; // "YYYY-MM-DD" or ""
  to: string;   // "YYYY-MM-DD" or ""
}

export interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Select",
  className = "",
}: DateRangePickerProps) {
  const core = useCoreOptional();
  const months = MONTH_KEYS.map((key, i) => core?.t(key, MONTH_FALLBACKS[i]) ?? MONTH_FALLBACKS[i]);

  const [open, setOpen] = useState(false);
  // pendingFrom: internal start date while user is picking (not yet emitted via onChange)
  const [pendingFrom, setPendingFrom] = useState("");
  const [pickingEnd, setPickingEnd] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const todayStr = getTodayStr();
  const today = new Date(todayStr + "T00:00:00");
  const maxYear = today.getFullYear();
  const maxMonth = today.getMonth();

  const closeCalendar = () => {
    setOpen(false);
    setHovered(null);
    setPendingFrom("");
    setPickingEnd(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popupRef.current?.contains(e.target as Node)
      ) closeCalendar();
    };
    const handleScroll = () => closeCalendar();
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const openCalendar = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupWidth = 270;
      let left = rect.left;
      if (left + popupWidth > window.innerWidth - 8) left = window.innerWidth - popupWidth - 8;
      setPopupPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    const base = from ? new Date(from + "T00:00:00") : today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setPendingFrom("");
    setPickingEnd(false);
    setOpen(true);
  };

  // Only display text when BOTH dates are confirmed — no partial "??-??-????" display
  const displayText = from && to ? `${fmtDisplay(from)} – ${fmtDisplay(to)}` : "";

  const handleDayClick = (dayStr: string) => {
    if (dayStr > todayStr) return;
    if (!pickingEnd) {
      // First click: record start date internally, wait for end date
      setPendingFrom(dayStr);
      setPickingEnd(true);
    } else {
      // Second click: complete the range and emit via onChange
      const start = pendingFrom || dayStr;
      const [newFrom, newTo] = dayStr >= start ? [start, dayStr] : [dayStr, start];
      onChange({ from: newFrom, to: newTo });
      setPendingFrom("");
      setPickingEnd(false);
      setOpen(false);
      setHovered(null);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewYear >= maxYear && viewMonth >= maxMonth) return;
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const yearOptions: number[] = Array.from({ length: 20 }, (_, i) => maxYear - 19 + i);

  // While picking: highlight from pendingFrom → hovered; otherwise show confirmed range
  const activeStart = pickingEnd ? pendingFrom : from;
  const activeEnd = pickingEnd ? (hovered || "") : to;
  const bounds =
    activeStart && activeEnd
      ? activeStart <= activeEnd
        ? { s: activeStart, e: activeEnd }
        : { s: activeEnd, e: activeStart }
      : null;
  const isSingleDay = activeStart && activeEnd && activeStart === activeEnd;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openCalendar}
        className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-border bg-surface text-text hover:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary min-w-[190px]"
      >
        <span className="material-icons !text-[13px] text-text-muted shrink-0">date_range</span>
        <span className={`flex-1 text-left truncate ${displayText ? "text-text" : "text-text-muted"}`}>
          {displayText || placeholder}
        </span>
        {(from || to) && (
          <span
            role="button"
            aria-label="Clear date range"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange({ from: "", to: "" });
              setPendingFrom("");
              setPickingEnd(false);
            }}
            className="material-icons !text-[13px] text-text-muted hover:text-error shrink-0 cursor-pointer"
          >
            close
          </span>
        )}
      </button>

      {open && popupPos && (
        <div
          ref={popupRef}
          style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 9999 }}
          className="bg-surface border border-border rounded-xl shadow-2xl p-3 w-[270px] select-none"
        >
          {/* Month / year navigation */}
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 shrink-0"
            >
              <span className="material-icons !text-base text-text">chevron_left</span>
            </button>
            <div className="flex-1 flex items-center justify-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (viewYear === maxYear && m > maxMonth) return;
                  setViewMonth(m);
                }}
                className="text-sm font-semibold bg-surface border border-border/60 rounded px-1 py-0 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {months.map((name, i) => (
                  <option key={name} value={i} disabled={viewYear === maxYear && i > maxMonth}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setViewYear(y);
                  if (y === maxYear && viewMonth > maxMonth) setViewMonth(maxMonth);
                }}
                className="text-sm font-semibold bg-surface border border-border/60 rounded px-1 py-0 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={nextMonth}
              disabled={viewYear >= maxYear && viewMonth >= maxMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <span className="material-icons !text-base text-text">chevron_right</span>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-0.5">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-text-muted py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`blank-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isFuture = dayStr > todayStr;
              const isToday = dayStr === todayStr;
              const isStart = dayStr === activeStart && !!activeStart;
              const isEnd = dayStr === activeEnd && !!activeEnd && !!activeStart;
              const inRange = bounds ? dayStr > bounds.s && dayStr < bounds.e : false;
              const hasBg = !isSingleDay && (isStart || isEnd ? bounds !== null : inRange);

              const outerCls = [
                "h-8 flex items-center justify-center",
                hasBg ? "bg-primary/10" : "",
                hasBg && isStart ? "rounded-l-full" : "",
                hasBg && isEnd ? "rounded-r-full" : "",
              ].filter(Boolean).join(" ");

              const innerCls = [
                "w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium transition-colors",
                isFuture
                  ? "text-text-muted/30 cursor-not-allowed"
                  : isStart || isEnd
                    ? "bg-primary text-white cursor-pointer"
                    : inRange
                      ? "text-text cursor-pointer hover:bg-primary/20"
                      : `text-text cursor-pointer hover:bg-border/70${isToday ? " ring-1 ring-inset ring-primary/50" : ""}`,
              ].join(" ");

              return (
                <div key={day} className={outerCls}>
                  <button
                    type="button"
                    disabled={isFuture}
                    onClick={() => handleDayClick(dayStr)}
                    onMouseEnter={() => { if (pickingEnd) setHovered(dayStr); }}
                    onMouseLeave={() => { if (pickingEnd) setHovered(null); }}
                    className={innerCls}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Hint shown while picking end date */}
          {pickingEnd && (
            <p className="mt-2 pt-2 border-t border-border text-[10px] text-text-muted text-center">
              {pendingFrom
                ? `From: ${fmtDisplay(pendingFrom)} — click to set end date`
                : "Click to select start date"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
