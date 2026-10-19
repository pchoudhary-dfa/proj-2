"use client";

import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import {
  FONT_FAMILY_OPTIONS,
  HEADER_FOOTER_LOGO_OPTIONS,
} from "@/lib/headerFooter/constants";
import type {
  FooterSectionConfig,
  HeaderSectionConfig,
  LogoSlotConfig,
  TextAlign,
  TextBlockConfig,
} from "@/lib/headerFooter/configTypes";
import { useState, type ReactNode } from "react";

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center gap-4 border-b border-border/80 py-2.5 last:border-b-0">
      <span className="w-[140px] shrink-0 form-label text-text">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  className = "w-10",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 cursor-pointer rounded border border-border bg-surface p-0.5 ${className}`}
      aria-label="Color"
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min = 0,
  className = "w-20",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}) {
  return (
    <TextField
      fieldSize="sm"
      type="number"
      min={min}
      className={className}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
    />
  );
}

function FormatToolbar({
  block,
  onChange,
}: {
  block: TextBlockConfig;
  onChange: (patch: Partial<TextBlockConfig>) => void;
}) {
  const toggle = (key: "bold" | "italic" | "underline") => {
    onChange({ [key]: !block[key] });
  };

  const alignBtn = (align: TextAlign, icon: string) => (
    <button
      key={align}
      type="button"
      title={`Align ${align}`}
      onClick={() => onChange({ align })}
      className={`btn-comp-ghost h-7 w-7 rounded text-xs border ${block.align === align ? "bg-primary-soft text-primary border-primary" : "text-text-muted bg-surface-muted"
        }`}
    >
      <span className="material-icons !text-base leading-none" aria-hidden>
        {icon}
      </span>
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        title="Bold"
        onClick={() => toggle("bold")}
        className={`btn-comp-ghost h-7 min-w-7 rounded px-1.5 text-xs border ${block.bold ? "bg-primary-soft text-primary border-primary" : "text-text-muted bg-surface-muted"
          }`}
      >
        B
      </button>
      <button
        type="button"
        title="Italic"
        onClick={() => toggle("italic")}
        className={`btn-comp-ghost h-7 min-w-7 rounded px-1.5 text-xs border ${block.italic ? "bg-primary-soft text-primary border-primary" : "text-text-muted bg-surface-muted"
          }`}
      >
        I
      </button>
      <button
        type="button"
        title="Underline"
        onClick={() => toggle("underline")}
        className={`btn-comp-ghost h-7 min-w-7 rounded px-1.5 text-xs border ${block.underline ? "bg-primary-soft text-primary border-primary" : "text-text-muted bg-surface-muted"
          }`}
      >
        U
      </button>
      {alignBtn("left", "format_align_left")}
      {alignBtn("center", "format_align_center")}
      {alignBtn("right", "format_align_right")}
    </div>
  );
}

function TextBlockEditor({
  block,
  textPlaceholder,
  onChange,
}: {
  block: TextBlockConfig;
  textPlaceholder: string;
  onChange: (patch: Partial<TextBlockConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/80 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <TextField
          fieldSize="sm"
          value={block.text}
          className="w-[40%]"
          placeholder={textPlaceholder}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <SelectField
          value={block.fontFamily}
          className="w-[20%]"
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          placeholder="Select font family"
          options={[...FONT_FAMILY_OPTIONS]}
        />
        <ColorInput
          value={block.color}
          className="w-[3%]"
          onChange={(color) => onChange({ color })}
        />
        <NumberInput
          value={block.fontSize}
          onChange={(v) => onChange({ fontSize: v ?? block.fontSize })}
          className="w-[10%]"
        />
      </div>
      <FormatToolbar block={block} onChange={onChange} />
    </div>
  );
}

function LogoSlotEditor({
  slot,
  onChange,
}: {
  slot: LogoSlotConfig;
  onChange: (patch: Partial<LogoSlotConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/80 py-3 last:border-b-0">
      <SelectField
        value={slot.logoId}
        onChange={(e) => onChange({ logoId: e.target.value })}
        placeholder="Select logo..."
        options={HEADER_FOOTER_LOGO_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <NumberInput
            value={slot.width}
            onChange={(v) => onChange({ width: v ?? slot.width })}
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1">
          <NumberInput
            value={slot.height}
            onChange={(v) => onChange({ height: v ?? slot.height })}
            className="w-full"
          />
        </label>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold ${open ? "bg-primary text-on-primary" : "bg-surface text-text-muted"}`}
        aria-expanded={open}
      >
        <span
          className="material-icons !text-lg leading-none transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
          aria-hidden
        >
          chevron_right
        </span>
        {title}
      </button>
      {open ? (
        <div className="bg-surface px-3 py-1">{children}</div>
      ) : null}
    </div>
  );
}

type HeaderConfigPanelProps = {
  config: HeaderSectionConfig;
  onChange: (config: HeaderSectionConfig) => void;
};

