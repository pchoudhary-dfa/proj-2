import { createDfaChart } from './engine/standalone';
declare global {
    interface Window {
        DfaVizEmbed?: {
            createDfaChart: typeof createDfaChart;
        };
    }
}
//# sourceMappingURL=embedEntry.d.ts.map