'use client';

import { useCore } from '@/contexts/CoreContext';
import type { VisualizationConfig } from '@/lib/visualizer/types';
import { generateColors, type ClassificationMethod } from '@/lib/visualizer/mapUtils';

interface MapSettingsSectionProps {
  settings: VisualizationConfig;
  updateSettings: (updates: Partial<VisualizationConfig>) => void;
}

const METHODS: { value: ClassificationMethod; label: string; translationCode: string }[] = [
  { value: 'equal_interval', label: 'Equal size', translationCode: 'VISUALIZER_MAP_EQUAL_INTERVAL' },
  { value: 'quantile', label: 'Equal count', translationCode: 'VISUALIZER_MAP_QUANTILE' },
  { value: 'custom', label: 'Custom', translationCode: 'VISUALIZER_MAP_CUSTOM' },
];

const MIN_K = 2;
const MAX_K = 9;

type MapLabelField = keyof NonNullable<VisualizationConfig['mapLabels']>;
const LABEL_TOGGLES: { field: MapLabelField; label: string; translationCode: string }[] = [
  { field: 'showAreaName', label: 'Area Name', translationCode: 'VISUALIZER_MAP_LABEL_AREA_NAME' },
  { field: 'showAreaId', label: 'Area ID', translationCode: 'VISUALIZER_MAP_LABEL_AREA_ID' },
  { field: 'showDataValue', label: 'Data Value', translationCode: 'VISUALIZER_MAP_LABEL_DATA_VALUE' },
];

