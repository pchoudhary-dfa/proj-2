/**
 * Common HTTP wrapper functions for API requests.
 * Wraps `apiFetch` from `client.ts` which handles API key, signature, and
 * Bearer token automatically. These wrappers add Content-Type, Accept-Language,
 * response parsing, and toast-based error/success messages.
 */
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
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

/**
 * Performs a GET request to the specified API URL.
 */
export const getRequest = async (
  apiUrl: string,
  errMsg?: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "GET",
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      console.warn(
        "GET returned HTML for API URL, rejecting to avoid mis-parsing:",
        apiUrl
      );
      throw new Error("Unexpected HTML response for API request");
    }

    return returnResponse(response, errMsg, undefined, options);
  } catch (error) {
    console.error("GET request error:", error);
    throw error;
  }
};

export const getImage = async (
  apiUrl: string,
  opts?: { silent?: boolean }
): Promise<Blob> => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    ...(language ? { "Accept-Language": language } : {}),
    Accept: "image/*",
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      if (!opts?.silent) {
        toast.error(`Image request failed with status ${response.status}`);
      }
      throw new Error(`Image request failed with status ${response.status}`);
    }

    return await response.blob();
  } catch (error) {
    console.error("Image fetch error:", error);
    throw error;
  }
};

/**
 * Performs a POST request to the specified API URL with the given payload.
 */
export const postRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[] | FormData,
  errMsg?: string,
  successMsg?: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();
  const isFormData = data instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(language ? { "Accept-Language": language } : {}),
    ...(isFormData && /\/images(\/|$)/.test(apiUrl) ? { Accept: "image/*" } : {}),
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "POST",
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });

    const contentType = response.headers.get("content-type") || "";
    const isImageApi = /\/images(\/|$)/.test(apiUrl);
    const looksLikeImage =
      contentType.startsWith("image/") || (isFormData && isImageApi);
    if (looksLikeImage) {
      if (!response.ok) {
        if (errMsg && errMsg !== "") {
          toast.error(errMsg);
        } else {
          toast.error(`Image upload failed with status ${response.status}`);
        }
        return {};
      }

      const blob = await response.blob();

      const getAnyHeader = (keys: string[]): string => {
        for (const k of keys) {
          const v = response.headers.get(k);
          if (v && v.trim()) return v.trim();
        }
        return "";
      };

      const headerActivityId = getAnyHeader([
        "activity_id",
        "activity-id",
        "x-activity-id",
      ]);
      const headerImgPos = getAnyHeader([
        "img_position",
        "img-position",
        "img_form_position",
        "img-form-position",
        "x-img-position",
      ]);

      let headerId = "";
      const contentDisposition =
        response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(
        /image_id\s*=\s*("?)([^;"]+)\1/i
      );
      if (match && match[2]) {
        headerId = match[2].trim();
      }

      if (successMsg && successMsg !== "") {
        toast.success(successMsg);
      }

      return {
        success: true,
        data: {
          ...(headerId
            ? {
                id: isNaN(Number(headerId)) ? headerId : Number(headerId),
              }
            : {}),
          ...(headerActivityId ? { activity_id: headerActivityId } : {}),
          ...(headerImgPos ? { img_position: headerImgPos } : {}),
          blob,
        },
      } as unknown as Record<string, unknown>;
    }

    return returnResponse(response, errMsg, successMsg, options);
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      apiCatchError();
    }
    console.error("POST request error:", error);
    throw error;
  }
};

/**
 * Performs a PUT request to the specified API URL with the given payload.
 */
export const putRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[],
  errMsg?: string,
  successMsg?: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    return returnResponse(response, errMsg, successMsg, options);
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      apiCatchError();
    }
    console.error("PUT request error:", error);
    throw error;
  }
};

/**
 * Performs a PATCH request to the specified API URL with the given payload.
 */
export const patchRequest = async (
  apiUrl: string,
  data: string | number | Record<string, unknown> | unknown[] | FormData,
  errMsg?: string,
  successMsg?: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();
  const isFormData = data instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(language ? { "Accept-Language": language } : {}),
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "PATCH",
      headers,
      body: isFormData ? data : JSON.stringify(data),
    });
    return returnResponse(response, errMsg, successMsg, options);
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      apiCatchError();
    }
    console.error("PATCH request error:", error);
    throw error;
  }
};

/**
 * Performs a DELETE request to the specified API URL.
 */
