import {
  forwardRef,
  type InputHTMLAttributes,
  type Ref,
} from "react";
import { textFieldClassName, type TextFieldSize } from "@/components/TextField";

/**
 * `sm`: 28px field — table filters / dense UI.
 * `md`: 32px field — panels / toolbars.
 * `lg`: 40px field — main toolbar / breadcrumb.
 */
export type SearchInputBarSize = TextFieldSize;

export type SearchInputBarProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "size"
> & {
  wrapperClassName?: string;
  inputClassName?: string;
  /** Extra classes on the inner field wrapper (width, min-w-0 in flex parents, etc.) */
  fieldClassName?: string;
  /** Table filter rows and other tight layouts: omit outer bordered/padded shell */
  embedded?: boolean;
  /** Icon on the left (e.g. breadcrumb) vs right (default, column filters). */
  iconPosition?: "left" | "right";
  /**
   * Field height and typography preset. When omitted: `sm` if `embedded`, otherwise `md`.
   * Use `inputClassName` / `!h-*` to override height while keeping icon sizing if needed.
   */
  size?: SearchInputBarSize;
  /** Hide search icon while preserving shared input styling. */
  showIcon?: boolean;
};

function iconPaddingForSearch(
  which: TextFieldSize,
  iconPosition: "left" | "right",
): string {
  if (which === "lg") {
    return iconPosition === "left" ? "pl-9 pr-3" : "pl-3 pr-9";
  }
  if (which === "xs") {
    return iconPosition === "left" ? "pl-6 pr-1.5" : "pl-1.5 pr-6";
  }
  if (which === "sm") {
    return iconPosition === "left" ? "pl-7 pr-2" : "pl-2 pr-7";
  }
  return iconPosition === "left" ? "pl-8 pr-2" : "pl-2 pr-8";
}

function searchIconClass(
  which: TextFieldSize,
  iconPosition: "left" | "right",
): string {
  if (which === "lg") {
    const base =
      "pointer-events-none absolute top-1/2 -translate-y-1/2 material-icons mui-icon text-sm text-text-muted leading-none";
    return iconPosition === "left"
      ? `${base} left-3`
      : `${base} right-3`;
  }
  if (which === "xs") {
    const base =
      "pointer-events-none absolute top-1/2 -translate-y-1/2 material-icons !text-xs leading-none text-text-muted";
    return iconPosition === "left" ? `${base} left-1` : `${base} right-1`;
  }
  if (which === "sm") {
    const base =
      "pointer-events-none absolute top-1/2 -translate-y-1/2 material-icons !text-xs leading-none text-text-muted";
    return iconPosition === "left"
      ? `${base} left-1.5`
      : `${base} right-1.5`;
  }
  const base =
    "pointer-events-none absolute top-1/2 -translate-y-1/2 material-icons !text-sm leading-none text-text-muted";
  return iconPosition === "left" ? `${base} left-2` : `${base} right-2`;
}

export const SearchInputBar = forwardRef(function SearchInputBar(
  {
    wrapperClassName = "",
    inputClassName = "",
    fieldClassName = "",
    embedded = false,
    iconPosition = "right",
    size: sizeProp,
    showIcon = true,
    type = "text",
    ...inputProps
  }: SearchInputBarProps,
  ref: Ref<HTMLInputElement>,
) {
  const size = sizeProp ?? (embedded ? "sm" : "md");
  const noIconPadding =
    size === "lg" ? "px-3" : size === "xs" ? "px-1.5" : "px-2";
  const inputPreset = textFieldClassName(
    size,
    showIcon ? iconPaddingForSearch(size, iconPosition) : noIconPadding,
  );
  const iconPreset = searchIconClass(size, iconPosition);
  const shellClass = embedded
    ? wrapperClassName.trim()
    : `border-b border-border p-2 ${wrapperClassName}`.trim();
  return (
    <div className={shellClass}>
      <div className={`relative w-full min-w-0 ${fieldClassName}`.trim()}>
        <input
          ref={ref}
          type={type}
          className={`${inputPreset} ${inputClassName}`.trim()}
          {...inputProps}
        />
        {showIcon ? (
          <span className={iconPreset} aria-hidden>
            search
          </span>
        ) : null}
      </div>
    </div>
  );
});

SearchInputBar.displayName = "SearchInputBar";
