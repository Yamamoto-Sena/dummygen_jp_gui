// 1テーブル分のカラム(列)一覧を編集する画面。列の追加・削除・複製・上下移動・
// ドラッグ&ドロップでの並べ替えをここで扱い、実際の1列分の入力フォーム(型ごとの
// 追加設定・NULL率・unique等)はColumnRowに委譲する
import { useState } from "react";
import { Plus } from "lucide-react";
import { ColumnRow } from "./ColumnRow";
import { newColumn, type ColumnConfig } from "./types";

interface Props {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
  otherTables?: { name: string; columns: ColumnConfig[] }[];
}

export function ColumnEditor({ columns, onChange, otherTables }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const updateAt = (index: number, column: ColumnConfig) =>
    onChange(columns.map((c, i) => (i === index ? column : c)));

  const removeAt = (index: number) => onChange(columns.filter((_, i) => i !== index));

  const duplicateAt = (index: number) => {
    const next = [...columns];
    next.splice(index + 1, 0, { ...columns[index] });
    onChange(next);
  };

  const moveBy = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  // ドラッグ中の列(fromIndex)を、ドラッグ先(toIndex)の位置まで動かす(ColumnRowのドラッグ&ドロップから呼ばれる)
  const moveTo = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
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
          onDuplicate={() => duplicateAt(index)}
          onMoveUp={() => moveBy(index, -1)}
          onMoveDown={() => moveBy(index, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < columns.length - 1}
          isDragging={dragIndex === index}
          onDragStart={() => setDragIndex(index)}
          onDragOver={() => {
            if (dragIndex !== null && dragIndex !== index) moveTo(dragIndex, index);
            if (dragIndex !== null) setDragIndex(index);
          }}
          onDragEnd={() => setDragIndex(null)}
          otherTables={otherTables}
          // correlated_number列が「この列より前の列」だけを参照できるようにするための一覧
          // (prefecture_ja→city_jaと同じ「参照される側が前」というRust側の制約に合わせてある)
          precedingColumns={columns.slice(0, index)}
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
