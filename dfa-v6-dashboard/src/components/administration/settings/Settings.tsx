"use client";

import AboutCopyrightPanel from "@/components/administration/settings/AboutCopyrightPanel";
import ThemePanel from "@/components/administration/settings/ThemePanel";
import { PageToolbar } from "@/components/PageToolbar";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useCore } from "@/contexts/CoreContext";
import {
  DEFAULT_SETTINGS,
  type SettingsFormValues,
  type SettingsSubTab,
} from "@/lib/settings/types";
import { useCallback, useState } from "react";

export default function Settings() {
  const { t } = useCore();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("about-copyright");
  const [savedValues, setSavedValues] =
    useState<SettingsFormValues>(DEFAULT_SETTINGS);
  const [draftValues, setDraftValues] =
    useState<SettingsFormValues>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSavedValues(draftValues);
      window.alert("Settings saved successfully.");
    } finally {
      setSaving(false);
    }
  }, [draftValues]);

  const handleCancel = useCallback(() => {
    setDraftValues(savedValues);
    setFormKey((key) => key + 1);
  }, [savedValues]);

  return (
    <div className="app-body flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="sys-config bg-surface-muted font-body">
          <PageToolbar
            title={t("SETTINGS", "Settings")}
            icon="settings"
            hideInfo={false}
            onInfoClick={() =>
              window.alert("View and manage system settings.")
            }
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="card mt-0 flex min-h-0 flex-1 flex-col shadow-sm">
              <div className="shrink-0 border-b border-border px-5 pt-3">
                <nav className="flex items-center gap-6">
                  <button
                    type="button"
                    className={`btn-comp-tab !h-8 ${activeSubTab === "about-copyright" ? "active" : ""}`}
                    onClick={() => setActiveSubTab("about-copyright")}
                  >
                    About &amp; Copyright
                  </button>
                  <button
                    type="button"
                    className={`btn-comp-tab !h-8 ${activeSubTab === "theme" ? "active" : ""}`}
                    onClick={() => setActiveSubTab("theme")}
                  >
                    Theme
                  </button>
                </nav>
              </div>
              <div className="min-h-0 overflow-y-auto px-5 py-5 ">
                {activeSubTab === "about-copyright" ? (
                  <AboutCopyrightPanel
                    values={draftValues}
                    onChange={setDraftValues}
                  />
                ) : (
                  <ThemePanel
                    key={formKey}
                    values={draftValues}
                    onChange={setDraftValues}
                  />
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
                {saving ? (
                  <button
                    type="button"
                    className="btn-comp-primary gap-1.5 !text-xs font-semibold"
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
                    className="font-semibold"
                    onClick={() => void handleSave()}
                  >
                    Save
                  </PrimarySaveButton>
                )}
                <SecondaryButton
                  type="button"
                  icon="close"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
