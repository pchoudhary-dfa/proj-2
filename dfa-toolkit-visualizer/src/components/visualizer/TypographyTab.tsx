'use client';

import { useCore } from '@/contexts/CoreContext';
import type { VisualizationConfig } from '@/lib/visualizer/types';
import { FontControls } from './FontControls';

interface TypographyTabProps {
  settings: VisualizationConfig;
  updateFontSettings: (
    section: 'titleFont' | 'subtitleFont' | 'descriptionFont' | 'labelFont' | 'legendFont',
    updates: Partial<VisualizationConfig['titleFont']>
  ) => void;
}

const TITLE_DESCRIPTION_SIZE_MIN = 1;
const TITLE_DESCRIPTION_SIZE_MAX = 48;
const LABELS_LEGEND_SIZE_MIN = 1;
const LABELS_LEGEND_SIZE_MAX = 24;

export function TypographyTab({ settings, updateFontSettings }: TypographyTabProps) {
  const { t } = useCore();
  return (
    <div className="px-4 py-4 space-y-4">
      <FontControls
        label={t('VISUALIZER_TYPO_TITLE')}
        font={settings.titleFont}
        onChange={(updates) => updateFontSettings('titleFont', updates)}
        minSize={TITLE_DESCRIPTION_SIZE_MIN}
        maxSize={TITLE_DESCRIPTION_SIZE_MAX}
      />
      <FontControls
        label={t('VISUALIZER_TYPO_SUBTITLE')}
        font={settings.subtitleFont}
        onChange={(updates) => updateFontSettings('subtitleFont', updates)}
        minSize={TITLE_DESCRIPTION_SIZE_MIN}
        maxSize={TITLE_DESCRIPTION_SIZE_MAX}
      />
      <FontControls
        label={t('VISUALIZER_TYPO_DESCRIPTION')}
        font={settings.descriptionFont}
        onChange={(updates) => updateFontSettings('descriptionFont', updates)}
        minSize={TITLE_DESCRIPTION_SIZE_MIN}
        maxSize={TITLE_DESCRIPTION_SIZE_MAX}
      />
      <FontControls
        label={t('VISUALIZER_TYPO_LABELS')}
        font={settings.labelFont}
        onChange={(updates) => updateFontSettings('labelFont', updates)}
        minSize={LABELS_LEGEND_SIZE_MIN}
        maxSize={LABELS_LEGEND_SIZE_MAX}
      />
      <FontControls
        label={t('VISUALIZER_TYPO_LEGEND')}
        font={settings.legendFont}
        onChange={(updates) => updateFontSettings('legendFont', updates)}
        minSize={LABELS_LEGEND_SIZE_MIN}
        maxSize={LABELS_LEGEND_SIZE_MAX}
      />
    </div>
  );
}
