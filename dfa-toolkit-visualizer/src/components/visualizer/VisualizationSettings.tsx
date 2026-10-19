'use client';

import { useState, useRef, useEffect } from 'react';
import { Type, Palette, Settings as SettingsIcon, X } from 'lucide-react';
import { getTooltipHandlers } from "@/components/CustomTooltip";
import { useCore } from "@/contexts/CoreContext";
import type { DimensionValues, VisualizationConfig } from "@/lib/visualizer/types";
import { BasicSettingsTab } from './BasicSettingsTab';
import { AppearanceTab } from './AppearanceTab';
import { TypographyTab } from './TypographyTab';

export type { VisualizationConfig } from "@/lib/visualizer/types";

/** Panel width below this shows only icons (tabs + chart type/variant). */
const COMPACT_WIDTH = 380;

interface VisualizationSettingsProps {
  settings: VisualizationConfig;
  onSettingsChange: (settings: VisualizationConfig) => void;
  onClose?: () => void;
  seriesCount?: number;
  activeColors?: string[];
  onUserChangedAxisMapping?: () => void;
  onUserChangedChartType?: () => void;
  dimensionValues?: DimensionValues;
  activeTab?: VisualizationSettingsTabId;
  onActiveTabChange?: (tab: VisualizationSettingsTabId) => void;
}

export type VisualizationSettingsTabId = 'basic' | 'colors' | 'typography';

const primaryVar = 'var(--color-primary)';
const primaryLightVar = 'var(--color-primary)';
const onPrimaryVar = 'var(--color-on-primary)';

export function VisualizationSettings({
  settings,
  onSettingsChange,
  onClose,
  seriesCount = 1,
  activeColors,
  onUserChangedAxisMapping,
  onUserChangedChartType,
  dimensionValues,
  activeTab: activeTabProp,
  onActiveTabChange,
}: VisualizationSettingsProps) {
  const { t } = useCore();
  const [activeTabInternal, setActiveTabInternal] = useState<VisualizationSettingsTabId>('basic');
  const activeTab = activeTabProp ?? activeTabInternal;
  const setActiveTab = (tab: VisualizationSettingsTabId) => {
    onActiveTabChange?.(tab);
    if (activeTabProp === undefined) {
      setActiveTabInternal(tab);
    }
  };
  const [colorMode, setColorMode] = useState<'palette' | 'custom'>('palette');
  const [compact, setCompact] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setCompact(width < COMPACT_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getActiveButtonStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? primaryVar : undefined,
    borderColor: isActive ? primaryVar : undefined,
    color: isActive ? onPrimaryVar : undefined
  });

  const getActiveTabStyle = (isActive: boolean) => ({
    borderColor: isActive ? primaryVar : undefined,
    backgroundColor: isActive ? `color-mix(in srgb, ${primaryLightVar} 6%, transparent)` : undefined,
    color: isActive ? primaryVar : undefined
  });

  const updateSettings = (updates: Partial<VisualizationConfig>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const updateFontSettings = (
    section: 'titleFont' | 'subtitleFont' | 'descriptionFont' | 'labelFont' | 'legendFont',
    updates: Partial<VisualizationConfig['titleFont']>
  ) => {
    onSettingsChange({
      ...settings,
      [section]: { ...settings[section], ...updates },
    });
  };

  const tabs = [
    { id: 'basic' as const, labelKey: 'VISUALIZER_SETTINGS_TAB_BASIC', icon: SettingsIcon },
    { id: 'colors' as const, labelKey: 'VISUALIZER_SETTINGS_TAB_APPEARANCE', icon: Palette },
    { id: 'typography' as const, labelKey: 'VISUALIZER_SETTINGS_TAB_TYPOGRAPHY', icon: Type },
  ] as const;

  return (
    <div
      ref={rootRef}
      className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col h-full min-h-0"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-surface-muted border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm text-text flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            {t('VISUALIZER_SETTINGS_TITLE')}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text hover:bg-surface rounded transition-colors"
              {...getTooltipHandlers(t('VISUALIZER_SETTINGS_CLOSE'))}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation — labels hidden when panel is narrow (container-based) */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const tabLabel = t(tab.labelKey);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 flex items-center justify-center gap-2 transition-all border-b-2 ${
                compact ? 'px-2' : 'px-4'
              } ${
                activeTab === tab.id
                  ? 'border-primary'
                  : 'border-transparent text-text-muted hover:bg-surface-muted hover:text-text'
              }`}
              style={activeTab === tab.id ? getActiveTabStyle(true) : undefined}
              {...getTooltipHandlers(tabLabel)}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!compact && <span className="text-sm font-medium">{tabLabel}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab Content - scrolls when content exceeds available height */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'basic' && (
          <BasicSettingsTab
            settings={settings}
            updateSettings={updateSettings}
            getActiveButtonStyle={getActiveButtonStyle}
            compact={compact}
            onUserChangedAxisMapping={onUserChangedAxisMapping}
            onUserChangedChartType={onUserChangedChartType}
            dimensionValues={dimensionValues}
          />
        )}

        {activeTab === 'colors' && (
          <AppearanceTab
            settings={settings}
            updateSettings={updateSettings}
            colorMode={colorMode}
            setColorMode={setColorMode}
            seriesCount={seriesCount ?? 1}
            activeColors={activeColors}
          />
        )}

        {activeTab === 'typography' && (
          <TypographyTab settings={settings} updateFontSettings={updateFontSettings} />
        )}
      </div>
    </div>
  );
}
