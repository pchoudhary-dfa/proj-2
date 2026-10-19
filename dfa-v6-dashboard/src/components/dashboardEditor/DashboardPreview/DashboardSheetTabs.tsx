"use client";

import type { SectionTab } from "@/lib/dashboards/editorState";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type DashboardSheetTabsProps = {
  tabs: SectionTab[];
  activeId: string;
  onTabClick: (tabId: string) => void;
  onReorder: (newTabs: SectionTab[]) => void;
  onRenameTab: (tabId: string, newLabel: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
};

function SortableTab({
  tab,
  isActive,
  isEditing,
  editValue,
  canClose,
  onTabClick,
  onDoubleClick,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onClose,
}: {
  tab: SectionTab;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  canClose: boolean;
  onTabClick: () => void;
  onDoubleClick: () => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onClose: (e: MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, disabled: isEditing });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEditCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`btn-comp-tab relative !gap-1 pr-6 pl-1 cursor-grab ${isActive ? "active" : ""} ${isDragging ? "shadow-lg" : ""}`}
      onClick={isEditing ? undefined : onTabClick}
      onDoubleClick={isEditing ? undefined : onDoubleClick}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditCommit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-20 bg-transparent border-b border-current text-inherit text-sm outline-none px-0 py-0"
        />
      ) : (
        tab.label
      )}
      {canClose && (
        <span
          role="button"
          tabIndex={0}
          className="absolute right-0 top-5 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-text"
          aria-label={`Close ${tab.label} tab`}
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose(e as unknown as MouseEvent);
            }
          }}
        >
          <span className="material-icons !text-[14px] leading-none">
            close
          </span>
        </span>
      )}
    </button>
  );
}

export function DashboardSheetTabs({
  tabs,
  activeId,
  onTabClick,
  onReorder,
  onRenameTab,
  onAddTab,
  onCloseTab,
}: DashboardSheetTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = tabs.findIndex((t) => t.id === active.id);
        const newIndex = tabs.findIndex((t) => t.id === over.id);
        onReorder(arrayMove(tabs, oldIndex, newIndex));
      }
    },
    [tabs, onReorder],
  );

  const startEditing = useCallback((tab: SectionTab) => {
    setEditingTabId(tab.id);
    setEditValue(tab.label);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      onRenameTab(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue("");
  }, [editingTabId, editValue, onRenameTab]);

  const cancelEdit = useCallback(() => {
    setEditingTabId(null);
    setEditValue("");
  }, []);

  const handleClose = useCallback(
    (tabId: string, event: MouseEvent) => {
      event.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  return (
    <div className="page-subtabs-row shrink-0 rounded-t-lg mb-1">
      <nav className="bc-main-tabs min-w-0 flex-1 overflow-x-auto scrollbar-hide">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={activeId === tab.id}
                isEditing={editingTabId === tab.id}
                editValue={editValue}
                canClose={tabs.length > 1}
                onTabClick={() => onTabClick(tab.id)}
                onDoubleClick={() => startEditing(tab)}
                onEditChange={setEditValue}
                onEditCommit={commitEdit}
                onEditCancel={cancelEdit}
                onClose={(e) => handleClose(tab.id, e)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          className="add-row-prompt-btn-icon rounded-full"
          aria-label="Add sheet tab"
          onClick={onAddTab}
        >
          <span className="material-icons !text-sm leading-none">add</span>
        </button>
      </nav>
    </div>
  );
}
