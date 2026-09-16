import { useEffect, useState } from "react";
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

// 列設定一式に名前を付けてブラウザ(localStorage)に保存・呼び出す機能(仕様書3.3)。
// 保存件数が増えると一覧がごちゃつくため、読み込み・削除はプルダウンから選ぶ形にしている
export function SavedConfigsPanel({ configs, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState("");
  const [selectedName, setSelectedName] = useState("");

  // 削除などで選択中の名前が一覧から消えたら選択状態もリセットする
  useEffect(() => {
    if (selectedName && !configs.some((c) => c.name === selectedName)) {
      setSelectedName("");
    }
  }, [configs, selectedName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onSave(trimmed);
    setName("");
  };

  const selected = configs.find((c) => c.name === selectedName);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
        <Save className="w-3.5 h-3.5" />
        設定の保存・読み込み
      </h2>
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
        <div className="flex gap-2">
          <select
            className={inputClass}
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
          >
            <option value="">保存済みの設定を選択...({configs.length}件)</option>
            {configs.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selected && onLoad(selected)}
            disabled={!selected}
            title="この設定を読み込む"
            className="flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => selected && onDelete(selected.name)}
            disabled={!selected}
            title="削除"
            className="flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
