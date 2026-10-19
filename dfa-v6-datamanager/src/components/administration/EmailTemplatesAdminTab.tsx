"use client";

import { toast } from "sonner";
import { EmailTemplatesTable } from "dfa-mailer-templates";
import { API_KEY, DFA_MAILER_BROWSER_API_BASE } from "@/lib/constants";

export default function EmailTemplatesAdminTab() {
  return (
    <div className="dm-mailer-package-host flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <EmailTemplatesTable
        apiBaseUrl={DFA_MAILER_BROWSER_API_BASE}
        apiKey={API_KEY}
        onError={(err) => toast.error(err)}
        onSuccess={(msg) => toast.success(msg)}
      />
    </div>
  );
}
