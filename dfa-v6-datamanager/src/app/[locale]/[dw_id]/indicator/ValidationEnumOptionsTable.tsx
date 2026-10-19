"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type HTMLAttributes,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { TextField } from "@/components/TextField";
import {
  EditableDataGridBody,
  EditableDataGridThead,
  InlineEditableTable,
} from "@/components/TableView";
import type { ValidationRuleEnumOptionFormInput } from "@/lib/api/types";
import {
  ENUM_ROW_FIELD_ORDER,
  ENUM_TABLE_LOCALES,
  emptyEnumRowLabels,
  useValidationEnumGridColumns,
  withEnumRowKey,
  type EnumGhostFocusField,
  type ValidationEnumGridRow,
} from "@/app/[locale]/[dw_id]/indicator/validationEnumGridColumns";

export type { ValidationEnumGridRow as EnumOptionRowModel };

export { withEnumRowKey, emptyEnumRowLabels, ENUM_TABLE_LOCALES };

type Props = {
  rows: ValidationEnumGridRow[];
  onRowsChange: Dispatch<SetStateAction<ValidationEnumGridRow[]>>;
  t: (code: string) => string;
  wrapClassName?: string;
  tableAriaLabel: string;
};

function focusEnumInputById(id: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  const len = el.value.length;
  try {
    el.setSelectionRange(len, len);
  } catch {
    /* ignore */
  }
}

