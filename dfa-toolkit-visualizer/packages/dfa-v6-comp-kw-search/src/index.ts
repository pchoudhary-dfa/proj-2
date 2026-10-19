/**
 * dfa-v6-comp-kw-search
 * Framework-agnostic chip-based keyword search component.
 * Styling is token-driven via styles.css; uses design tokens from
 * packages/design-tokens/tokens.css when loaded by the app.
 */
import './styles.css';

export { createChipSearch } from "./createChipSearch";
export { mapDfaChipsToPayload } from "./mapDfaChipsToPayload";
export type {
  Keyword,
  DfaPayload,
  ChipSearchStrings,
  ChipSearchDetail,
  ChipSearchCallback,
  ChipSearchStyle,
  ChipSearchChipStyle,
  ChipSearchOptions,
  ChipSearchInstance,
} from "./types";
