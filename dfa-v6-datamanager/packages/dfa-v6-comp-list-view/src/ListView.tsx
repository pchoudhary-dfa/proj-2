import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";

/**
 * List view (scrollable list with checkboxes). Styling is token-driven via styles.css;
 * uses design tokens from packages/design-tokens/tokens.css when loaded by the app.
 */
export type ListViewItem = { id: string | number; label: string };

export type ListViewApi = {
  getData(): ListViewItem[];
  clearData(): void;
};

export type ListViewProps = {
  items: ListViewItem[];
  multiSelect?: boolean;
  selectedIds?: (string | number)[];
  onSelectionChange?: (selected: ListViewItem[]) => void;
  onReady?: (api: ListViewApi) => void;
};

function normalizeId(id: string | number): string {
  return String(id);
}

export const ListView = forwardRef<ListViewApi, ListViewProps>(function ListView(
  {
    items,
    multiSelect = true,
    selectedIds = [],
    onSelectionChange,
    onReady,
  },
  ref
) {
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() =>
    new Set(selectedIds.map(normalizeId))
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const getData = useCallback((): ListViewItem[] => {
    const idToLabel = new Map<string, string>();
    for (const it of itemsRef.current) {
      idToLabel.set(normalizeId(it.id), it.label);
    }
    return Array.from(selectedSet).map((id) => ({
      id,
      label: idToLabel.get(id) ?? id,
    }));
  }, [selectedSet]);

  const clearData = useCallback(() => {
    setSelectedSet(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const apiRef = useRef<ListViewApi>({ getData, clearData });
  apiRef.current.getData = getData;
  apiRef.current.clearData = clearData;

  useEffect(() => {
    onReady?.(apiRef.current);
  }, [onReady]);

  useImperativeHandle(ref, () => apiRef.current, []);

  // Stable key so effect does not run when parent passes a new array reference with same contents (avoids max update depth).
  const selectedIdsKey =
    selectedIds.length === 0
      ? ""
      : selectedIds
          .map(normalizeId)
          .sort()
          .join(",");

  useEffect(() => {
    const next = new Set(selectedIds.map(normalizeId));
    setSelectedSet((prev) => {
      if (
        prev.size !== next.size ||
        [...prev].some((id) => !next.has(id))
      )
        return next;
      return prev;
    });
  }, [selectedIdsKey]);

  const pendingSelectionRef = useRef<ListViewItem[] | null>(null);

  const handleToggle = useCallback(
    (id: string | number) => {
      const sid = normalizeId(id);
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (multiSelect) {
          if (next.has(sid)) next.delete(sid);
          else next.add(sid);
        } else {
          next.clear();
          next.add(sid);
        }
        const idToLabel = new Map(
          itemsRef.current.map((it) => [normalizeId(it.id), it.label])
        );
        pendingSelectionRef.current = Array.from(next).map((i) => ({
          id: i,
          label: idToLabel.get(i) ?? i,
        }));
        return next;
      });
      queueMicrotask(() => {
        if (pendingSelectionRef.current) {
          onSelectionChange?.(pendingSelectionRef.current);
          pendingSelectionRef.current = null;
        }
      });
    },
    [multiSelect, onSelectionChange]
  );

  return (
    <div className="dtk-lv-list-wrap">
      <div className="dtk-lv-list">
        {items.map((item) => {
          const sid = normalizeId(item.id);
          const checked = selectedSet.has(sid);
          return (
            <label key={sid} className="dtk-lv-row">
              {multiSelect ? (
                <input
                  type="checkbox"
                  className="dtk-lv-checkbox"
                  checked={checked}
                  onChange={() => handleToggle(item.id)}
                  data-id={sid}
                  aria-label={item.label}
                />
              ) : (
                <input
                  type="radio"
                  name="dtk-lv-radio"
                  className="dtk-lv-checkbox"
                  checked={checked}
                  onChange={() => handleToggle(item.id)}
                  data-id={sid}
                  aria-label={item.label}
                />
              )}
              <span className="dtk-lv-item-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
});
