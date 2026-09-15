import { Plus } from "lucide-react";
import { ColumnRow } from "./ColumnRow";
import { newColumn, type ColumnConfig } from "./types";

interface Props {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
}

export function ColumnEditor({ columns, onChange }: Props) {
  const updateAt = (index: number, column: ColumnConfig) =>
    onChange(columns.map((c, i) => (i === index ? column : c)));

  const removeAt = (index: number) => onChange(columns.filter((_, i) => i !== index));

  const moveBy = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addColumn = () => onChange([...columns, newColumn(`column${columns.length + 1}`, "sequence")]);

  return (
    <div className="space-y-3">
      {columns.map((column, index) => (
        <ColumnRow
          key={index}
          column={column}
          onChange={(c) => updateAt(index, c)}
          onRemove={() => removeAt(index)}
          onMoveUp={() => moveBy(index, -1)}
          onMoveDown={() => moveBy(index, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < columns.length - 1}
        />
      ))}
      <button
        type="button"
        onClick={addColumn}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-2 text-sm text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        列を追加
      </button>
    </div>
  );
}
