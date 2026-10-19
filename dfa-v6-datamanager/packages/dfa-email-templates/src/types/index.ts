export interface EmailTemplate {
  id: number;
  template_key: string;
  language: string;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface EmailTemplateFormData {
  id?: number;
  template_key: string;
  language: string;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  is_active: boolean;
}

export interface UserData {
  name: string;
  email: string;
  area: string;
  role: string;
  user_id: string;
}

// Pagination response interface
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Template summary interface for grouped data
export interface EmailTemplateSummary {
  template_key: string;
  name: string;
  subject: string;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplatesTableProps {
  apiBaseUrl: string;
  /** Sent as `X-Api-Key` (DFA Toolkit app client). */
  apiKey?: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  userData?: UserData;
  // Optional API functions - if provided, these will be used instead of internal functions
  getTemplates?: () => Promise<EmailTemplate[]>;
  getTemplatesGrouped?: (page: number, pageSize: number, summaryLanguage: string, summary: boolean) => Promise<PaginatedResponse<EmailTemplate | EmailTemplateSummary>>;
  getTemplatesByKey?: (templateKey: string) => Promise<EmailTemplate[]>;
  createTemplate?: (data: EmailTemplateFormData) => Promise<EmailTemplate>;
  updateTemplate?: (id: number, data: EmailTemplateFormData) => Promise<EmailTemplate>;
  deleteTemplate?: (id: number) => Promise<void>;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface EmailLog {
  id: number;
  template_key: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  html_content: string;
  text_content?: string;
  context: Record<string, any>;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sent_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLogsTableProps {
  apiBaseUrl: string;
  /** Sent as `X-Api-Key` (DFA Toolkit app client). */
  apiKey?: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  userData?: UserData;
  // Optional API functions - if provided, these will be used instead of internal functions
  getLogs?: () => Promise<EmailLog[]>;
  getLogsPaginated?: (page: number, pageSize: number) => Promise<PaginatedResponse<EmailLog>>;
  defaultPageSize?: number;
}