function slugifyOptionCodePart(s: string | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

function generateUniqueOptionCode(
  labels: Record<string, string>,
  existing: ValidationRuleEnumOptionFormInput[]
): string {
  const codes = new Set(
    existing.map((o) => o.option_code.trim()).filter(Boolean)
  );
  const slug =
    slugifyOptionCodePart(labels.en) ||
    slugifyOptionCodePart(labels.fr) ||
    slugifyOptionCodePart(labels.ar);
  let base = slug || "option";
  let code = base;
  let n = 0;
  while (codes.has(code)) {
    n += 1;
    code = `${base}_${n}`;
  }
  return code;
}

function ensureUniqueRawOptionCode(
  raw: string,
  existing: ValidationRuleEnumOptionFormInput[]
): string {
  const base = raw.trim();
  const codes = new Set(
    existing.map((o) => o.option_code.trim()).filter(Boolean)
  );
  let code = base;
  let n = 0;
  while (codes.has(code)) {
    n += 1;
    code = `${base}_${n}`;
  }
  return code;
}

function localePlaceholder(t: (code: string) => string, loc: string): string {
  if (loc === "en") return t("LANG_EN");
  if (loc === "fr") return t("LANG_FR");
  return t("LANG_AR");
}

function localeAddAriaLabel(
  t: (code: string) => string,
  loc: string
): string {
  return `${localePlaceholder(t, loc)} (${t("ADD_OPTION")})`;
}

export function ValidationEnumOptionsTable({
  rows,
  onRowsChange,
  t,
  wrapClassName = "tbl-wrap mt-0 min-h-0 min-w-0 flex-1 rounded-md border border-border",
  tableAriaLabel,
}: Props) {
  const [ghostBump, setGhostBump] = useState(0);
  const pendingEnumFocusRef = useRef<{
    idx: number;
    field: EnumGhostFocusField;
  } | null>(null);

  const promoteGhostField = useCallback(
    (field: EnumGhostFocusField, rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      onRowsChange((prev) => {
        const labels = emptyEnumRowLabels();
        let scoreForRow = 0;
        let option_code: string;

        if (field === "code") {
          option_code = ensureUniqueRawOptionCode(rawValue, prev);
        } else if (field === "score") {
          const n = Number(trimmed.replace(",", "."));
          scoreForRow = Number.isFinite(n) ? n : 0;
          option_code = generateUniqueOptionCode(emptyEnumRowLabels(), prev);
        } else {
          labels[field] = rawValue;
          option_code = generateUniqueOptionCode(labels, prev);
        }

        const newRow = withEnumRowKey({
          option_code,
          labels:
            field === "code" || field === "score"
              ? emptyEnumRowLabels()
              : { ...labels },
          score: field === "score" ? scoreForRow : 0,
          display_order: prev.length,
          is_active: true,
        });
        pendingEnumFocusRef.current = { idx: prev.length, field };
        return [...prev, newRow];
      });
      setGhostBump((b) => b + 1);
    },
    [onRowsChange]
  );

  useLayoutEffect(() => {
    const p = pendingEnumFocusRef.current;
    if (!p) return;
    const id = `validation-enum-${p.idx}-${p.field}`;
    let attempts = 0;
    const maxAttempts = 5;

    const tryFocus = () => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
        pendingEnumFocusRef.current = null;
        return true;
      }
      return false;
    };

    if (tryFocus()) return;

    const rafTry = () => {
      attempts += 1;
      if (tryFocus()) return;
      if (attempts < maxAttempts) {
        requestAnimationFrame(rafTry);
      } else {
        pendingEnumFocusRef.current = null;
      }
    };
    requestAnimationFrame(rafTry);
  }, [rows, ghostBump]);

  const onEnumDataRowEnterNav = useCallback(
    (
      e: KeyboardEvent<HTMLInputElement>,
      rowIdx: number,
      field: EnumGhostFocusField,
      rowCount: number,
      ghostKey: number
    ) => {
      if (e.key !== "Enter") return;
      if (e.shiftKey) return;
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      const order = ENUM_ROW_FIELD_ORDER;
      const i = order.indexOf(field);
      if (i === -1) return;
      if (i < order.length - 1) {
        focusEnumInputById(`validation-enum-${rowIdx}-${order[i + 1]}`);
        return;
      }
      if (rowIdx < rowCount - 1) {
        focusEnumInputById(`validation-enum-${rowIdx + 1}-code`);
      } else {
        focusEnumInputById(`validation-enum-ghost-${ghostKey}-code`);
      }
    },
    []
  );

  const onEnumGhostRowEnterNav = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, field: EnumGhostFocusField, ghostKey: number) => {
      if (e.key !== "Enter") return;
      if (e.shiftKey) return;
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      const order = ENUM_ROW_FIELD_ORDER;
      const i = order.indexOf(field);
      if (i === -1) return;
      if (i < order.length - 1) {
        focusEnumInputById(`validation-enum-ghost-${ghostKey}-${order[i + 1]}`);
      } else {
        focusEnumInputById(`validation-enum-ghost-${ghostKey}-code`);
      }
    },
    []
  );

  const columns = useValidationEnumGridColumns({
    t,
    rows,
    onRowsChange,
    ghostBump,
    onDataRowEnterNav: onEnumDataRowEnterNav,
  });

  return (
    <InlineEditableTable
      wrapClassName={wrapClassName}
      scrollClassName="tbl-scroll"
      tableClassName="tv-grid-table w-full !min-w-[420px]"
      tableAriaLabel={tableAriaLabel}
      disableGlobalArrowNavigation
      gridColumns={columns as import("@/components/TableView").EditableGridColumnDef<unknown>[]}
      thead={
        <thead>
          <EditableDataGridThead columns={columns} showFilterRow={false} />
        </thead>
      }
      tbody={
        <tbody>
          <EditableDataGridBody
            rows={rows}
            columns={columns}
            getRowId={(row) => row._rowKey}
            editingRowId={null}
            trProps={() =>
              ({ "data-tv-row-editing": "true" }) as Omit<
                HTMLAttributes<HTMLTableRowElement>,
                "children"
              >
            }
          />
          <tr
            className="add-row"
            data-tv-add-row="true"
            data-tv-row-editing="true"
            key={`ghost-${ghostBump}`}
          >
            <td className="!px-1.5 !py-0.5">
              <TextField
                fieldSize="xs"
                className="text-text-muted placeholder:text-text-muted"
                id={`validation-enum-ghost-${ghostBump}-code`}
                defaultValue=""
                aria-label={`${t("CODE")} (${t("ADD_OPTION")})`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.trim()) promoteGhostField("code", v);
                }}
                onKeyDown={(e) => onEnumGhostRowEnterNav(e, "code", ghostBump)}
                placeholder={t("CODE")}
              />
            </td>
            {ENUM_TABLE_LOCALES.map((loc) => (
              <td className="!px-1.5 !py-0.5" key={loc}>
                <TextField
                  fieldSize="xs"
                  className="text-text-muted placeholder:text-text-muted"
                  id={`validation-enum-ghost-${ghostBump}-${loc}`}
                  defaultValue=""
                  aria-label={localeAddAriaLabel(t, loc)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.trim()) promoteGhostField(loc, v);
                  }}
                  onKeyDown={(e) => onEnumGhostRowEnterNav(e, loc, ghostBump)}
                  placeholder={localePlaceholder(t, loc)}
                />
              </td>
            ))}
            <td className="!px-1.5 !py-0.5">
              <TextField
                fieldSize="xs"
                id={`validation-enum-ghost-${ghostBump}-score`}
                className="text-left text-text-muted placeholder:text-text-muted"
                type="text"
                inputMode="decimal"
                defaultValue=""
                aria-label={`${t("SCORE")} (${t("ADD_OPTION")})`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.trim()) promoteGhostField("score", v);
                }}
                onKeyDown={(e) => onEnumGhostRowEnterNav(e, "score", ghostBump)}
                placeholder="0"
              />
            </td>
            <td className="!px-1.5 !py-0.5 text-center" />
          </tr>
        </tbody>
      }
    />
  );
}
