"use client";

/** Pill label for a single IAM role on the users grid (matches active status chip styling). */
export function UserRoleChip({
  label,
  title,
}: {
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded-full bg-[color:color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))] px-2 py-0.5 text-xs font-medium leading-4 text-primary"
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
