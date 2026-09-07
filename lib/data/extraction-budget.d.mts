// Tipurile pentru extraction-budget.mjs. Vezi comentariul din capul acelui
// fisier pentru motivul pentru care valorile traiesc in JavaScript simplu.

/** Peste cate linii se aplica bugetul lung. */
export declare const EXTRACTION_LINE_THRESHOLD: number;

/** Bugetul extragerii peste prag, in milisecunde. */
export declare const EXTRACTION_BUDGET_ABOVE_MS: number;

/** Bugetul extragerii sub prag, in milisecunde. */
export declare const EXTRACTION_BUDGET_BELOW_MS: number;

/** Cat asteptam confirmarea lui Make ca a primit lucrarea, in milisecunde. */
export declare const ACK_TIMEOUT_MS: number;

/**
 * Cat timp are extragerea pentru un document cu `lineCount` linii.
 * `null` inseamna "nu se stie", si atunci se intoarce bugetul LUNG.
 */
export declare function extractionBudgetMs(lineCount: number | null): number;
