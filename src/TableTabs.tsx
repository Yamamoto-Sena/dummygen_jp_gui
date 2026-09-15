import { Plus, X } from "lucide-react";
import type { TableConfig } from "./types";

interface Props {
  tables: TableConfig[];
  activeTableId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

// テーブルの一覧をタブのように表示する。今まで通り1テーブルだけで使う場合も、
// 「テーブルが1個だけの状態」として同じ画面構成で扱う(仕様: 常にテーブルの一覧として表示する)
export function TableTabs({ tables, activeTableId, onSelect, onAdd, onRemove, onRename }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tables.map((t) => {
        const active = t.id === activeTableId;
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs cursor-pointer transition ${
              active
                ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300"
                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-cyan-500"
            }`}
          >
            <input
              type="text"
              value={t.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRename(t.id, e.target.value)}
              className="w-24 bg-transparent focus:outline-none"
              placeholder="テーブル名"
            />
            {tables.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(t.id);
                }}
                title="このテーブルを削除"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        テーブルを追加
      </button>
    </div>
  );
}