export const deleteRequest = async (
  apiUrl: string,
  successMsg?: string,
  errMsg?: string,
  options?: { suppress409Toast?: boolean; suppressErrorMessage?: boolean }
) => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(language ? { "Accept-Language": language } : {}),
  };

  try {
    const response = await apiFetch(apiUrl, {
      method: "DELETE",
      headers,
    });

    if (options?.suppress409Toast && response.status === 409) {
      const jsonResponse = await response.json().catch(() => ({}));
      return {
        __httpStatus: 409,
        ...jsonResponse,
      } as unknown as Record<string, unknown>;
    }

    return returnResponse(response, errMsg, successMsg, {
      suppressErrorMessage: options?.suppressErrorMessage,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      apiCatchError();
    }
    console.error("DELETE request error:", error);
    throw error;
  }
};

/**
 * Parse the response and return common error messages via toast.
 */
export const returnResponse = async (
  response: Response,
  errMsg?: string,
  successMsg?: string,
  options?: { suppressErrorMessage?: boolean }
) => {
  const isNoContent =
    response.status === 204 ||
    response.headers.get("content-length") === "0";
  const jsonResponse = isNoContent
    ? {}
    : await response.json().catch(() => ({}));

  if (!response || !response.ok) {
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
      return {
        status_code: response.status,
        data: jsonResponse,
      };
    }
    if (errMsg && errMsg !== "" && response.status !== 401) {
      if (response.status === 403 || response.status === 400) {
        const apiMsg = isRecord(jsonResponse)
          ? typeof jsonResponse.message === "string"
            ? jsonResponse.message
            : typeof jsonResponse.detail === "string"
              ? jsonResponse.detail
              : undefined
          : undefined;
        toast.error(apiMsg ? `${errMsg}, ${apiMsg}` : errMsg);
      } else {
        toast.error(errMsg);
      }
      return jsonResponse;
    }
    switch (response.status) {
      case 400:
        toast.error(
          "Bad Request: The server could not understand the request due to invalid syntax."
        );
        break;
      case 401:
        toast.error(
          "Unauthorized: Access is denied due to invalid credentials."
        );
        break;
      case 403: {
        const forbiddenBase =
          "Forbidden: You do not have permission to access this resource.";
        const apiMsg = isRecord(jsonResponse)
          ? typeof jsonResponse.message === "string"
            ? jsonResponse.message
            : typeof jsonResponse.detail === "string"
              ? jsonResponse.detail
              : undefined
          : undefined;
        toast.error(apiMsg ? `${forbiddenBase}, ${apiMsg}` : forbiddenBase);
        break;
      }
      case 404:
        toast.error(
          "Not Found: The requested resource could not be found."
        );
        break;
      case 422: {
        const detail = isRecord(jsonResponse)
          ? jsonResponse.detail
          : undefined;
        let msg: string | undefined;

        if (Array.isArray(detail) && detail.length > 0) {
          const first = detail[0];
          if (isRecord(first) && typeof first.msg === "string") {
            msg = first.msg;
          } else if (typeof first === "string") {
            msg = first;
          }
        } else if (typeof detail === "string") {
          msg = detail;
        } else if (
          isRecord(jsonResponse) &&
          typeof jsonResponse.message === "string"
        ) {
          msg = jsonResponse.message;
        }

        toast.error(msg ?? "Validation failed.");
        break;
      }
      case 409:
        toast.error(
          jsonResponse.message ??
            jsonResponse.detail ??
            "Not allowed: this is not allowed due to multiple associations."
        );
        break;
      case 500: {
        const errorMsg =
          jsonResponse.message ??
          jsonResponse.detail ??
          "Internal Server Error: The server encountered an error and could not complete your request.";
        toast.error(errorMsg);
        break;
      }
      default:
        toast.error(
          `Unexpected error: ${jsonResponse.message ?? jsonResponse.detail ?? response.statusText}`
        );
    }
  } else if (successMsg && successMsg !== "") {
    toast.success(successMsg);
  }
  return jsonResponse;
};

export const apiCatchError = async () => {
  toast.error(
    "Internal Server Error: The server encountered an error and could not complete your request."
  );
  return false;
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

  try {
    return await apiFetch(apiUrl, { method: "GET", headers });
  } catch (error) {
    console.error("GET file request error:", error);
    throw error;
  }
};

/**
 * POST request returning raw Response for file downloads.
 */
export const downloadRequest = async (
  apiUrl: string,
  data?: string | number | Record<string, unknown>
): Promise<Response> => {
  const language = getLanguage();

  const headers: Record<string, string> = {
    ...(language ? { "Accept-Language": language } : {}),
  };

  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await apiFetch(apiUrl, {
      method: "POST",
      headers,
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });

    return response;
  } catch (error) {
    console.error("POST request error:", error);
    throw error;
  }
};

/**
 * Hand off a file GET to the browser so it uses the native download manager
 * (progress in the downloads bar, survives page reload). Same-origin BFF URLs
 * send session cookies automatically; the BFF adds API signing server-side.
 */
export function startBrowserFileDownload(apiUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = apiUrl;
  anchor.style.display = "none";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
