"use client";

import Drawer from "@/components/Drawer";
import {
  FooterConfigPanel,
  HeaderConfigPanel,
} from "@/components/headerFooter/HeaderFooterFormFields";
import HeaderFooterPreview from "@/components/headerFooter/HeaderFooterPreview";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { TextField } from "@/components/TextField";
import { generateHeaderFooterHtml } from "@/lib/headerFooter/generateHtml";
import type { HeaderFooterFormValues } from "@/lib/headerFooter/types";
import { useEffect, useState } from "react";
import RequiredLabel from "@/components/RequiredLabel";

export type HeaderFooterDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues: HeaderFooterFormValues;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: HeaderFooterFormValues) => void | Promise<void>;
};

export default function HeaderFooterDrawer({
  open,
  mode,
  initialValues,
  saving = false,
  onClose,
  onSave,
}: HeaderFooterDrawerProps) {
  const [values, setValues] = useState<HeaderFooterFormValues>(initialValues);

  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  const title =
    mode === "edit" ? "Edit Header and Footer" : "Add Header and Footer";

  const handleSave = () => {
    const { headerHTML, footerHTML } = generateHeaderFooterHtml(
      values.header,
      values.footer,
    );
    void onSave(values);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="70%"
      zIndexClassName="z-[500]"
      title={title}
      headerActions={
        saving ? (
          <button
            type="button"
            className="btn-comp-primary !h-9 gap-1.5 !text-xs font-semibold"
            disabled
          >
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            Saving…
          </button>
        ) : (
          <PrimarySaveButton
            className="!h-9 !text-xs font-semibold"
            onClick={handleSave}
          >
            Save Changes
          </PrimarySaveButton>
        )
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <label className="sp-field min-w-0">
          <h3 className="text-sm uppercase font-medium text-text-muted">Header/Footer</h3>
          <RequiredLabel label="Name" />
          <TextField
            fieldSize="md"
            value={values.theme}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, theme: e.target.value }))
            }
            placeholder="Enter theme name"
            autoComplete="off"
          />
        </label>

        <HeaderFooterPreview header={values.header} footer={values.footer} />

        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Configuration
          </h3>
          <HeaderConfigPanel
            config={values.header}
            onChange={(header) => setValues((prev) => ({ ...prev, header }))}
          />
          <FooterConfigPanel
            config={values.footer}
            onChange={(footer) => setValues((prev) => ({ ...prev, footer }))}
          />
        </div>
      </div>
    </Drawer>
  );
}
