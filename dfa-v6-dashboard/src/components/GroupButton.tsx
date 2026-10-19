"use client";

export type GroupButtonItem = {
  label: string;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};


type GroupButtonProps = {
  buttons: GroupButtonItem[];
};

export default function GroupButton({ buttons }: GroupButtonProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {buttons.map((button, index) => {
        const isPrimary =
          button.variant === "primary" ||
          (button.variant !== "secondary" && index === 0);
        const icon = button.icon;

        return (
          <button
            key={`${button.label}-${index}`}
            type="button"
            className={[
              "inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-all",
              "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              isPrimary
                ? "bg-primary text-on-primary hover:bg-primary-hover"
                : "bg-surface text-text hover:bg-surface-muted",
              index > 0 ? "border-l border-border" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={button.onClick}
            disabled={button.disabled}
          >
            {icon ? (
              <span className="material-icons !text-sm leading-none" aria-hidden>
                {icon}
              </span>
            ) : null}
            {button.label}
          </button>
        );
      })}
    </div>
  );
}
