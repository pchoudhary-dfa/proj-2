"use client";

import { textFieldClassName } from "@/components/TextField";
import type { DashboardFormValues } from "@/lib/dashboards/types";
import type { Dispatch, SetStateAction } from "react";

type GlobalScriptConfigurationProps = {
  values: DashboardFormValues;
  setValues: Dispatch<SetStateAction<DashboardFormValues>>;
};

export default function GlobalScriptConfiguration({
  values,
  setValues,
}: GlobalScriptConfigurationProps) {
  const updateScript = (field: "css" | "js", value: string) => {
    setValues((prev) => ({
      ...prev,
      globalScripts: { ...prev.globalScripts, [field]: value },
    }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h3 className="text-sm font-semibold text-primary">Global Scripts</h3>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">CSS</span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary"
            title="CSS info"
          >
            i
          </button>
        </div>
        <textarea
          className={textFieldClassName(
            "md",
            "min-h-[200px] w-full resize-y font-mono text-xs py-2",
          )}
          value={values.globalScripts.css}
          onChange={(e) => updateScript("css", e.target.value)}
          placeholder="/* Enter custom CSS here */"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">JS</span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary"
            title="JS info"
          >
            i
          </button>
        </div>
        <textarea
          className={textFieldClassName(
            "md",
            "min-h-[200px] w-full resize-y font-mono text-xs py-2",
          )}
          value={values.globalScripts.js}
          onChange={(e) => updateScript("js", e.target.value)}
          placeholder="// Enter custom JavaScript here"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
