"use client";

import { useCallback, useRef, useState } from "react";

type MediaFilesConfigurationProps = {
  onUpload?: (file: File) => void | Promise<void>;
};

export default function MediaFilesConfiguration({
  onUpload,
}: MediaFilesConfigurationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<
    { name: string; url: string }[]
  >([]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith("image/")) return;
        const url = URL.createObjectURL(file);
        setUploadedImages((prev) => [...prev, { name: file.name, url }]);
        onUpload?.(file);
      });
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleRemove = useCallback((index: number) => {
    setUploadedImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h3 className="text-sm font-semibold text-primary">Image</h3>

      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 transition-colors ${
          dragOver
            ? "border-primary bg-primary-soft"
            : "border-error/30 bg-error/5 hover:border-error/50"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-error">
          <span className="material-icons !text-lg" aria-hidden>
            upload
          </span>
          Upload image
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploadedImages.length > 0 && (
        <div className="flex flex-col gap-3">
          {uploadedImages.map((img, idx) => (
            <div
              key={img.url}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
            >
              <img
                src={img.url}
                alt={img.name}
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-text">
                {img.name}
              </span>
              <button
                type="button"
                className="btn-comp-ghost h-7 w-7 rounded text-error"
                onClick={() => handleRemove(idx)}
                title="Remove"
              >
                <span className="material-icons !text-base" aria-hidden>
                  close
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
