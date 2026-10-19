"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

function withLocale(locale: string, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalized === "/" ? "" : normalized}`;
}

export interface SignInRequiredModalProps {
  open: boolean;
  onClose: () => void;
  returnUrl: string;
  locale: string;
}

export function SignInRequiredModal({
  open,
  onClose,
  returnUrl,
  locale,
}: SignInRequiredModalProps) {
  const { t } = useCore();
  const router = useRouter();

  const handleSignIn = () => {
    onClose();
    const signInPath = withLocale(locale, "/auth");
    const params = new URLSearchParams({ route: "signin" });
    if (returnUrl) {
      params.set("returnUrl", returnUrl);
    }
    router.push(`${signInPath}?${params.toString()}`);
  };

  useEffect(() => {
    if (open) {
      const prevScrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        window.scrollTo(0, prevScrollY);
      };
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const alertContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="signin-required-title"
      aria-describedby="signin-required-description"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <WarningAmberOutlinedIcon className="w-16 h-16 text-text" aria-hidden />
        </div>
        <h2
          id="signin-required-title"
          className="text-xl font-bold text-text text-center mb-2"
        >
          {t("SIGN_IN_REQUIRED")}
        </h2>
        <p
          id="signin-required-description"
          className="text-sm text-text-muted text-center mb-6 leading-relaxed"
        >
          {t("SIGN_IN_REQUIRED_DESCRIPTION")}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 btn-comp-secondary"
          >
            {t("MODAL_CANCEL")}
          </button>
          <button
            type="button"
            onClick={handleSignIn}
            className="flex-1 btn-comp-primary flex items-center justify-center gap-2"
          >
            {t("HEADER_SIGN_IN")}
            <ArrowForwardIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(alertContent, document.body);
}
