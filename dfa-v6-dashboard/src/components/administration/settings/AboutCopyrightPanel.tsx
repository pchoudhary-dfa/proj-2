"use client";

import { textFieldClassName } from "@/components/TextField";
import type { SettingsFormValues } from "@/lib/settings/types";
import { useCallback } from "react";

type AboutCopyrightPanelProps = {
  values: SettingsFormValues;
  onChange: (values: SettingsFormValues) => void;
};

export default function AboutCopyrightPanel({
  values,
  onChange,
}: AboutCopyrightPanelProps) {
  const patch = (partial: Partial<SettingsFormValues>) =>
    onChange({ ...values, ...partial });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="sp-field min-w-0">
        <span className="form-label text-text">About</span>
        <textarea
          className={`${textFieldClassName("md", "min-h-[72px] resize-y py-2")}`}
          value={values.about}
          onChange={(e) => patch({ about: e.target.value })}
          rows={3}
        />
      </label>

      <label className="sp-field min-w-0">
        <span className="form-label text-text">Copyright</span>
        <textarea
          className={`${textFieldClassName("md", "min-h-[72px] resize-y py-2")}`}
          value={values.copyright}
          onChange={(e) => patch({ copyright: e.target.value })}
          rows={3}
        />
      </label>
    </div>
  );
}