export function HeaderConfigPanel({ config, onChange }: HeaderConfigPanelProps) {
  const patch = (partial: Partial<HeaderSectionConfig>) =>
    onChange({ ...config, ...partial });

  return (
    <AccordionSection title="Header" defaultOpen>
      <SettingRow label="Background Color">
        <ColorInput
          value={config.backgroundColor}
          onChange={(backgroundColor) => patch({ backgroundColor })}
        />
      </SettingRow>
      <SettingRow label="Height">
        <NumberInput
          value={config.height}
          onChange={(v) => patch({ height: v ?? config.height })}
        />
      </SettingRow>
      <SettingRow label="Border Bottom">
        <div className="flex items-center gap-2">
          <ColorInput
            value={config.borderBottomColor}
            onChange={(borderBottomColor) => patch({ borderBottomColor })}
          />
          <NumberInput
            value={config.borderBottom}
            onChange={(v) => patch({ borderBottom: v ?? config.borderBottom })}
          />
        </div>
      </SettingRow>
      <SettingRow label="Gap Bottom">
        <NumberInput
          value={config.gapBottom}
          onChange={(gapBottom) => patch({ gapBottom })}
          placeholder="Height"
        />
      </SettingRow>
      <SettingRow label="Logo 1">
        <LogoSlotEditor
          slot={config.logo1}
          onChange={(logo1) => patch({ logo1: { ...config.logo1, ...logo1 } })}
        />
      </SettingRow>
      <SettingRow label="Logo 2">
        <LogoSlotEditor
          slot={config.logo2}
          onChange={(logo2) => patch({ logo2: { ...config.logo2, ...logo2 } })}
        />
      </SettingRow>
      <SettingRow label="Title 1 - Part 1">
        <TextBlockEditor
          block={config.title1Part1}
          textPlaceholder="Title"
          onChange={(p) =>
            patch({ title1Part1: { ...config.title1Part1, ...p } })
          }
        />
      </SettingRow>
      <SettingRow label="Title 1 - Part 2">
        <TextBlockEditor
          block={config.title1Part2}
          textPlaceholder="Subtitle"
          onChange={(p) =>
            patch({ title1Part2: { ...config.title1Part2, ...p } })
          }
        />
      </SettingRow>
      <SettingRow label="Title 2">
        <TextBlockEditor
          block={config.title2}
          textPlaceholder="Subtitle"
          onChange={(p) => patch({ title2: { ...config.title2, ...p } })}
        />
      </SettingRow>
      <SettingRow label="Language Selector">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={config.languageSelectorEnabled}
            onChange={(e) =>
              patch({ languageSelectorEnabled: e.target.checked })
            }
          />
          Show language selector
        </label>
      </SettingRow>
      <SettingRow label="Browser Icon">
        <SelectField
          value={config.browserIconId}
          onChange={(e) => patch({ browserIconId: e.target.value })}
          placeholder="Select logo..."
          options={HEADER_FOOTER_LOGO_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </SettingRow>
    </AccordionSection>
  );
}

type FooterConfigPanelProps = {
  config: FooterSectionConfig;
  onChange: (config: FooterSectionConfig) => void;
};

export function FooterConfigPanel({ config, onChange }: FooterConfigPanelProps) {
  const patch = (partial: Partial<FooterSectionConfig>) =>
    onChange({ ...config, ...partial });

  return (
    <AccordionSection title="Footer">
      <SettingRow label="Background Color">
        <ColorInput
          value={config.backgroundColor}
          onChange={(backgroundColor) => patch({ backgroundColor })}
        />
      </SettingRow>
      <SettingRow label="Height">
        <NumberInput
          value={config.height}
          onChange={(v) => patch({ height: v ?? config.height })}
        />
      </SettingRow>
      <SettingRow label="Border Top">
        <div className="flex items-center gap-2">
          <ColorInput
            value={config.borderTopColor}
            onChange={(borderTopColor) => patch({ borderTopColor })}
          />
          <NumberInput
            value={config.borderTop}
            onChange={(v) => patch({ borderTop: v ?? config.borderTop })}
          />
        </div>
      </SettingRow>
      <SettingRow label="Logo 1">
        <LogoSlotEditor
          slot={config.logo1}
          onChange={(logo1) => patch({ logo1: { ...config.logo1, ...logo1 } })}
        />
      </SettingRow>
      <SettingRow label="Logo 2">
        <LogoSlotEditor
          slot={config.logo2}
          onChange={(logo2) => patch({ logo2: { ...config.logo2, ...logo2 } })}
        />
      </SettingRow>
      <div className="flex flex-col gap-2 py-2">
        <SettingRow label="Caption 1">
          <TextBlockEditor
            block={config.caption1}
            textPlaceholder="Caption"
            onChange={(p) =>
              patch({ caption1: { ...config.caption1, ...p } })
            }
          />
        </SettingRow>
        <SettingRow label="Caption 2">
          <TextBlockEditor
            block={config.caption2}
            textPlaceholder="Caption"
            onChange={(p) =>
              patch({ caption2: { ...config.caption2, ...p } })
            }
          />
        </SettingRow>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={config.captionsInline}
            onChange={(e) => patch({ captionsInline: e.target.checked })}
          />
          Captions Inline
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={config.fixedAtBottom}
            onChange={(e) => patch({ fixedAtBottom: e.target.checked })}
          />
          Footer fixed at bottom
        </label>
      </div>
    </AccordionSection>
  );
}
