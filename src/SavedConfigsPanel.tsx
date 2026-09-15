import { useState } from "react";
import { Save, Trash2, Upload } from "lucide-react";
import type { SavedConfig } from "./savedConfigs";

interface Props {
  configs: SavedConfig[];
  onSave: (name: string) => void;
  onLoad: (config: SavedConfig) => void;
  onDelete: (name: string) => void;
}

const inputClass =
  "flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";

// 列設定一式に名前を付けてブラウザ(localStorage)に保存・呼び出す機能(仕様書3.3)
export function SavedConfigsPanel({ configs, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onSave(trimmed);
    setName("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
      <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300">設定の保存・読み込み</h2>
      <div className="flex gap-2">
        <input
          type="text"
          className={inputClass}
          placeholder="設定の名前(例: EC注文データ用)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={name.trim() === ""}
          className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 disabled:opacity-40 transition cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          保存
        </button>
      </div>

      {configs.length > 0 && (
        <ul className="space-y-1">
          {configs.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1 text-xs"
            >
              <span className="truncate text-slate-700 dark:text-slate-200">{c.name}</span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onLoad(c)}
                  title="この設定を読み込む"
                  className="flex items-center justify-center rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.name)}
                  title="削除"
                  className="flex items-center justify-center rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
