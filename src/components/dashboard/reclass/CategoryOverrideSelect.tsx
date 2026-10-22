"use client";

import { CATEGORIES, type Category } from "@/config/categories";
import { NativeSelect } from "@/components/common/NativeSelect";
import { categoryColor } from "@/components/common/chart";
import type { EnrichedRecord } from "@/lib/analysis/derive";
import { useAnalysisStore } from "@/store/useAnalysisStore";

/** Per-record category override. Choosing the AI value clears the override. */
export function CategoryOverrideSelect({ record }: { record: EnrichedRecord }) {
  const overrideCategory = useAnalysisStore((s) => s.overrideCategory);
  const aiCategory = record.cls?.category;
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: categoryColor(record.category) }} aria-hidden />
      <NativeSelect
        aria-label={`Category for record ${record.sourceSheet} row ${record.sourceRow}`}
        value={record.category}
        onChange={(e) => overrideCategory(record.id, e.target.value === aiCategory ? null : (e.target.value as Category))}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
            {c === aiCategory ? " (AI)" : ""}
          </option>
        ))}
      </NativeSelect>
      {record.categorySource === "override" && (
        <span className="text-[10px] font-semibold text-[var(--accent-brand)]" title="Manually overridden">
          EDITED
        </span>
      )}
    </div>
  );
}