export function MapSettingsSection({ settings, updateSettings }: MapSettingsSectionProps) {
  const { t } = useCore();
  const cls = settings.mapClassification ?? { method: 'equal_interval' as const, k: 4 };
  const mapLabels = settings.mapLabels ?? { showAreaName: false, showDataValue: false, showAreaId: false };
  const method = cls.method;
  const k = cls.k;
  const customBreaks = cls.customBreaks ?? [];
  const colors = cls.colors ?? generateColors(k);

  const update = (patch: Partial<NonNullable<VisualizationConfig['mapClassification']>>) => {
    updateSettings({
      mapClassification: { ...cls, ...patch },
    });
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handleMethodChange = (newMethod: ClassificationMethod) => {
    if (newMethod === method) return;
    const patch: Partial<NonNullable<VisualizationConfig['mapClassification']>> = { method: newMethod };
    if (newMethod === 'custom' && customBreaks.length < 2) {
      const defaultBreaks: number[] = [];
      for (let i = 0; i <= k; i++) defaultBreaks.push(i * (100 / k));
      patch.customBreaks = defaultBreaks;
    }
    update(patch);
  };

  const handleKChange = (newK: number) => {
    const clamped = Math.max(MIN_K, Math.min(MAX_K, newK));
    const newColors = generateColors(clamped);
    const patch: Partial<NonNullable<VisualizationConfig['mapClassification']>> = {
      k: clamped,
      colors: newColors,
    };
    if (method === 'custom') {
      const defaultBreaks: number[] = [];
      for (let i = 0; i <= clamped; i++) defaultBreaks.push(i * (100 / clamped));
      patch.customBreaks = defaultBreaks;
    }
    update(patch);
  };

  const handleBoundaryChangeClamped = (boundaryIndex: number, val: string) => {
    const num = parseFloat(val);
    if (Number.isNaN(num)) return;

    const next = [...customBreaks];
    const lower = boundaryIndex > 0 ? next[boundaryIndex - 1] : -Infinity;
    const upper = boundaryIndex < next.length - 1 ? next[boundaryIndex + 1] : Infinity;
    next[boundaryIndex] = clamp(num, lower, upper);
    update({ customBreaks: next });
  };

  const handleColorChange = (index: number, color: string) => {
    const next = [...colors];
    next[index] = color;
    update({ colors: next });
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <h4 className="text-xs font-semibold text-text">
        {t('VISUALIZER_MAP_SETTINGS') || 'Map Settings'}
      </h4>

      {/* Classification method */}
      <div>
        <label className="text-xs text-text-muted mb-1 block">
          {t('VISUALIZER_MAP_CLASSIFICATION_METHOD') || 'Classification Method'}
        </label>
        <div className="grid grid-cols-3 gap-1 min-w-0">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => handleMethodChange(m.value)}
              className={`px-1.5 py-1 text-[11px] rounded border transition-colors whitespace-nowrap overflow-hidden text-ellipsis min-w-0 ${
                method === m.value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-text border-border hover:border-primary'
              }`}
              style={method === m.value ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' } : undefined}
            >
              {t(m.translationCode) || m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Number of bins */}
      <div>
        <label className="text-xs text-text-muted mb-1 block">
          {t('VISUALIZER_MAP_NUM_RANGES') || 'Number of Ranges'}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleKChange(k - 1)}
            disabled={k <= MIN_K}
            className="w-8 h-8 flex items-center justify-center rounded border border-border text-text disabled:opacity-40"
          >
            -
          </button>
          <span className="text-sm font-medium text-text w-6 text-center">{k}</span>
          <button
            onClick={() => handleKChange(k + 1)}
            disabled={k >= MAX_K}
            className="w-8 h-8 flex items-center justify-center rounded border border-border text-text disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Custom ranges (Color + Min + Max in one row) */}
      {method === 'custom' && (
        <div>
          <label className="text-xs text-text-muted mb-1 block">
            {t('VISUALIZER_MAP_CUSTOM') || 'Custom'}
          </label>

          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 items-center text-[11px] text-text-muted mb-1">
            <span>#</span>
            <span>{t('VISUALIZER_MAP_COLORS') || 'Color'}</span>
            <span>Min</span>
            <span>Max</span>
          </div>

          <div className="space-y-1">
            {Array.from({ length: k }, (_, i) => {
              const minVal = customBreaks[i] ?? 0;
              const maxVal = customBreaks[i + 1] ?? 0;
              return (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 items-center">
                  <span className="text-xs text-text-muted w-5">{i + 1}</span>

                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="color"
                      value={colors[i] ?? '#cccccc'}
                      onChange={(e) => handleColorChange(i, e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border border-border p-0 shrink-0"
                      title={`Range ${i + 1}`}
                    />
                    <span className="text-xs text-text-muted truncate">{colors[i] ?? '#cccccc'}</span>
                  </div>

                  <input
                    type="number"
                    value={minVal}
                    onChange={(e) => handleBoundaryChangeClamped(i, e.target.value)}
                    className="w-full min-w-0 px-2 py-1 text-xs border border-border rounded bg-surface text-text"
                  />

                  <input
                    type="number"
                    value={maxVal}
                    onChange={(e) => handleBoundaryChangeClamped(i + 1, e.target.value)}
                    className="w-full min-w-0 px-2 py-1 text-xs border border-border rounded bg-surface text-text"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Color per bin */}
      {method !== 'custom' && (
        <div>
        <label className="text-xs text-text-muted mb-1 block">
          {t('VISUALIZER_MAP_COLORS') || 'Range Colors'}
        </label>
        <div className="space-y-1">
          {Array.from({ length: k }, (_, i) => (
            <div key={i} className="grid grid-cols-[2rem_auto_1fr] items-center gap-2">
              <span className="text-xs text-text-muted">{i + 1}</span>
              <input
                type="color"
                value={colors[i] ?? '#cccccc'}
                onChange={(e) => handleColorChange(i, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-border p-0"
                title={`Range ${i + 1}`}
              />
              <span className="text-xs text-text-muted">{colors[i] ?? '#cccccc'}</span>
            </div>
          ))}
        </div>
        </div>
      )}

      {/* Map label toggles */}
      <div>
        <label className="text-xs text-text-muted mb-1 block">
          {t('VISUALIZER_MAP_LABELS') || 'Map Labels'}
        </label>
        <div className="space-y-1.5">
          {LABEL_TOGGLES.map((tog) => (
            <label key={tog.field} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!mapLabels[tog.field]}
                onChange={(e) =>
                  updateSettings({
                    mapLabels: { ...mapLabels, [tog.field]: e.target.checked },
                  })
                }
                className="accent-[var(--color-primary)] w-3.5 h-3.5"
              />
              <span className="text-xs text-text">{t(tog.translationCode) || tog.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
