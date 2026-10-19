"use client";

import { DFAHelpAdmin } from "dfa-help-admin";
import type { UpdateResponse } from "dfa-help-admin";
import "dfa-help-admin/styles.css";
import { toast } from "sonner";
import { DFA_HELP_ADMIN_URL } from "@/lib/constants";

export default function HelpAdminTab() {
  const handleUpdate = (response: UpdateResponse) => {
    if (response.success) {
      toast.success(response.message || "Saved");
    } else {
      toast.error(response.message || "Update failed");
    }
  };

  const handleError = (error: string) => {
    toast.error(error || "Help admin error");
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <DFAHelpAdmin
        showHeader={false}
        apiBaseUrl={DFA_HELP_ADMIN_URL}
        onUpdate={handleUpdate}
        onError={handleError}
        className="dfa-help-admin-embed"
      />
    </div>
  );
}
