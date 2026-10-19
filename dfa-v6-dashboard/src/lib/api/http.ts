/**
 * Common HTTP wrapper functions for API requests.
 * Wraps apiFetch from client.ts which handles API key, signature, and
 * Bearer token automatically. These wrappers add Content-Type, Accept-Language,
 * response parsing, and error handling.
 */
import { apiFetch } from "@/lib/api/client";
import { FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getLanguage(): string {
  if (typeof window !== "undefined") {
    const [, lang] = window.location.pathname.split("/");
    return lang || FALLBACK_DEFAULT_LOCALE;
  }
  return FALLBACK_DEFAULT_LOCALE;
}

export const getRequest = async (
  apiUrl: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  const response = await apiFetch(apiUrl, {
    method: "GET",
    headers,
  });

  return parseResponse(response, options);
};

export const postRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[] | FormData,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();
  const isFormData = data instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(language ? { "Accept-Language": language } : {}),
  };

  const response = await apiFetch(apiUrl, {
    method: "POST",
    headers,
    body: isFormData ? data : JSON.stringify(data),
  });

  return parseResponse(response, options);
};

export const putRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[],
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  const response = await apiFetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });

  return parseResponse(response, options);
};

export const patchRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[] | FormData,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();
  const isFormData = data instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(language ? { "Accept-Language": language } : {}),
  };

  const response = await apiFetch(apiUrl, {
    method: "PATCH",
    headers,
    body: isFormData ? data : JSON.stringify(data),
  });

  return parseResponse(response, options);
};

export const deleteRequest = async (
  apiUrl: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  const response = await apiFetch(apiUrl, {
    method: "DELETE",
    headers,
  });

  return parseResponse(response, options);
};

/**
 * Parse JSON response and extract error information for non-ok responses.
 */
export const parseResponse = async (
  response: Response,
  options?: { suppressErrorMessage?: boolean }
) => {
  const isNoContent =
    response.status === 204 ||
    response.headers.get("content-length") === "0";
  const jsonResponse = isNoContent
    ? {}
    : await response.json().catch(() => ({}));

  if (!response.ok) {
    if (options?.suppressErrorMessage === true) {
      if (isRecord(jsonResponse)) {
        return {
          status_code:
            typeof jsonResponse.status_code === "number"
              ? jsonResponse.status_code
              : response.status,
          ...jsonResponse,
        };
      }
      return { status_code: response.status, data: jsonResponse };
    }

    const errorDetail = isRecord(jsonResponse)
      ? (jsonResponse.message as string) ??
        (jsonResponse.detail as string) ??
        response.statusText
      : response.statusText;

    console.error(
      `API ${response.status}: ${errorDetail}`,
      response.url
    );
  }

  return jsonResponse;
};

/**
 * GET request returning raw Response for file/export downloads.
 */
export const getFileResponse = async (
  apiUrl: string,
  acceptHeader = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"
): Promise<Response> => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    ...(language ? { "Accept-Language": language } : {}),
    Accept: acceptHeader,
  };

  return apiFetch(apiUrl, { method: "GET", headers });
};
