"use client";

import TransactionLogsGridView from "@/components/administration/transactionLogs/TransactionLogsGridView";
import { PageToolbar } from "@/components/PageToolbar";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useCore } from "@/contexts/CoreContext";
import { MOCK_TRANSACTION_LOG_ROWS } from "@/lib/transactionLogs/mockData";

export default function TransactionLogs() {
  const { t } = useCore();

  return (
    <div className="app-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <main className="sys-config bg-surface-muted font-body">
          <PageToolbar
            title={t("TRANSACTION_LOGS", "Transaction Logs")}
            icon="description"
            hideInfo={false}
            onInfoClick={() => {}}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="card mt-0 flex min-h-0 flex-1 flex-col shadow-sm">
              <TransactionLogsGridView rows={MOCK_TRANSACTION_LOG_ROWS} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
