import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { COLUMN_TYPES, GROUP_COLORS, newColumn, type ColumnConfig } from "./types";
import { ColumnTypeFields } from "./ColumnTypeFields";

interface Props {
  column: ColumnConfig;
  onChange: (column: ColumnConfig) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  otherTables?: { name: string; columns: ColumnConfig[] }[];
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const iconButtonClass =
  "flex items-center justify-center rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer";

const GROUPS = [...new Set(COLUMN_TYPES.map((t) => t.group))];

export function ColumnRow({
  column,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  otherTables,
}: Props) {
  const group = COLUMN_TYPES.find((t) => t.id === column.type)?.group;
  const colors = group ? GROUP_COLORS[group] : undefined;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      className={`rounded-lg border border-slate-200 dark:border-slate-800 ${colors ? `border-l-4 ${colors.border}` : ""} bg-white dark:bg-slate-900/60 p-3 space-y-3 transition ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="shrink-0 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500"
          title="ドラッグで並べ替え"
        >
          <GripVertical className="w-4 h-4" />
        </span>
        {group && colors && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${colors.badge}`}
            title={`カテゴリ: ${group}`}
          >
            {group}
          </span>
        )}
        <input
          type="text"
          className={`${inputClass} flex-1`}
          placeholder="列名"
          value={column.name}
          onChange={(e) => onChange({ ...column, name: e.target.value })}
        />
        <select
          className={`${inputClass} w-48 shrink-0 !w-48`}
          value={column.type}
          onChange={(e) => onChange(newColumn(column.name, e.target.value))}
        >
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {COLUMN_TYPES.filter((t) => t.group === group).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className={iconButtonClass} onClick={onMoveUp} disabled={!canMoveUp} title="上へ">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onMoveDown} disabled={!canMoveDown} title="下へ">
          <ChevronDown className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onDuplicate} title="複製">
          <Copy className="w-4 h-4" />
        </button>
        <button type="button" className={iconButtonClass} onClick={onRemove} title="削除">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <ColumnTypeFields column={column} onChange={onChange} otherTables={otherTables} />

      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <label className="flex items-center gap-1.5">
          <span>NULL率</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            className={`${inputClass} w-20 shrink-0 !w-20`}
            value={column.null_rate ?? 0}
            onChange={(e) => onChange({ ...column, null_rate: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={column.unique ?? false}
            onChange={(e) => onChange({ ...column, unique: e.target.checked })}
          />
          <span>重複しない値にする</span>
        </label>
      </div>
    </div>
  );
}
