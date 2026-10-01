/** Natija foizining rangi — oddiy testdagi 5/4/3 chegaralariga mos. */
export const scoreClass = (score: number) =>
    score >= 86
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : score >= 56
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'bg-destructive/10 text-destructive';
