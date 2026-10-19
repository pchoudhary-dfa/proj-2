/**
 * Structured Insights Renderer
 * Parses and renders AI insights in both structured JSON and markdown formats
 * Uses pure Tailwind CSS for styling
 */

import React from 'react';
import './insightsMarkdown.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StructuredResponse {
  sections: Section[];
}

export type Section =
  | HeaderSection
  | SectionDividerSection
  | CardsSection
  | StatGridSection
  | KeyValueListSection
  | RankingSection
  | TableSection
  | NarrativeSection;

interface BaseSection {
  type: string;
  title?: string;
}

interface HeaderSection extends BaseSection {
  type: 'header';
  title: string;
  subtitle?: string;
  badge?: string;
  badge_sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface SectionDividerSection extends BaseSection {
  type: 'section_divider';
  label: string;
}

interface CardsSection extends BaseSection {
  type: 'cards';
  items: CardItem[];
}

interface CardItem {
  label: string;
  value: string;
  sub_value?: string;
  entity?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface StatGridSection extends BaseSection {
  type: 'stat_grid';
  items: StatItem[];
}

interface StatItem {
  label: string;
  value: string;
  entity?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface KeyValueListSection extends BaseSection {
  type: 'key_value_list';
  title?: string;
  items: KeyValueItem[];
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface KeyValueItem {
  key?: string;
  value: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface RankingSection extends BaseSection {
  type: 'ranking';
  metric_label?: string;
  items: RankingItem[];
}

interface RankingItem {
  rank: string | number;
  name: string;
  value: string | number;
}

interface TableSection extends BaseSection {
  type: 'table';
  columns: string[];
  rows: (string | number)[][];
  highlight?: {
    highest_row?: number;
    lowest_row?: number;
  };
  color_dots?: string[];
  sort_by?: string;
  footer_legend?: boolean;
}

interface NarrativeSection extends BaseSection {
  type: 'narrative';
  content: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders trend arrow based on cell value
 */
function trendArrow(cell: string): React.ReactElement | null {
  if (cell === 'Increasing') return <span className="inline-block text-sm leading-none align-middle text-success">↑</span>;
  if (cell === 'Decreasing') return <span className="inline-block text-sm leading-none align-middle text-error">↓</span>;
  if (cell === 'Stable') return <span className="inline-block text-sm leading-none align-middle text-warning">→</span>;
  return null;
}

/**
 * Gets CSS class for table cell based on value prefix
 */
function getValueClass(cell: string): string {
  if (/^\+/.test(cell)) return 'text-success';
  if (/^-/.test(cell) && cell !== '-' && cell !== '--') return 'text-error';
  return '';
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Tries to parse LLM response as structured JSON.
 * Returns parsed object if valid, null otherwise (signals fallback to markdown).
 */
export function parseStructuredResponse(text: string): StructuredResponse | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.charAt(0) !== '{') return null;
  
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return parsed as StructuredResponse;
    }
  } catch (e) {
    // Not valid JSON
  }
  
  return null;
}

/**
 * Converts markdown string to sanitized HTML
 */
export function markdownToHtml(md: string): string {
  if (!md || typeof md !== 'string') return '';
  
  // Configure marked options
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
  
  const rawHtml = marked.parse(md) as string;
  
  // Sanitize with DOMPurify (only works in browser)
  if (typeof window !== 'undefined' && typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(rawHtml);
  }
  
  return rawHtml;
}

// ============================================================================
// REACT COMPONENTS FOR EACH SECTION TYPE
// ============================================================================

/**
 * 1. Header - Title bar with optional badge
 */
function InsightsHeader({ section }: { section: HeaderSection }) {
  let badgeClass = 'inline-block text-[11px] font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap shrink-0 mt-0.5 leading-snug ';
  switch (section.badge_sentiment) {
    case 'positive': badgeClass += 'bg-green-50 text-success'; break;
    case 'negative': badgeClass += 'bg-red-50 text-error'; break;
    case 'mixed': badgeClass += 'bg-amber-50 text-warning'; break;
    default: badgeClass += 'bg-gray-100 text-text-muted'; break;
  }
  
  return (
    <div className="flex justify-between items-start gap-2.5 px-4 py-3.5 border-b border-border">
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-text m-0 leading-snug">{section.title}</div>
        {section.subtitle && (
          <div className="text-xs text-text-muted mt-1 leading-snug">{section.subtitle}</div>
        )}
      </div>
      {section.badge && (
        <span className={badgeClass}>{section.badge}</span>
      )}
    </div>
  );
}

/**
 * 2. Section Divider - Separator with label
 */
function InsightsSectionDivider({ section }: { section: SectionDividerSection }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border pt-2.5 pb-1 mt-1.5 mb-2.5">
      {section.label}
    </div>
  );
}

/**
 * 3. Cards - 1-2 headline value cards
 */
function InsightsCards({ section }: { section: CardsSection }) {
  if (!section.items || section.items.length === 0) return null;
  
  return (
    <div className="flex flex-col sm:flex-row gap-2.5 mb-2.5">
      {section.items.map((item, idx) => {
        let cardClass = 'flex-1 border rounded-md px-3 py-2.5 min-w-0 ';
        let valueClass = 'text-[18px] font-bold mb-0.5 leading-tight break-words ';
        let subValueClass = 'text-xs font-semibold my-px leading-snug ';

        switch (item.sentiment) {
          case 'positive':
            cardClass += 'border-green-200 bg-green-50';
            valueClass += 'text-success';
            subValueClass += 'text-success';
            break;
          case 'negative':
            cardClass += 'border-red-200 bg-red-50';
            valueClass += 'text-error';
            subValueClass += 'text-error';
            break;
          default:
            cardClass += 'border-border bg-surface';
            valueClass += 'text-text';
            subValueClass += 'text-text-muted';
            break;
        }
        
        return (
          <div key={idx} className={cardClass}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1 leading-snug">
              {item.label}
            </div>
            <div className={valueClass}>{item.value}</div>
            {item.sub_value && (
              <div className={subValueClass}>{item.sub_value}</div>
            )}
            {item.entity && (
              <div className="text-xs text-text-muted m-0 leading-snug">{item.entity}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 4. Stat Grid - 2-6 summary metrics in grid
 */
function InsightsStatGrid({ section }: { section: StatGridSection }) {
  if (!section.items || section.items.length === 0) return null;
  
  const gridClass = (section.items.length === 3 || section.items.length === 6)
    ? 'grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2.5'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5';
  
  return (
    <div className={gridClass}>
      {section.items.map((item, idx) => {
        let cellClass = 'border border-border rounded-md px-3 py-2.5 border-l-[3px] rtl:border-l-0 rtl:border-r-[3px] bg-surface ';
        switch (item.sentiment) {
          case 'positive': cellClass += 'border-l-success rtl:border-r-success'; break;
          case 'negative': cellClass += 'border-l-error rtl:border-r-error'; break;
          default: cellClass += 'border-l-primary rtl:border-r-primary'; break;
        }
        
        return (
          <div key={idx} className={cellClass}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1 leading-snug">
              {item.label}
            </div>
            <div className="text-lg font-bold text-text m-0 leading-tight break-words">{item.value}</div>
            {item.entity && (
              <div className="text-[11px] text-text-muted mt-0.5 leading-snug">{item.entity}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 5. Key-Value List - Left-right aligned pairs
 */
function InsightsKeyValueList({ section }: { section: KeyValueListSection }) {
  if (!section.items || section.items.length === 0) return null;
  
  let kvlClass = 'border-l-[3px] rtl:border-l-0 rtl:border-r-[3px] px-3 py-2 mb-2 ';
  switch (section.sentiment) {
    case 'positive': kvlClass += 'border-l-success rtl:border-r-success'; break;
    case 'negative': kvlClass += 'border-l-error rtl:border-r-error'; break;
    default: kvlClass += 'border-l-primary rtl:border-r-primary'; break;
  }
  
  return (
    <div className={kvlClass}>
      {section.title && (
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1 leading-snug">
          {section.title}
        </div>
      )}
      {section.items.map((item, idx) => {
        let valClass = 'text-[13px] font-semibold text-right rtl:text-left ';
        switch (item.sentiment) {
          case 'positive': valClass += 'text-success'; break;
          case 'negative': valClass += 'text-error'; break;
          default: valClass += 'text-text'; break;
        }
        
        return (
          <div key={idx} className="flex justify-between items-baseline py-0.5 gap-3">
            {item.key && <span className="text-[13px] text-text-muted shrink-0">{item.key}</span>}
            <span className={valClass}>{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 6. Ranking - Ranked list with progress bars
 */
function InsightsRanking({ section }: { section: RankingSection }) {
  if (!section.items || section.items.length === 0) return null;
  
  // Calculate max value for bar width percentage
  let maxVal = 0;
  for (const item of section.items) {
    const v = parseFloat(String(item.value));
    if (!isNaN(v) && v > maxVal) maxVal = v;
  }
  if (maxVal === 0) maxVal = 1;
  
  return (
    <div className="mb-1">
      {section.metric_label && (
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted flex justify-between px-1 pb-1.5 border-b border-border mb-1">
          <span>Rank</span>
          <span>{section.metric_label}</span>
        </div>
      )}
      {section.items.map((item, idx) => {
        const numVal = parseFloat(String(item.value));
        const pct = !isNaN(numVal) ? Math.round((numVal / maxVal) * 100) : 0;
        
        return (
          <div key={idx} className="flex items-center py-1.5 px-1 border-b border-surface-muted last:border-b-0">
            <div className="w-5 text-xs font-bold text-text-muted text-left rtl:text-right shrink-0">{item.rank}</div>
            <div className="flex-1 text-[13px] font-semibold text-text px-2.5 pl-1 rtl:pl-2.5 rtl:pr-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {item.name}
            </div>
            <div className="shrink-0 basis-[60px] sm:basis-[140px] h-2 bg-surface-muted rounded-full overflow-hidden mr-2.5 rtl:mr-0 rtl:ml-2.5">
              <div className="h-full rounded-full bg-primary transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-16 text-[13px] font-semibold text-text text-right rtl:text-left shrink-0">{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 7. Table - Data table with highlighting
 */
type InsightsTranslateFn = (code: string, fallback?: string) => string;

function InsightsTable({
  section,
  t,
}: {
  section: TableSection;
  t: InsightsTranslateFn;
}) {
  if (!section.columns || !section.rows) return null;
  
  const highlight = section.highlight || {};
  const highIdx = highlight.highest_row ?? -1;
  const lowIdx = highlight.lowest_row ?? -1;
  const colorDots = section.color_dots || null;
  
  return (
    <div className="overflow-x-auto mb-0 border-t border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {section.columns.map((col, idx) => (
              <th key={idx} className="sticky top-0 z-10 bg-surface-muted text-[10px] font-semibold uppercase tracking-wide text-text-muted px-2.5 py-2 text-left rtl:text-right border-b border-border whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, rIdx) => {
            let rowClass = '';
            if (rIdx === highIdx) {
              rowClass = 'bg-green-50 font-bold';
            } else if (rIdx === lowIdx) {
              rowClass = 'bg-red-50';
            }
            
            return (
              <tr key={rIdx} className={rowClass}>
                {Array.isArray(row) && row.map((cell, cIdx) => {
                  const cellStr = String(cell != null ? cell : '');
                  const arrow = trendArrow(cellStr);
                  
                  if (arrow) {
                    return <td key={cIdx} className="px-2.5 py-[7px] border-b border-surface-muted text-text align-middle">{arrow}</td>;
                  }
                  
                  const tdClass = `px-2.5 py-[7px] border-b border-surface-muted align-middle ${getValueClass(cellStr)} ${rIdx === highIdx && cIdx === 1 ? 'font-bold' : ''}`;
                  
                  // Add color dot to first cell if available
                  const cellContent = cIdx === 0 && colorDots && colorDots[rIdx] ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 rtl:mr-0 rtl:ml-1.5 align-middle shrink-0" style={{ background: colorDots[rIdx] }} />
                      {cellStr}
                    </>
                  ) : cellStr;
                  
                  return (
                    <td key={cIdx} className={tdClass}>
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Footer */}
      <div className="text-[10px] text-text-muted italic px-2.5 py-1.5 border-t border-border bg-surface-muted/50 flex justify-between items-center">
        <span className="flex-1">
          {section.sort_by
            ? `${t("INSIGHTS_TABLE_SORTED_BY_PREFIX").replace("{sortBy}", String(section.sort_by))}${
                section.rows.length === 1
                  ? t("INSIGHTS_TABLE_ONE_ROW")
                  : t("INSIGHTS_TABLE_MANY_ROWS").replace("{n}", String(section.rows.length))
              }`
            : section.rows.length === 1
              ? t("INSIGHTS_TABLE_ONE_ROW")
              : t("INSIGHTS_TABLE_MANY_ROWS").replace("{n}", String(section.rows.length))}
        </span>
        {section.footer_legend && (
          <span className="flex gap-3 items-center not-italic">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0 bg-green-200" />
              {t("HIGHEST")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0 bg-red-200" />
              {t("LOWEST")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 8. Narrative - Markdown prose content
 */
function InsightsNarrative({ section }: { section: NarrativeSection }) {
  if (!section.content) return null;
  
  return (
    <div
      className="insights-markdown py-1.5"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(section.content) }}
    />
  );
}

// ============================================================================
// LOADER COMPONENT
// ============================================================================

/**
 * Animated loader with pulsing bars and shimmer skeleton
 * Displayed while AI is generating insights
 */
export function InsightsLoader({ analyzingLabel }: { analyzingLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
      <div className="flex items-end gap-[3px] h-7">
        <span className="block w-1 h-2.5 rounded-sm bg-primary animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}></span>
        <span className="block w-1 h-5 rounded-sm bg-primary animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.15s' }}></span>
        <span className="block w-1 h-3.5 rounded-sm bg-primary animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }}></span>
        <span className="block w-1 h-6 rounded-sm bg-primary animate-[pulse_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.45s' }}></span>
      </div>
      <div className="text-sm font-medium text-text-muted tracking-wide flex items-center">
        {analyzingLabel}
        <span className="inline-flex overflow-hidden w-4 ml-0.5 rtl:ml-0 rtl:mr-0.5">
          <span className="animate-[ping_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}>.</span>
          <span className="animate-[ping_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }}>.</span>
          <span className="animate-[ping_1.4s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }}>.</span>
        </span>
      </div>
      <div className="w-full max-w-[320px] flex flex-col gap-2.5 mt-2">
        <div className="h-2.5 rounded-full bg-surface-muted animate-pulse w-full"></div>
        <div className="h-2.5 rounded-full bg-surface-muted animate-pulse w-3/4"></div>
        <div className="h-2.5 rounded-full bg-surface-muted animate-pulse w-1/2"></div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Renders structured JSON response into React components
 */
export function renderStructuredContent(
  parsed: StructuredResponse,
  t: InsightsTranslateFn
): React.ReactElement[] {
  if (!parsed || !Array.isArray(parsed.sections)) return [];
  
  const components: React.ReactElement[] = [];
  
  parsed.sections.forEach((section, idx) => {
    if (!section || !section.type) return;
    
    let sectionContent: React.ReactElement | null = null;
    
    switch (section.type) {
      case 'header':
        sectionContent = <InsightsHeader key={idx} section={section as HeaderSection} />;
        // Header doesn't need wrapper
        components.push(sectionContent);
        return;
      
      case 'section_divider':
        sectionContent = <InsightsSectionDivider key={idx} section={section as SectionDividerSection} />;
        break;
      
      case 'cards':
        sectionContent = <InsightsCards key={idx} section={section as CardsSection} />;
        break;
      
      case 'stat_grid':
        sectionContent = <InsightsStatGrid key={idx} section={section as StatGridSection} />;
        break;
      
      case 'key_value_list':
        sectionContent = <InsightsKeyValueList key={idx} section={section as KeyValueListSection} />;
        break;
      
      case 'ranking':
        sectionContent = <InsightsRanking key={idx} section={section as RankingSection} />;
        break;
      
      case 'table':
        sectionContent = (
          <InsightsTable key={idx} section={section as TableSection} t={t} />
        );
        break;
      
      case 'narrative':
        sectionContent = <InsightsNarrative key={idx} section={section as NarrativeSection} />;
        break;
      
      default:
        return; // Unknown type, skip
    }
    
    if (!sectionContent) return;
    
    // Wrap sections in si-section div
    const shouldShowTitle = section.title && 
      section.type !== 'narrative' && 
      section.type !== 'section_divider' && 
      section.type !== 'key_value_list';
    
    components.push(
      <div key={idx} className="mb-0 px-4">
        {shouldShowTitle && (
          <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted m-0 mb-2 p-0">{section.title}</div>
        )}
        {sectionContent}
      </div>
    );
  });
  
  return components;
}
