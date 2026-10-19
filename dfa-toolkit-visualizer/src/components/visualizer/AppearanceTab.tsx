'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import { Palette, X } from 'lucide-react';
import { getTooltipHandlers } from '@/components/CustomTooltip';
import { useCore } from '@/contexts/CoreContext';
import type { VisualizationConfig } from '@/lib/visualizer/types';
import { COLOR_THEME_OPTIONS, COLOR_THEMES } from '@/lib/visualizer/colorThemes';

const primaryVar = 'var(--color-primary)';
const primaryLightVar = 'var(--color-primary)';

/** Native color input requires a #rrggbb value; when unset, show white until the user picks a color. */
function hexForColorInput(stored: string | undefined): string {
  const s = stored?.trim();
  if (s && /^#[0-9A-Fa-f]{6}$/i.test(s)) return s;
  return '#ffffff';
}

interface AppearanceTabProps {
  settings: VisualizationConfig;
  updateSettings: (updates: Partial<VisualizationConfig>) => void;
  colorMode: 'palette' | 'custom';
  setColorMode: (mode: 'palette' | 'custom') => void;
  seriesCount: number;
  activeColors?: string[];
}

export function AppearanceTab({
  settings,
  updateSettings,
  colorMode,
  setColorMode,
  seriesCount = 1,
  activeColors,
}: AppearanceTabProps) {
  const { t } = useCore();
  const focusRingStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.outline = 'none';
    e.currentTarget.style.borderColor = primaryVar;
    e.currentTarget.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)`;
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.boxShadow = '';
  };

  const chartBgFocusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.outline = 'none';
    e.currentTarget.style.borderColor = primaryVar;
    e.currentTarget.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)`;
  };
  const chartBgBlurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.boxShadow = '';
  };

  const [localChartAreaColor, setLocalChartAreaColor] = useState(
    settings.chartAreaBackgroundColor ?? ''
  );
  const [localPlotAreaColor, setLocalPlotAreaColor] = useState(
    settings.plotAreaBackgroundColor ?? ''
  );
  const chartAreaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plotAreaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartAreaColorInputRef = useRef<HTMLInputElement>(null);
  const plotAreaColorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalChartAreaColor(settings.chartAreaBackgroundColor ?? '');
  }, [settings.chartAreaBackgroundColor]);
  useEffect(() => {
    setLocalPlotAreaColor(settings.plotAreaBackgroundColor ?? '');
  }, [settings.plotAreaBackgroundColor]);
  useEffect(
    () => () => {
      if (chartAreaTimer.current) clearTimeout(chartAreaTimer.current);
      if (plotAreaTimer.current) clearTimeout(plotAreaTimer.current);
    },
    []
  );

  const handleChartAreaChange = useCallback(
    (value: string) => {
      setLocalChartAreaColor(value);
      if (chartAreaTimer.current) clearTimeout(chartAreaTimer.current);
      chartAreaTimer.current = setTimeout(
        () => updateSettings({ chartAreaBackgroundColor: value }),
        160
      );
    },
    [updateSettings]
  );

  const handlePlotAreaChange = useCallback(
    (value: string) => {
      setLocalPlotAreaColor(value);
      if (plotAreaTimer.current) clearTimeout(plotAreaTimer.current);
      plotAreaTimer.current = setTimeout(
        () => updateSettings({ plotAreaBackgroundColor: value }),
        160
      );
    },
    [updateSettings]
  );

  const clearChartArea = () => {
    if (chartAreaTimer.current) clearTimeout(chartAreaTimer.current);
    setLocalChartAreaColor('');
    updateSettings({ chartAreaBackgroundColor: '' });
  };

  const clearPlotArea = () => {
    if (plotAreaTimer.current) clearTimeout(plotAreaTimer.current);
    setLocalPlotAreaColor('');
    updateSettings({ plotAreaBackgroundColor: '' });
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-4 py-4">
        <label className="text-sm text-text">{t('VISUALIZER_APPEARANCE_PICK_FROM')}</label>
        <div className="flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-text-muted" />
          <span
            className={`text-sm font-medium transition-colors ${colorMode === 'palette' ? 'text-primary' : 'text-text-muted'}`}
          >
            {t('VISUALIZER_APPEARANCE_PALETTE')}
          </span>
        </div>
        <button
          onClick={() => setColorMode(colorMode === 'palette' ? 'custom' : 'palette')}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
          style={{
            backgroundColor: colorMode === 'custom' ? primaryVar : 'var(--color-border)',
            boxShadow: colorMode === 'custom' ? `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)` : 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = colorMode === 'custom' ? `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)` : 'none';
          }}
          role="switch"
          aria-checked={colorMode === 'custom'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
              colorMode === 'custom' ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${colorMode === 'custom' ? 'text-primary' : 'text-text-muted'}`}
        >
          {t('VISUALIZER_APPEARANCE_CUSTOM')}
        </span>
      </div>

      {colorMode === 'palette' && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {COLOR_THEME_OPTIONS.map((theme) => (
              <button
                key={theme.name}
                onClick={() => updateSettings({ theme: theme.name, chartColor: theme.colors[0] })}
                className={`p-2 border-2 rounded-xl transition-all ${
                  settings.theme === theme.name
                    ? 'bg-surface shadow-lg scale-105 border-primary'
                    : 'border-border hover:border-border hover:shadow-md bg-surface'
                }`}
                style={
                  settings.theme === theme.name
                    ? {
                        boxShadow: `0 0 0 4px color-mix(in srgb, ${primaryLightVar} 25%, transparent), 0 20px 25px -5px rgba(0, 0, 0, 0.1)`,
                      }
                    : undefined
                }
                {...getTooltipHandlers(theme.name)}
              >
                <div className="flex gap-1">
                  {theme.colors.map((color, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-8 rounded-lg"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {colorMode === 'custom' && (
        <div>
          <div className="space-y-3">
            {(activeColors ||
              settings.customColors ||
              COLOR_THEMES[settings.theme] ||
              COLOR_THEMES['Default'])
              .slice(0, seriesCount)
              .map((color, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <span className="text-xs text-text-muted w-16">
                    {t('VISUALIZER_APPEARANCE_COLOR')} {index + 1}
                  </span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const currentColors =
                        activeColors ||
                        settings.customColors ||
                        COLOR_THEMES[settings.theme] ||
                        COLOR_THEMES['Default'];
                      const newColors = [...currentColors];
                      newColors[index] = e.target.value;
                      updateSettings({ customColors: newColors, theme: 'Custom' });
                    }}
                    className="w-12 h-10 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => {
                      const currentColors =
                        activeColors ||
                        settings.customColors ||
                        COLOR_THEMES[settings.theme] ||
                        COLOR_THEMES['Default'];
                      const newColors = [...currentColors];
                      newColors[index] = e.target.value;
                      updateSettings({
                        customColors: newColors,
                        theme: 'Custom',
                        chartColor: newColors[0],
                      });
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    onFocus={focusRingStyle}
                    onBlur={blurStyle}
                    placeholder={t('VISUALIZER_APPEARANCE_HEX_PLACEHOLDER')}
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-4 border-t border-border pt-4">
        <div>
          <label className="text-sm text-text block mb-2">{t('VISUALIZER_SETTINGS_CHART_AREA')}</label>
          <div className="flex gap-2 items-center">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => chartAreaColorInputRef.current?.click()}
                className="w-10 h-10 rounded-lg border border-border bg-surface flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors gap-0"
                aria-label={t('VISUALIZER_ARIA_PICK_CHART_AREA_BG')}
              >
                <FormatColorFillIcon
                  className="w-4 h-4 shrink-0"
                  style={{
                    color: localChartAreaColor?.trim() || 'var(--color-text-muted)',
                  }}
                />
              </button>
              <input
                ref={chartAreaColorInputRef}
                type="color"
                value={hexForColorInput(localChartAreaColor)}
                onChange={(e) => handleChartAreaChange(e.target.value)}
                className="sr-only absolute inset-0 w-0 h-0 opacity-0"
                aria-label={t('VISUALIZER_ARIA_CHART_AREA_BG')}
                tabIndex={-1}
              />
            </div>
            <input
              type="text"
              value={localChartAreaColor}
              onChange={(e) => setLocalChartAreaColor(e.target.value)}
              onFocus={chartBgFocusStyle}
              onBlur={(e) => {
                chartBgBlurStyle(e);
                const val = e.target.value;
                if (val !== (settings.chartAreaBackgroundColor ?? '')) {
                  updateSettings({ chartAreaBackgroundColor: val });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateSettings({ chartAreaBackgroundColor: localChartAreaColor });
              }}
              className="flex-1 min-w-0 px-3 py-2 text-xs border border-border rounded-lg transition-colors"
              placeholder={t('VISUALIZER_PLACEHOLDER_DEFAULT_TRANSPARENT')}
              aria-label={t('VISUALIZER_ARIA_CHART_AREA_HEX')}
            />
            {localChartAreaColor !== '' && (
              <button
                type="button"
                onClick={clearChartArea}
                className="shrink-0 p-1.5 text-text-muted hover:text-text hover:bg-surface-muted rounded-lg transition-colors"
                aria-label={t('VISUALIZER_ARIA_CLEAR_CHART_AREA_COLOR')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-sm text-text block mb-2">{t('VISUALIZER_SETTINGS_PLOT_AREA')}</label>
          <div className="flex gap-2 items-center">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => plotAreaColorInputRef.current?.click()}
                className="w-10 h-10 rounded-lg border border-border bg-surface flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors gap-0"
                aria-label={t('VISUALIZER_ARIA_PICK_PLOT_AREA_BG')}
              >
                <FormatColorFillIcon
                  className="w-4 h-4 shrink-0"
                  style={{
                    color: localPlotAreaColor?.trim() || 'var(--color-text-muted)',
                  }}
                />
              </button>
              <input
                ref={plotAreaColorInputRef}
                type="color"
                value={hexForColorInput(localPlotAreaColor)}
                onChange={(e) => handlePlotAreaChange(e.target.value)}
                className="sr-only absolute inset-0 w-0 h-0 opacity-0"
                aria-label={t('VISUALIZER_ARIA_PLOT_AREA_BG')}
                tabIndex={-1}
              />
            </div>
            <input
              type="text"
              value={localPlotAreaColor}
              onChange={(e) => setLocalPlotAreaColor(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-xs border border-border rounded-lg transition-colors"
              onFocus={chartBgFocusStyle}
              onBlur={(e) => {
                chartBgBlurStyle(e);
                const val = e.target.value;
                if (val !== (settings.plotAreaBackgroundColor ?? '')) {
                  updateSettings({ plotAreaBackgroundColor: val });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateSettings({ plotAreaBackgroundColor: localPlotAreaColor });
              }}
              placeholder={t('VISUALIZER_PLACEHOLDER_DEFAULT_TRANSPARENT')}
              aria-label={t('VISUALIZER_ARIA_PLOT_AREA_HEX')}
            />
            {localPlotAreaColor !== '' && (
              <button
                type="button"
                onClick={clearPlotArea}
                className="shrink-0 p-1.5 text-text-muted hover:text-text hover:bg-surface-muted rounded-lg transition-colors"
                aria-label={t('VISUALIZER_ARIA_CLEAR_PLOT_AREA_COLOR')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {settings.chartType === 'bar' && (
        <div>
          <label className="text-sm text-text block mb-2">{t('VISUALIZER_APPEARANCE_SPACE_BETWEEN')}</label>
          <div className="flex gap-3 items-center">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.columnSpacing || 43}
              onChange={(e) => updateSettings({ columnSpacing: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-surface-muted rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: primaryVar }}
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="100"
                value={settings.columnSpacing || 43}
                onChange={(e) =>
                  updateSettings({
                    columnSpacing: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)),
                  })
                }
                className="w-20 px-3 py-2 text-xs border border-border rounded text-center transition-colors"
                onFocus={focusRingStyle}
                onBlur={blurStyle}
              />
              <span className="text-sm text-text-muted">%</span>
            </div>
          </div>
        </div>
      )}

      {(settings.chartType === 'line' || settings.chartType === 'area') && (
        <div>
          <label className="text-sm text-text block mb-2">{t('VISUALIZER_APPEARANCE_LINE_THICKNESS')}</label>
          <div className="flex gap-3 items-center">
            <input
              type="range"
              min="1"
              max="10"
              value={settings.lineThickness || 2}
              onChange={(e) => updateSettings({ lineThickness: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-surface-muted rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: primaryVar }}
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="10"
                value={settings.lineThickness || 2}
                onChange={(e) =>
                  updateSettings({
                    lineThickness: Math.min(10, Math.max(1, parseInt(e.target.value) || 2)),
                  })
                }
                className="w-20 px-3 py-2 text-xs border border-border rounded text-center transition-colors"
                onFocus={focusRingStyle}
                onBlur={blurStyle}
              />
              <span className="text-xs text-text-muted">px</span>
            </div>
          </div>
        </div>
      )}

      {settings.chartType === 'advanced' && settings.chartVariant === 'scatter' && (
        <div>
          <label className="text-sm text-text block mb-2">{t('VISUALIZER_APPEARANCE_SYMBOL_SIZE')}</label>
          <div className="flex gap-3 items-center">
            <input
              type="range"
              min="4"
              max="30"
              value={settings.scatterSettings?.symbolSize ?? 10}
              onChange={(e) =>
                updateSettings({
                  scatterSettings: {
                    ...settings.scatterSettings,
                    symbolSize: parseInt(e.target.value, 10),
                    symbol: settings.scatterSettings?.symbol ?? 'circle',
                  },
                })
              }
              className="flex-1 h-2 bg-surface-muted rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: primaryVar }}
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="4"
                max="30"
                value={settings.scatterSettings?.symbolSize ?? 10}
                onChange={(e) =>
                  updateSettings({
                    scatterSettings: {
                      ...settings.scatterSettings,
                      symbolSize: Math.min(30, Math.max(4, parseInt(e.target.value, 10) || 10)),
                      symbol: settings.scatterSettings?.symbol ?? 'circle',
                    },
                  })
                }
                className="w-20 px-3 py-2 text-xs border border-border rounded text-center transition-colors"
                onFocus={focusRingStyle}
                onBlur={blurStyle}
              />
              <span className="text-xs text-text-muted">px</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
