"use client";

import { Toaster } from "sonner";
import "sonner/dist/styles.css";

/**
 * Global toast host (Sonner). Import `toast` from `sonner` in client components.
 */
export function AppToaster() {
  return (
    <Toaster position="top-right" richColors closeButton />
  );
}
