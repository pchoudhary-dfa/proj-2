import React, { useState, useEffect, useMemo } from 'react';
import { EmailLog, EmailLogsTableProps, PaginatedResponse } from '../types';
import { EmailLogService } from '../services/api';
import './EmailLogsTable.css';

type I18nMap = Record<string, string>;

const en: I18nMap = {
  emailLogs: 'Email Logs',
  loading: 'Loading...',
  filters: 'Filters',
  csv: 'CSV',
  excel: 'Excel',
  json: 'JSON',
  refresh: 'Refresh',
  clearAll: 'Clear All',
  closeFilters: 'Close Filters',
  status: 'Status',
  templateKey: 'Template Key',
  recipientEmail: 'Recipient Email',
  priority: 'Priority',
  dateFrom: 'Date From',
  dateTo: 'Date To',
  allStatuses: 'All Statuses',
  allTemplateKeys: 'All Template Keys',
  allPriorities: 'All Priorities',
  pending: 'Pending',
  sent: 'Sent',
  failed: 'Failed',
  retrying: 'Retrying',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
  searchRecipientEmail: 'Search recipient email...',
  recipient: 'Recipient',
  subject: 'Subject',
  retryCount: 'Retry Count',
  created: 'Created',
  sentAt: 'Sent',
  error: 'Error',
  showingXofYRecords: 'Showing {x} of {y} records',
  previous: 'Previous',
  next: 'Next',
  perPage: 'Per page:',
  emailLogsRefreshed: 'Email logs refreshed',
  csvDownloaded: 'CSV file downloaded successfully',
  csvFailed: 'Failed to export CSV file',
  excelDownloaded: 'Excel file downloaded successfully',
  excelFailed: 'Failed to export Excel file',
  jsonDownloaded: 'JSON file downloaded successfully',
  jsonFailed: 'Failed to export JSON file',
  failedToLoadLogs: 'Failed to load email logs',
  failedToLoadPaginatedLogs: 'Failed to load paginated email logs',
};

