'use client';

import { useState, useCallback } from 'react';
import { useCore } from '@/contexts/CoreContext';
import type { VisualizationConfig } from '@/lib/visualizer/types';
import { fontFamilies } from './VisualizationSettingsConstants';

interface FontControlsProps {
  label: string;
  font: VisualizationConfig['titleFont'];
  onChange: (updates: Partial<VisualizationConfig['titleFont']>) => void;
  /** Min font size in px (default 8). */
  minSize?: number;
  /** Max font size in px (default 72). */
  maxSize?: number;
}

const DEFAULT_MIN_SIZE = 8;
const DEFAULT_MAX_SIZE = 72;

const primaryVar = 'var(--color-primary)';
const primaryLightVar = 'var(--color-primary)';
const onPrimaryVar = 'var(--color-on-primary)';

export function FontControls({
  label,
  font,
  onChange,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = DEFAULT_MAX_SIZE,
}: FontControlsProps) {
  const { t } = useCore();
  const clampSize = (value: number) => Math.min(maxSize, Math.max(minSize, value));

  const [sizeFocused, setSizeFocused] = useState(false);
  const [sizeInputValue, setSizeInputValue] = useState('');

  const commitSize = useCallback(
    (raw: string) => {
      const parsed = parseInt(raw.trim(), 10);
      const size = Number.isNaN(parsed) ? minSize : clampSize(parsed);
      onChange({ size });
      setSizeInputValue(String(size));
    },
    [minSize, maxSize, onChange]
  );

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setSizeInputValue(raw);
    const parsed = parseInt(raw.trim(), 10);
    if (raw.trim() !== '' && !Number.isNaN(parsed)) {
      const size = clampSize(parsed);
      onChange({ size });
    }
  };

  const handleSizeFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setSizeFocused(true);
    setSizeInputValue(String(font.size));
    e.currentTarget.style.outline = 'none';
    e.currentTarget.style.borderColor = primaryVar;
    e.currentTarget.style.boxShadow = `0 0 0 1px ${primaryLightVar}`;
  };

  const handleSizeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setSizeFocused(false);
    commitSize(sizeInputValue);
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.boxShadow = '';
  };

  const sizeDisplayValue = sizeFocused ? sizeInputValue : String(font.size);

  const getActiveButtonStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? primaryVar : undefined,
    borderColor: isActive ? primaryVar : undefined,
    color: isActive ? onPrimaryVar : undefined,
  });

  return (
    <div className="space-y-3 p-3 bg-surface rounded border border-border">
      <p className="text-sm font-medium text-text">{label}</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-text-muted block mb-1">{t('VISUALIZER_FONT_FAMILY')}</label>
          <select
            value={font.family}
            onChange={(e) => onChange({ family: e.target.value })}
            className="w-full px-2 py-1 text-xs border border-border rounded transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onFocus={(e) => {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.borderColor = primaryVar;
              e.currentTarget.style.boxShadow = `0 0 0 1px ${primaryLightVar}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.boxShadow = '';
            }}
          >
            {fontFamilies.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">{t('VISUALIZER_FONT_SIZE_PX')}</label>
          <input
            type="number"
            value={sizeDisplayValue}
            onChange={handleSizeChange}
            min={minSize}
            max={maxSize}
            className="w-full px-2 py-1 text-xs border border-border rounded transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onFocus={handleSizeFocus}
            onBlur={handleSizeBlur}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onChange({ bold: !font.bold })}
          className={`px-3 py-1 text-sm border rounded transition-colors ${
            font.bold ? 'text-on-primary' : 'bg-surface text-text border-border hover:bg-surface-muted'
          }`}
          style={font.bold ? { ...getActiveButtonStyle(true), fontWeight: 'bold' } : { fontWeight: 'bold' }}
        >
          B
        </button>
        <button
          onClick={() => onChange({ italic: !font.italic })}
          className={`px-3 py-1 text-sm border rounded transition-colors ${
            font.italic ? 'text-on-primary' : 'bg-surface text-text border-border hover:bg-surface-muted'
          }`}
          style={font.italic ? { ...getActiveButtonStyle(true), fontStyle: 'italic' } : { fontStyle: 'italic' }}
        >
          I
        </button>
        <button
          onClick={() => onChange({ underline: !font.underline })}
          className={`px-3 py-1 text-sm border rounded transition-colors ${
            font.underline ? 'text-on-primary' : 'bg-surface text-text border-border hover:bg-surface-muted'
          }`}
          style={
            font.underline
              ? { ...getActiveButtonStyle(true), textDecoration: 'underline' }
              : { textDecoration: 'underline' }
          }
        >
          U
        </button>
      </div>
    </div>
  );
}
