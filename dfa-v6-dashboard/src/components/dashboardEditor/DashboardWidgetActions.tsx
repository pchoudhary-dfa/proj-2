"use client";

type DashboardWidgetActionsProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  onPreview?: () => void;
};

export function DashboardWidgetActions({
  onEdit,
  onDelete,
  onPreview,
}: DashboardWidgetActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className="text-primary"
        aria-label="Edit widget"
        onClick={onEdit}
      >
        <span className="material-icons !text-md">edit</span>
      </button>
      <button
        type="button"
        className="text-primary"
        aria-label="Delete widget"
        onClick={onDelete}
      >
        <span className="material-icons !text-md">delete</span>
      </button>
      <button
        type="button"
        className="text-primary"
        aria-label="Preview widget"
        onClick={onPreview}
      >
        <span className="material-icons !text-md">visibility</span>
      </button>
    </div>
  );
}
