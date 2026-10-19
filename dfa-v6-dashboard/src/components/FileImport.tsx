"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";

type FileFormat = "csv" | "xlsx";

type FileImportProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  onImport?: (payload: { file: File | null; format: FileFormat }) => void | Promise<void>;
  onTemplateClick?: () => void;
};

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function FileImport({
  open,
  title,
  onClose,
  onImport,
  onTemplateClick,
}: FileImportProps) {
  const { t } = useCore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const notifyFileExceedsMaxSize = useCallback(() => {
    toast.error(
      t("FILE_IMPORT_MAX_SIZE", "The file is too large. Maximum allowed size is 10 MB.")
    );
  }, [t]);

  const [format, setFormat] = useState<FileFormat>("csv");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const acceptedFileTypes = useMemo(() => ".csv,.xlsx", []);

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setFormat("csv");
      setDragActive(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const supportsFormat = (file: File): FileFormat => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    return ext === "xlsx" ? "xlsx" : "csv";
  };

  const handlePickedFile = (
    file: File | null,
    fileInput?: HTMLInputElement | null
  ) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      notifyFileExceedsMaxSize();
      if (fileInput) fileInput.value = "";
      return;
    }
    setSelectedFile(file);
    setFormat(supportsFormat(file));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handlePickedFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const runImport = async () => {
    if (selectedFile && selectedFile.size > MAX_IMPORT_FILE_SIZE) {
      notifyFileExceedsMaxSize();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!onImport) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await onImport({ file: selectedFile, format });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[color:rgb(17_24_39/0.32)] backdrop-blur-[0.5px]"
        onClick={() => !submitting && onClose()}
      />
      <div
        className="relative z-[1] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-[color:rgb(255_255_255/0.96)] text-xs shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-import-title"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="inline-flex items-center gap-1">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Mi name="file_upload" className="!text-sm" />
            </span>
            <h2 id="file-import-title" className="text-xs font-semibold text-text">
              Import {title}
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <Mi name="close" className="!text-sm" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {onTemplateClick ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-3 py-2.5">
              <span className="text-xs text-text-muted">
                Download and follow the template to import your data.
              </span>
              <button
                type="button"
                onClick={onTemplateClick}
                className="btn-comp-inline-cancel gap-1.5"
              >
                <Mi name="download" className="!text-xs" />
                Template
              </button>
            </div>
          ) : null}

          <div
            className={`rounded-lg border-2 border-dashed px-4 py-8 text-center hover:bg-primary-soft transition-colors ${
              dragActive ? "border-primary bg-primary-soft" : "border-border"
            }`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-full text-text-muted">
              <Mi name="cloud_upload" className="!text-sm" />
            </div>
            <div className="text-xs font-medium text-text">Drag & drop your file here</div>
            <div className="mt-1 text-xs text-text-muted">Supports CSV and Excel (.xlsx) files</div>
            <button
              type="button"
              className="btn-comp-soft-primary mt-3 gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <Mi name="attach_file" className="!text-xs" />
              Browse file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={acceptedFileTypes}
              onChange={(event) =>
                handlePickedFile(
                  event.target.files?.[0] ?? null,
                  event.target
                )
              }
            />
            {selectedFile ? (
              <div className="mt-2 truncate text-xs font-medium text-text">{selectedFile.name}</div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="form-label text-text">File format</div>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                  format === "csv"
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-surface text-text-muted"
                }`}
              >
                <input
                  type="radio"
                  className="checkbox-comp"
                  name="file-format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                />
                <Mi name="grid_on" className="!text-xs text-success" />
                <span className="text-xs font-medium">CSV</span>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                  format === "xlsx"
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-surface text-text-muted"
                }`}
              >
                <input
                  type="radio"
                  className="checkbox-comp"
                  name="file-format"
                  value="xlsx"
                  checked={format === "xlsx"}
                  onChange={() => setFormat("xlsx")}
                />
                <Mi name="table_chart" className="!text-xs text-info" />
                <span className="text-xs font-medium">Excel (.xlsx)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-muted px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-comp-inline-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={submitting || !selectedFile}
            className="btn-comp-primary gap-1"
          >
            <Mi name={submitting ? "hourglass_top" : "upload"} className="!text-xs" />
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
