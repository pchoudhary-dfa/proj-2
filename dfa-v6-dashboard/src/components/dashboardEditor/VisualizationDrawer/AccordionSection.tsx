"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type AccordionContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  register: (id: string, defaultOpen: boolean) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

type AccordionGroupProps = {
  children: ReactNode;
  className?: string;
};

export function AccordionGroup({
  children,
  className = "flex flex-col gap-3",
}: AccordionGroupProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const register = useCallback((id: string, defaultOpen: boolean) => {
    setOpenId((prev) => prev ?? (defaultOpen ? id : null));
  }, []);

  return (
    <AccordionContext.Provider value={{ openId, setOpenId, register }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

type AccordionSectionProps = {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function AccordionSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const group = useContext(AccordionContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const id = title;

  useEffect(() => {
    group?.register(id, defaultOpen);
  }, [group, id, defaultOpen]);

  const open = group ? group.openId === id : localOpen;

  function toggle() {
    if (group) {
      group.setOpenId(open ? null : id);
    } else {
      setLocalOpen((v) => !v);
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={toggle}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold ${
          open
            ? "bg-primary text-on-primary"
            : "bg-surface text-text-muted"
        }`}
        aria-expanded={open}
      >
        <span
          className="material-icons !text-lg leading-none transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
          aria-hidden
        >
          chevron_right
        </span>
        <span className="compute-ius-chip__label">{title}</span>
        {badge}
      </button>
      {open ? <div className="bg-surface px-3 py-3">{children}</div> : null}
    </div>
  );
}
