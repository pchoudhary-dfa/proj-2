/**
 * AI Insights API client with SSE (Server-Sent Events) streaming support.
 * Connects to the backend insights endpoint and processes streamed responses.
 */

import { buildSignedHeaders } from "@/lib/api/client";
import { API_FINAL_BASE_URL } from "@/lib/constants";

export interface InsightsSelectedFilters {
  indicators: string[];
  subgroups: string[];
  timePeriods: string[];
  areas: string[];
}

export interface InsightsParams {
  /** Chart data object (echartsChartData) to analyze */
  data: unknown;
  /** Language code for AI response (e.g., "en", "ar") */
  langCode: string;
  /** Use case identifier (UC0-UC10) */
  useCase: string;
  /** Enable streaming mode (should be true) */
  stream: boolean;
  /** Data warehouse ID for the endpoint */
  dwId: number;
  /** Selected filter values from the left panel */
  selectedFilters?: InsightsSelectedFilters;
}

export interface InsightsCallbacks {
  /** Called for each content chunk received */
  onChunk: (text: string) => void;
  /** Called when meta event is received */
  onMeta?: (meta: { response_type?: string; responseType?: string; [key: string]: unknown }) => void;
  /** Called when streaming completes successfully */
  onComplete: () => void;
  /** Called if an error occurs during streaming */
  onError: (error: string) => void;
}

/**
 * Fetches AI insights with SSE streaming.
 * 
 * @param params - Insights request parameters
 * @param callbacks - Callbacks for streaming events
 * @returns Cleanup function to abort the request
 * 
 * @example
 * const cleanup = fetchInsightsStream(
 *   {
 *     data: echartsChartData,
 *     langCode: 'en',
 *     useCase: 'UC1',
 *     stream: true,
 *     dwId: 4
 *   },
 *   {
 *     onChunk: (text) => setContent(prev => prev + text),
 *     onComplete: () => setLoading(false),
 *     onError: (err) => setError(err)
 *   }
 * );
 * 
 * // Later, to cancel:
 * cleanup();
 */
export function fetchInsightsStream(
  params: InsightsParams,
  callbacks: InsightsCallbacks
): () => void {
  const { data, langCode, useCase, stream, dwId, selectedFilters } = params;
  const { onChunk, onMeta, onComplete, onError } = callbacks;

  const controller = new AbortController();
  const signal = controller.signal;

  const url = `${API_FINAL_BASE_URL}/dw/${dwId}/insights`;

  const enrichedData = selectedFilters
    ? { ...(data as object), selectedFilters }
    : data;

  const body = JSON.stringify({
    data: enrichedData,
    langCode,
    useCase,
    stream,
  });

  void (async () => {
  const headers = await buildSignedHeaders(url, "POST", { acceptLanguage: langCode });

  fetch(url, {
    method: "POST",
    headers,
    body,
    signal,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Process the stream
      const processStream = async () => {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete SSE events (split by double newline)
            const events = buffer.split("\n\n");
            
            // Keep the last incomplete event in the buffer
            buffer = events.pop() || "";

            for (const event of events) {
              if (!event.trim()) continue;

              // Parse SSE format: "data: {...}"
              const dataMatch = event.match(/^data:\s*(.+)$/m);
              if (!dataMatch) continue;

              const dataStr = dataMatch[1].trim();

              // Check for completion marker
              if (dataStr === "[DONE]") {
                onComplete();
                return;
              }

              // Parse JSON content
              try {
                const data = JSON.parse(dataStr);

                if (data.error) {
                  // Error event from server
                  onError(data.error);
                  return;
                }

                if (data.meta && onMeta) {
                  onMeta(data.meta);
                }

                if (data.content) {
                  // Content chunk
                  onChunk(data.content);
                }
              } catch (e) {
                // Skip malformed JSON (log for debugging if needed)
                console.warn("Failed to parse SSE data:", dataStr, e);
              }
            }
          }

          // If we exit the loop without seeing [DONE], still call onComplete
          if (buffer.trim()) {
            // Process any remaining data in buffer
            const dataMatch = buffer.match(/^data:\s*(.+)$/m);
            if (dataMatch) {
              const dataStr = dataMatch[1].trim();
              if (dataStr !== "[DONE]") {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.content) {
                    onChunk(data.content);
                  }
                } catch (e) {
                  // Ignore parse errors in final buffer
                }
              }
            }
          }

          onComplete();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            // Request was aborted, don't call onError
            return;
          }
          throw error;
        }
      };

      processStream().catch((error) => {
        onError(error instanceof Error ? error.message : "Stream processing failed");
      });
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      onError(error instanceof Error ? error.message : "Failed to fetch insights");
    });
  })();

  return () => {
    controller.abort();
  };
}

/**
 * Creates a simple non-streaming insights request (for testing or fallback).
 * 
 * @param params - Insights request parameters (stream will be set to false)
 * @returns Promise that resolves with the full insight text or rejects with error
 */
export async function fetchInsights(
  params: Omit<InsightsParams, "stream">
): Promise<string> {
  const { data, langCode, useCase, dwId, selectedFilters } = params;

  const url = `${API_FINAL_BASE_URL}/dw/${dwId}/insights`;

  // selectedFilters is merged into the data object
  const enrichedData = selectedFilters
    ? { ...(data as object), selectedFilters }
    : data;

  const body = JSON.stringify({
    data: enrichedData,
    langCode,
    useCase,
    stream: false,
  });

  const headers = await buildSignedHeaders(url, "POST", { acceptLanguage: langCode });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.status === "error") {
    throw new Error(result.message || "Insights generation failed");
  }

  if (result.status === "success" && result.data?.content) {
    return result.data.content;
  }

  throw new Error("Invalid response format");
}
