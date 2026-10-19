// src/services/api.ts
import axios, { AxiosResponse } from "axios";
import Cookies from "js-cookie";
import { EmailTemplate, EmailTemplateFormData, EmailLog } from "../types";

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

/** Optional headers merged into every request (e.g. X-Api-Key for DFA Toolkit). */
export type MailerServiceOptions = {
  defaultHeaders?: Record<string, string>;
};

class BaseService {
  protected baseUrl: string;
  protected defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, options?: MailerServiceOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // normalize trailing slash
    this.defaultHeaders = { ...(options?.defaultHeaders ?? {}) };
  }

  protected getLanguage() {
    if (typeof window === "undefined") return "en"; // SSR/build guard
    const seg = window.location.pathname.split("/")[1];
    return seg || "en";
  }

  /** DFA v6 datamanager uses `dfa_token`; legacy examples used `accessToken`. */
  protected getAccessToken() {
    return Cookies.get("dfa_token") ?? Cookies.get("accessToken") ?? null;
  }

  /** Use on every request */
  protected getHeaders(extra?: Record<string, string>) {
    const token = this.getAccessToken();
    const lang = this.getLanguage();

    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...this.defaultHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extra ?? {}),
    };
  }
}

function normalizeLogsPaginated(
  page: number,
  pageSize: number,
  data: unknown
): PaginatedResponse<EmailLog> {
  if (data && typeof data === "object" && "results" in (data as object)) {
    return data as PaginatedResponse<EmailLog>;
  }
  const results = Array.isArray(data) ? (data as EmailLog[]) : [];
  const hasMore = results.length === pageSize;
  const count = hasMore
    ? page * pageSize + 1
    : (page - 1) * pageSize + results.length;
  return {
    count,
    next: hasMore ? "next" : null,
    previous: page > 1 ? "prev" : null,
    results,
  };
}

function normalizeTemplatesGrouped(
  page: number,
  pageSize: number,
  data: unknown
): PaginatedResponse<EmailTemplate | EmailTemplateSummary> {
  if (data && typeof data === "object" && "results" in (data as object)) {
    return data as PaginatedResponse<EmailTemplate | EmailTemplateSummary>;
  }
  const results = Array.isArray(data)
    ? (data as (EmailTemplate | EmailTemplateSummary)[])
    : [];
  const hasMore = results.length === pageSize;
  const count = hasMore
    ? page * pageSize + 1
    : (page - 1) * pageSize + results.length;
  return {
    count,
    next: hasMore ? "next" : null,
    previous: page > 1 ? "prev" : null,
    results,
  };
}

/* ---------------------- EmailTemplateService ---------------------- */

export class EmailTemplateService extends BaseService {
  async getAllTemplates(): Promise<EmailTemplate[]> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/templates/`,
        { headers: this.getHeaders() }
      );
      if (response.data && response.data.results) return response.data.results;
      return response.data || [];
    } catch (error) {
      console.error("Error fetching templates:", error);
      throw new Error("Failed to fetch templates");
    }
  }

  async getTemplatesGrouped(
    page: number = 1,
    pageSize: number = 10,
    summaryLanguage: string = "en",
    summary: boolean = false
  ): Promise<PaginatedResponse<EmailTemplate | EmailTemplateSummary>> {
    try {
      const response: AxiosResponse<unknown> = await axios.get(
        `${this.baseUrl}/templates/`,
        {
          headers: this.getHeaders(),
          params: {
            group_by_key: "true",
            summary_language: summaryLanguage,
            summary: summary.toString(),
            page: page,
            page_size: pageSize,
          },
        }
      );
      return normalizeTemplatesGrouped(page, pageSize, response.data);
    } catch (error) {
      console.error("Error fetching grouped templates:", error);
      throw new Error("Failed to fetch grouped templates");
    }
  }

  async getTemplatesByKey(templateKey: string): Promise<EmailTemplate[]> {
    try {
      const response: AxiosResponse<EmailTemplate[]> = await axios.get(
        `${this.baseUrl}/templates/key/${encodeURIComponent(templateKey)}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching templates by key:", error);
      throw new Error("Failed to fetch templates by key");
    }
  }

  async getTemplateByKeyAndLanguage(
    templateKey: string,
    language: string
  ): Promise<EmailTemplate | null> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/templates/`,
        {
          headers: this.getHeaders(),
          params: {
            template_key: templateKey,
            language: language,
          },
        }
      );
      const d = response.data;
      if (Array.isArray(d) && d.length > 0) return d[0];
      if (d?.results?.length) return d.results[0];
      return null;
    } catch (error) {
      console.error("Error fetching template by key and language:", error);
      throw new Error("Failed to fetch template by key and language");
    }
  }

  async createTemplate(templateData: EmailTemplateFormData): Promise<EmailTemplate> {
    try {
      const response: AxiosResponse<EmailTemplate> = await axios.post(
        `${this.baseUrl}/templates/`,
        templateData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error("Error creating template:", error);
      throw new Error("Failed to create template");
    }
  }

  async updateTemplate(
    id: number,
    templateData: EmailTemplateFormData
  ): Promise<EmailTemplate> {
    try {
      const response: AxiosResponse<EmailTemplate> = await axios.put(
        `${this.baseUrl}/templates/${id}`,
        templateData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error("Error updating template:", error);
      throw new Error("Failed to update template");
    }
  }

  async deleteTemplate(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/templates/${id}`, {
        headers: this.getHeaders(),
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      throw new Error("Failed to delete template");
    }
  }
}

/* ------------------------ EmailLogService ------------------------- */

export class EmailLogService extends BaseService {
  async getAllLogs(): Promise<EmailLog[]> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/logs/`,
        { headers: this.getHeaders() }
      );
      if (response.data && response.data.results) return response.data.results;
      return response.data || [];
    } catch (error) {
      console.error("Error fetching email logs:", error);
      throw new Error("Failed to fetch email logs");
    }
  }

  async getLogsPaginated(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<EmailLog>> {
    try {
      const response: AxiosResponse<unknown> = await axios.get(
        `${this.baseUrl}/logs/`,
        {
          headers: this.getHeaders(),
          params: {
            page: page,
            page_size: pageSize,
          },
        }
      );
      return normalizeLogsPaginated(page, pageSize, response.data);
    } catch (error) {
      console.error("Error fetching paginated email logs:", error);
      throw new Error("Failed to fetch paginated email logs");
    }
  }

  async getLogsByStatus(status: string): Promise<EmailLog[]> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/logs/status/${encodeURIComponent(status)}`,
        { headers: this.getHeaders() }
      );
      return response.data || [];
    } catch (error) {
      console.error("Error fetching logs by status:", error);
      throw new Error("Failed to fetch logs by status");
    }
  }

  async getLogsByRecipient(email: string): Promise<EmailLog[]> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/logs/recipient/${encodeURIComponent(email)}`,
        { headers: this.getHeaders() }
      );
      return response.data || [];
    } catch (error) {
      console.error("Error fetching logs by recipient:", error);
      throw new Error("Failed to fetch logs by recipient");
    }
  }

  async getLogsByTemplate(templateKey: string): Promise<EmailLog[]> {
    try {
      const response: AxiosResponse<any> = await axios.get(
        `${this.baseUrl}/logs/`,
        {
          headers: this.getHeaders(),
          params: { template_key: templateKey },
        }
      );
      if (response.data && response.data.results) return response.data.results;
      return response.data || [];
    } catch (error) {
      console.error("Error fetching logs by template:", error);
      throw new Error("Failed to fetch logs by template");
    }
  }
}