function interpolate(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str;
  return str.replace(/\{(.*?)\}/g, (_, k) => String(vars[k] ?? ''));
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface FilterState {
  status: string;
  template_key: string;
  recipient_email: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
}

export const EmailLogsTable: React.FC<
  EmailLogsTableProps & {
    translations?: I18nMap;
    t?: TFunc;
  }
> = ({
  apiBaseUrl,
  apiKey,
  onError,
  onSuccess,
  userData,
  getLogs,
  getLogsPaginated,
  translations,
  t: i18nT,
  defaultPageSize = 20
}) => {
  const t = (key: keyof typeof en, vars?: Record<string, string | number>) => {
    // If consumer passed next-intl's t, use it directly
    if (i18nT) return i18nT(key as string, vars);
    // Otherwise use provided translations map (or fallback to built-in English)
    const source = (translations && translations[key]) || en[key];
    return interpolate(source, vars);
  };
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const apiService = useMemo(
    () =>
      new EmailLogService(apiBaseUrl, {
        defaultHeaders: apiKey ? { "X-Api-Key": apiKey } : {},
      }),
    [apiBaseUrl, apiKey]
  );
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<FilterState>({
    status: '',
    template_key: '',
    recipient_email: '',
    priority: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [totalCount, setTotalCount] = useState(0);
  const [usePagination, setUsePagination] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    status: '',
    template_key: '',
    recipient_email: '',
    priority: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
  const applyFilters = () => {
    let filtered = [...logs];
    const f = appliedFilters;
  
    if (f.status) filtered = filtered.filter(log => log.status === f.status);
  
    if (f.template_key) {
      filtered = filtered.filter(log =>
        log.template_key?.toLowerCase().includes(f.template_key.toLowerCase())
      );
    }
  
    if (f.recipient_email) {
      filtered = filtered.filter(log =>
        log.recipient_email?.toLowerCase().includes(f.recipient_email.toLowerCase())
      );
    }
  
    if (f.priority) filtered = filtered.filter(log => log.priority === f.priority);
  
    if (f.dateFrom) {
      filtered = filtered.filter(log => {
        const d = new Date(log.created_at);
        return d >= new Date(f.dateFrom);
      });
    }
    if (f.dateTo) {
      filtered = filtered.filter(log => {
        const d = new Date(log.created_at);
        const to = new Date(f.dateTo);
        to.setHours(23, 59, 59, 999);
        return d <= to;
      });
    }
  
    setFilteredLogs(filtered);
    // Only reset to page 1 when not using server-side pagination. When usePagination is true,
    // this effect also runs after each page fetch (logs change); resetting here would overwrite
    // the current page and trigger a second API call for page 1.
    if (!usePagination) {
      setCurrentPage(1);
    }
  };

  // 2) only recompute when logs OR appliedFilters change
  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setShowFilters(false);
    // When using pagination, going back to page 1 after applying filters so the user sees filtered results from the start.
    if (usePagination) {
      setCurrentPage(1);
    }
  };
  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, appliedFilters]);
  
  // 3) applyFilters now reads from appliedFilters, not filters
 

  const loadLogs = async () => {
    try {
      setLoading(true);
      if (usePagination) {
        await loadLogsPaginated();
      } else {
        // Use prop function if provided, otherwise use internal API service
        const data = getLogs ? await getLogs() : await apiService.getAllLogs();
        // Ensure we have an array of logs
        const logsArray = Array.isArray(data) ? data : [];
        setLogs(logsArray);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToLoadLogs');
      console.error('Error loading email logs:', error);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadLogsPaginated = async () => {
    try {
      const response = getLogsPaginated 
        ? await getLogsPaginated(currentPage, pageSize)
        : await apiService.getLogsPaginated(currentPage, pageSize);
      
      setLogs(response.results);
      setTotalCount(response.count);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToLoadPaginatedLogs');
      console.error('Error loading paginated email logs:', error);
      onError?.(errorMessage);
      throw error;
    }
  };

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      template_key: '',
      recipient_email: '',
      priority: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  const getUniqueTemplateKeys = () => {
    const templateKeys = logs.map(log => log.template_key).filter(Boolean);
    return Array.from(new Set(templateKeys)).sort();
  };

  const getUniqueRecipients = () => {
    const recipients = logs.map(log => log.recipient_email).filter(Boolean);
    return Array.from(new Set(recipients)).sort();
  };

  const handleExportCSV = () => {
    try {
      // Create CSV headers
      const headers = [t('templateKey'), t('recipientEmail'), 'Recipient Name', t('subject'), t('status'), t('priority'), t('retryCount'), 'Max Retries', t('created'), t('sentAt'), t('error')];
      
      // Convert filtered logs to CSV rows
      const csvRows = filteredLogs.map(log => [
        log.template_key || '',
        log.recipient_email || '',
        log.recipient_name || '',
        log.subject || '',
        log.status || '',
        log.priority || '',
        log.retry_count?.toString() || '0',
        log.max_retries?.toString() || '0',
        log.created_at || '',
        log.sent_at || '',
        log.error_message || ''
      ]);
      
      // Combine headers and data
      const csvContent = [headers, ...csvRows]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `email_logs_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onSuccess?.(t('csvDownloaded'));
    } catch (error) {
      onError?.(t('csvFailed'));
    }
  };

  const handleExportJSON = () => {
    try {
      // Create formatted JSON data
      const jsonData = {
        exported_at: new Date().toISOString(),
        total_logs: filteredLogs.length,
        logs: filteredLogs.map(log => ({
          id: log.id,
          template_key: log.template_key,
          recipient_email: log.recipient_email,
          recipient_name: log.recipient_name,
          subject: log.subject,
          html_content: log.html_content,
          text_content: log.text_content,
          context: log.context,
          status: log.status,
          priority: log.priority,
          sent_at: log.sent_at,
          error_message: log.error_message,
          retry_count: log.retry_count,
          max_retries: log.max_retries,
          created_at: log.created_at,
          updated_at: log.updated_at
        }))
      };
      
      // Create and download file
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `email_logs_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onSuccess?.(t('jsonDownloaded'));
    } catch (error) {
      onError?.(t('jsonFailed'));
    }
  };

  const handleExportExcel = async () => {
    try {
      const mod = await import("xlsx");
      const XLSX: any = (mod as any).default ?? mod; // CJS/ESM interop

      // Visible headers in the sheet
      const headers = [
        t('templateKey'),
        t('recipientEmail'),
        "Recipient Name",
        t('subject'),
        t('status'),
        t('priority'),
        t('retryCount'),
        "Max Retries",
        t('created'),
        t('sentAt'),
        t('error'),
      ];

      // Convert to Date objects for Excel date columns
      const toExcelDate = (v: unknown) => {
        const d = parseApiDate(v);
        return d ? d : ""; // if invalid/empty, keep empty
      };

      // Rows from filtered logs
      const rows = filteredLogs.map((log) => [
        log.template_key ?? "",
        log.recipient_email ?? "",
        log.recipient_name ?? "",
        log.subject ?? "",
        log.status ?? "",
        log.priority ?? "",
        Number(log.retry_count ?? 0),
        Number(log.max_retries ?? 0),
        toExcelDate(log.created_at),
        toExcelDate(log.sent_at),
        log.error_message ?? "",
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Column widths
      (ws as any)["!cols"] = [
        { wch: 16 }, // Template Key
        { wch: 28 }, // Recipient Email
        { wch: 24 }, // Recipient Name
        { wch: 40 }, // Subject
        { wch: 12 }, // Status
        { wch: 10 }, // Priority
        { wch: 11 }, // Retry Count
        { wch: 12 }, // Max Retries
        { wch: 22 }, // Created At
        { wch: 22 }, // Sent At
        { wch: 40 }, // Error Message
      ];

      // Apply date formats for "Created At" (col 8 index) and "Sent At" (col 9 index)
      const range = XLSX.utils.decode_range(ws["!ref"]!);
      const applyDateFmt = (cellRef: string) => {
        const cell = ws[cellRef];
        if (cell && cell.v instanceof Date) cell.z = "yyyy-mm-dd hh:mm";
      };
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const createdRef = XLSX.utils.encode_cell({ r, c: 8 }); // 0-based column index
        const sentRef = XLSX.utils.encode_cell({ r, c: 9 });
        applyDateFmt(createdRef);
        applyDateFmt(sentRef);
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Email Logs");

      const filename = `email_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      onSuccess?.(t('excelDownloaded'));
    } catch (err) {
      console.error("Excel export failed:", err);
      onError?.(t('excelFailed'));
    }
  };


  const handleFilters = () => {
    setShowFilters(!showFilters);
  };

  // Get current logs to display
  const currentLogs = filteredLogs;

  const parseApiDate = (val: unknown): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

    const s = String(val).trim();
    if (!s) return null;

    // 1) DD-MM-YYYY or DD-MM-YYYY HH:mm[:ss] or DD-MM-YY or DD-MM-YY HH:mm[:ss]
    // Check this FIRST to avoid ambiguous parsing by native Date constructor
    // e.g. "22-09-2025" or "22-09-2025 13:45" or "22-09-25" or "22-09-25 13:45:10"
    const m = s.match(
      /^(\d{2})-(\d{2})-(\d{2,4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (m) {
      const [, dd, mm, yy, hh = "00", mi = "00", ss = "00"] = m;
      // Handle 2-digit or 4-digit year
      let yyyy = yy;
      if (yy.length === 2) {
        // Convert 2-digit year to 4-digit (assuming 20xx for 00-99)
        const year = Number(yy);
        yyyy = (year < 50 ? 2000 + year : 1900 + year).toString();
      }
      const d = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(mi),
        Number(ss)
      );
      return isNaN(d.getTime()) ? null : d;
    }

    // 2) Try native Date parsing (handles ISO format like 2025-01-06T10:30:00Z)
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;

    // 3) Fallback: try YYYY-MM-DD (without time)
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) {
      const [, y, mo, d] = m2;
      const date = new Date(Number(y), Number(mo) - 1, Number(d));
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  };

  const formatDate = (val: unknown): string => {
    const d = parseApiDate(val);
    if (!d) return "-";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'success';
      case 'failed': return 'danger';
      case 'pending': return 'warning';
      case 'retrying': return 'info';
      default: return 'secondary';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'normal': return 'info';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const handleRefresh = () => {
    loadLogs();
    onSuccess?.(t('emailLogsRefreshed'));
  };

  // Modal handlers
  const handleViewLog = (log: EmailLog) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLog(null);
  };

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Reload logs when page or page size changes
  useEffect(() => {
    if (usePagination) {
      loadLogs();
    }
  }, [currentPage, pageSize, usePagination]);

  if (loading) {
    return (
      <div className="email-logs-container">
        <div className="loading">{t('loading')}</div>
      </div>
    );
  }
  const showPager = usePagination && totalCount > pageSize;
  return (
    <div className="email-logs-container">
      <div className="email-logs-header">
        <div className="header-left">
          <h1>{t('emailLogs')}</h1>
          
        </div>
        <div className="header-right">
          <div className="action-buttons-group">
          <button 
              className="btn btn-secondary"
              onClick={handleFilters}
            >
              <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)'}}>
                <path d="M64 157.7C64 141.3 77.3 128 93.7 128L546.4 128C562.8 128 576.1 141.3 576.1 157.7C576.1 165.6 573 173.1 567.4 178.7L400 345.9L400 546.3C400 562.7 386.7 576 370.3 576C362.4 576 354.9 572.9 349.3 567.3L247 465C242.5 460.5 240 454.4 240 448L240 345.9L72.7 178.6C67.1 173.1 64 165.5 64 157.7zM137.9 176L281 319C285.5 323.5 288 329.6 288 336L288 438.1L352 502.1L352 336C352 329.6 354.5 323.5 359 319L502 176L137.9 176z"/>
              </svg>             
          {t('filters')}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={handleExportCSV}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)'}}>
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
              </svg>
              {t('csv')}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={handleExportExcel}
            >
              <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)'}}>
                <path d="M352 224L352 320L480 320L480 224L352 224zM288 224L160 224L160 320L288 320L288 224zM96 384L96 160C96 124.7 124.7 96 160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 384zM480 384L352 384L352 480L480 480L480 384zM288 480L288 384L160 384L160 480L288 480z"/>
              </svg>
              {t('excel')}
            </button>
            <button 
              className="btn btn-secondary refresh-btn"
              onClick={handleRefresh}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)'}}>
                <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
              </svg>
              {t('refresh')}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-header">
          </div>
          <div className="filter-grid">
            <div className="filter-row">
              <div className="filter-item">
                <label>{t('status')}</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="filter-select"
                >
                  <option value="">{t('allStatuses')}</option>
                  <option value="pending">{t('pending')}</option>
                  <option value="sent">{t('sent')}</option>
                  <option value="failed">{t('failed')}</option>
                  <option value="retrying">{t('retrying')}</option>
                </select>
              </div>
              <div className="filter-item">
                <label>{t('templateKey')}</label>
                <select
                  value={filters.template_key}
                  onChange={(e) => handleFilterChange('template_key', e.target.value)}
                  className="filter-select"
                >
                  <option value="">{t('allTemplateKeys')}</option>
                  {getUniqueTemplateKeys().map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <label>{t('priority')}</label>
                <select
                  value={filters.priority}
                  onChange={(e) => handleFilterChange('priority', e.target.value)}
                  className="filter-select"
                >
                  <option value="">{t('allPriorities')}</option>
                  <option value="low">{t('low')}</option>
                  <option value="normal">{t('normal')}</option>
                  <option value="high">{t('high')}</option>
                  <option value="urgent">{t('urgent')}</option>
                </select>
              </div>
              <div className="filter-item">
                <label>{t('recipientEmail')}</label>
                <input
                  type="text"
                  value={filters.recipient_email}
                  onChange={(e) => handleFilterChange('recipient_email', e.target.value)}
                  placeholder={t('searchRecipientEmail')}
                  className="filter-input"
                />
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-item">
                <label>{t('dateFrom')}</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="filter-input"
                />
              </div>
              <div className="filter-item">
                <label>{t('dateTo')}</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="filter-input"
                />
              </div>
              <div className="filter-item">
                {/* Empty space for alignment */}
              </div>
              <div className="filter-item">
                {/* Empty space for alignment */}
              </div>
            </div>
            <div
  className="filter-buttons-row"
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '8px'
  }}
>
  <button
    className="btn btn-primary"
    onClick={handleApplyFilters}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    {t('filters')}
  </button>

  {/* spacer pushes the Clear/Close buttons to the far right */}
  <div style={{ flex: 1 }} />

  <button
    className="btn btn-secondary"
    onClick={clearFilters}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'text-bottom', transform: 'translateY(-1px)' }}
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
    {t('clearAll')}
  </button>

  <button
    className="btn btn-secondary"
    onClick={() => setShowFilters(false)}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'text-bottom', transform: 'translateY(-1px)' }}
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
    {t('closeFilters')}
  </button>
</div>

          </div>
        </div>
      )}

      <div className="email-logs-table-container">
        <table className="email-logs-table">
            <thead>
              <tr>
                <th>{t('templateKey')}</th>
                <th>{t('recipient')}</th>
                <th>{t('subject')}</th>
                <th>{t('status')}</th>
                <th>{t('priority')}</th>
                <th>{t('retryCount')}</th>
                <th>{t('created')}</th>
                <th>{t('sentAt')}</th>
                <th>{t('error')}</th>
                <th>Action</th>
              </tr>
            </thead>
          <tbody>
            {currentLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.template_key}</td>
                <td>
                  <div className="recipient-info">
                    <div className="recipient-email">{log.recipient_email}</div>
                    {log.recipient_name && (
                      <div className="recipient-name">{log.recipient_name}</div>
                    )}
                  </div>
                </td>
                <td className="subject-cell" title={log.subject}>{log.subject}</td>
                <td>
                  <span className={`status-badge ${getStatusColor(log.status)}`}>
                    {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                  </span>
                </td>
                <td>
                  <span className={`priority-badge ${getPriorityColor(log.priority)}`}>
                    {log.priority.charAt(0).toUpperCase() + log.priority.slice(1)}
                  </span>
                </td>
                <td>
                  <span className="retry-info">
                    {log.retry_count}/{log.max_retries}
                  </span>
                </td>
                <td>{formatDate(log.created_at)}</td>
                <td>{log.sent_at ? formatDate(log.sent_at) : '-'}</td>
                <td>
                  {log.error_message ? (
                    <span 
                      className="error-message" 
                      title={log.error_message}
                    >
                      {log.error_message.length > 30 
                        ? `${log.error_message.substring(0, 30)}...` 
                        : log.error_message
                      }
                    </span>
                  ) : '-'}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary action-btn"
                    onClick={() => handleViewLog(log)}
                    title="View Details"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <footer
  className="pagination-footer"
  style={{
    paddingLeft: '5px',
    paddingRight: '5px',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr', // left | center | right
    alignItems: 'center',
    gap: '8px',
  }}
>
  {/* Left: pager buttons */}
  <div
    className="pagination-controls"
    style={{ justifySelf: 'start', visibility: showPager ? 'visible' : 'hidden' }}
  >
    <button
      className="btn btn-sm btn-secondary"
      onClick={() => handlePageChange(currentPage - 1)}
      disabled={currentPage === 1}
    >
      {t('previous')}
    </button>
    <span className="page-info" style={{ margin: '0 8px' }}>
      Page {currentPage} of {Math.ceil(totalCount / pageSize)}
    </span>
    <button
      className="btn btn-sm btn-secondary"
      onClick={() => handlePageChange(currentPage + 1)}
      disabled={currentPage >= Math.ceil(totalCount / pageSize)}
    >
      {t('next')}
    </button>
  </div>

  {/* Center: page-size selector */}
  <div
    className="page-size-selector"
    style={{ justifySelf: 'center', visibility: showPager ? 'visible' : 'hidden' }}
  >
    <label htmlFor="pageSize">{t('perPage')}</label>
    <select
      id="pageSize"
      value={pageSize}
      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
      className="page-size-select"
      style={{ marginLeft: 6 }}
    >
      <option value={5}>5</option>
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={50}>50</option>
    </select>
  </div>

  {/* Right: records info (always visible) */}
  <div className="pagination-info" style={{ justifySelf: 'end' }}>
    {t('showingXofYRecords', {
      x: currentLogs.length, // filtered (what you see)
      y: logs.length,        // total loaded
    })}
  </div>
</footer>

      {/* Email Log Details Modal */}
      {isModalOpen && selectedLog && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Email Log Details</h2>
              <button className="modal-close-btn" onClick={handleCloseModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="log-details-grid">
                <div className="detail-item">
                  <label>Template Key:</label>
                  <span>{selectedLog.template_key}</span>
                </div>
                <div className="detail-item">
                  <label>Recipient Email:</label>
                  <span>{selectedLog.recipient_email}</span>
                </div>
                <div className="detail-item">
                  <label>Recipient Name:</label>
                  <span>{selectedLog.recipient_name || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>Subject:</label>
                  <span>{selectedLog.subject}</span>
                </div>
                <div className="detail-item">
                  <label>Status:</label>
                  <span className={`status-badge ${getStatusColor(selectedLog.status)}`}>
                    {selectedLog.status.charAt(0).toUpperCase() + selectedLog.status.slice(1)}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Priority:</label>
                  <span className={`priority-badge ${getPriorityColor(selectedLog.priority)}`}>
                    {selectedLog.priority.charAt(0).toUpperCase() + selectedLog.priority.slice(1)}
                  </span>
                </div>
                {selectedLog.error_message && (
                  <div className="detail-item full-width">
                    <label>Error Message:</label>
                    <span className="error-message">{selectedLog.error_message}</span>
                  </div>
                )}
              </div>
              
              {selectedLog.html_content && (
                <div className="email-preview-section">
                  <h3>Email Preview</h3>
                  <div className="email-preview-container">
                    <iframe
                      srcDoc={selectedLog.html_content}
                      className="email-preview-iframe"
                      title="Email Preview"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
