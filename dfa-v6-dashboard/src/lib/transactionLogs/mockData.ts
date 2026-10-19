export type TransactionLogRow = {
  id: string;
  logId: number;
  eventType: string;
  userName: string;
  dashboardName: string;
  visualizationName: string;
  datawarehouseName: string;
  created: string;
};

export const MOCK_TRANSACTION_LOG_ROWS: TransactionLogRow[] = [
  {
    id: "log-89",
    logId: 89,
    eventType: "Add Visualization",
    userName: "admin",
    dashboardName: "Climate_change_datastory",
    visualizationName: "Temperature Trend",
    datawarehouseName: "Sample Data warehouse",
    created: "May 22, 2026 10:19:50 AM",
  },
  {
    id: "log-88",
    logId: 88,
    eventType: "Dashboard Modified",
    userName: "admin",
    dashboardName: "Climate_change_datastory",
    visualizationName: "-",
    datawarehouseName: "Sample Data warehouse",
    created: "May 22, 2026 09:42:15 AM",
  },
  {
    id: "log-87",
    logId: 87,
    eventType: "Last Login",
    userName: "admin",
    dashboardName: "-",
    visualizationName: "-",
    datawarehouseName: "-",
    created: "May 22, 2026 08:05:03 AM",
  },
  {
    id: "log-86",
    logId: 86,
    eventType: "Add Visualization",
    userName: "admin",
    dashboardName: "Climate_change_datastory",
    visualizationName: "Rainfall Chart",
    datawarehouseName: "Sample Data warehouse",
    created: "May 21, 2026 04:31:22 PM",
  },
  {
    id: "log-85",
    logId: 85,
    eventType: "Dashboard Modified",
    userName: "admin",
    dashboardName: "Climate_change_datastory",
    visualizationName: "-",
    datawarehouseName: "-",
    created: "May 21, 2026 02:18:47 PM",
  },
];
