"use client";

import type { SettingsFormValues } from "@/lib/settings/types";
import { useId } from "react";

type ThemePanelProps = {
  values: SettingsFormValues;
  onChange: (values: SettingsFormValues) => void;
};

function normalizeHex(value: string): string {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return "#000000";
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sp-field min-w-0">
      <span className="form-label text-text">{label}</span>
      <div className="relative w-full">
        <input
          type="text"
          className="field-comp--md w-full pr-11 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="color"
          className="sys-config__color-swatch absolute top-1/2 right-1 h-6 w-8 -translate-y-1/2"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </div>
    </label>
  );
}

function FileField({
  label,
  hint,
  accept,
  onFileNameChange,
}: {
  label: string;
  hint: string;
  accept: string;
  onFileNameChange: (fileName: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="sp-field min-w-0 w-full">
      <label htmlFor={inputId} className="form-label text-text">
        {label}
      </label>
      <div className="sys-config__input-field w-full max-w-none">
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="sys-config__file-input w-full"
          onChange={(e) => {
            const file = e.target.files?.[0];
            onFileNameChange(file?.name ?? "");
          }}
        />
      </div>
      <span className="sys-config__hint">{hint}</span>
    </div>
  );
}

export default function ThemePanel({ values, onChange }: ThemePanelProps) {
  const patch = (partial: Partial<SettingsFormValues>) =>
    onChange({ ...values, ...partial });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <ColorField
          label="Color"
          value={values.primaryColor}
          onChange={(primaryColor) => patch({ primaryColor })}
        />
        <ColorField
          label="Hover Color"
          value={values.accentColor}
          onChange={(accentColor) => patch({ accentColor })}
        />
        <FileField
          label="Favicon"
          accept=".ico,.png,image/x-icon,image/png"
          hint="Supported format .ico, .png; max file size 5 kb"
          onFileNameChange={(favicon) => patch({ favicon })}
        />
        <FileField
          label="Logo"
          accept=".png,.gif,.jpg,.jpeg,image/png,image/gif,image/jpeg"
          hint="Supported format .png, .gif, .jpg; max height 38px, max file size 20 kb"
          onFileNameChange={(logo) => patch({ logo })}
        />
        <FileField
          label="Background Image"
          accept=".png,.gif,.jpg,.jpeg,image/png,image/gif,image/jpeg"
          hint="Supported format .png, .gif, .jpg; max file size 200 kb"
          onFileNameChange={(backgroundImage) => patch({ backgroundImage })}
        />
      </div>
    </div>
  );
}
