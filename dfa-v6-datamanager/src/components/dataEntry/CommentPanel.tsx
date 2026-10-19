"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/Loader";
import { TextAreaField } from "@/components/TextAreaField";
import { getRequest, postRequest } from "@/lib/api/http";
import { getDWAPIURL, REFERENCE_PATH_DATASET, REFERENCE_PATH_COMMENTS } from "@/lib/constants";
import { getStoredAuthUser } from "@/lib/auth/user";
import type {
  DatasetComment,
  DatasetCommentsListResult,
  DatasetCommentPostPayload,
  DatasetCommentPostResult,
} from "@/lib/api/types";

type CommentPanelProps = {
  dwId: string;
  datasetId: string;
  dataPointId?: number | null;
  isCommentLocked?: boolean;
  onCommentsCountChange?: (count: number) => void;
  t: (code: string, fallback?: string) => string;
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }) + ", " + d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CommentPanel({
  dwId,
  datasetId,
  dataPointId,
  isCommentLocked = false,
  onCommentsCountChange,
  t,
}: CommentPanelProps) {
  const [comments, setComments] = useState<DatasetComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const authUser = getStoredAuthUser();
  const currentUserId = authUser?.user_id ?? null;
  const currentUsername = (authUser?.username ?? "").trim().toLowerCase();

  const commentsUrl = useCallback(() => {
    const base = `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/${datasetId}${REFERENCE_PATH_COMMENTS}`;
    if (dataPointId != null) return `${base}?data_point_id=${dataPointId}`;
    return base;
  }, [dwId, datasetId, dataPointId]);

  const fetchComments = useCallback(async () => {
    if (!dwId || !datasetId) return;
    setLoading(true);
    try {
      const json = (await getRequest(commentsUrl(), undefined, {
        suppressErrorMessage: true,
      })) as DatasetCommentsListResult;
      if (json.success && json.data) {
        setComments(json.data);
        onCommentsCountChange?.(json.data.length);
      } else {
        onCommentsCountChange?.(0);
      }
    } catch {
      /* silent */
      onCommentsCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [dwId, datasetId, commentsUrl, onCommentsCountChange]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || isCommentLocked) return;

    setSending(true);
    try {
      const postUrl = `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/${datasetId}${REFERENCE_PATH_COMMENTS}`;
      const payload: DatasetCommentPostPayload = { comment_text: trimmed };
      if (dataPointId != null) {
        payload.data_point_id = dataPointId;
      }
      const json = (await postRequest(
        postUrl,
        payload,
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as DatasetCommentPostResult;

      if (json.success) {
        setText("");
        await fetchComments();
      } else {
        toast.error(json.message || t("COMMENT_SEND_ERROR", "Failed to send comment."));
      }
    } catch {
      toast.error(t("COMMENT_SEND_ERROR", "Failed to send comment."));
    } finally {
      setSending(false);
    }
  }, [text, sending, dwId, datasetId, dataPointId, fetchComments, isCommentLocked, t]);

  const isSelf = (c: DatasetComment) => {
    if (
      currentUserId != null &&
      c.created_user_id != null &&
      c.created_user_id === currentUserId
    ) {
      return true;
    }
    if (!currentUsername) return false;
    const commentUsername = (c.created_username ?? c.username ?? "")
      .trim()
      .toLowerCase();
    return commentUsername.length > 0 && commentUsername === currentUsername;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {loading && comments.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader loadingLabel={t("LOADING", "Loading...")} />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-10 text-center text-xs text-text-muted">
            {t("NO_COMMENTS", "No comments yet.")}
          </p>
        ) : (
          comments.map((c) => {
            const self = isSelf(c);
            return (
              <div
                key={c.comment_id}
                className={`flex ${self ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[40%] rounded-lg px-3.5 py-2.5 border border-primary bg-transparent text-text`}
                >
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">
                    {c.comment_text}
                  </p>
                  <p className={`mt-1.5 text-xs ${self ? "text-right" : "text-left"} text-text-muted`}>
                    {c.created_username?.trim() ||
                      c.username?.trim() ||
                      c.commenter_role ||
                      t("UNKNOWN_USER", "Unknown user")}
                    {" \u00B7 "}
                    {formatTimestamp(c.created)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <TextAreaField
          fieldSize="md"
          className="resize-none rounded-lg bg-white px-3 py-2.5 focus:shadow-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isCommentLocked
              ? t("COMMENT_LOCKED_APPROVED", "Comments are locked because this item is approved.")
              : t("COMMENT_PLACEHOLDER", "Add a comment...")
          }
          rows={3}
          disabled={sending || isCommentLocked}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {!isCommentLocked ? (
          <div className="mt-2 flex justify-end text-xs">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
              onClick={handleSend}
              disabled={sending || !text.trim()}
            >
              <span className="material-icons !text-xs leading-none" aria-hidden="true">
                check
              </span>
              {t("SEND", "Send")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
