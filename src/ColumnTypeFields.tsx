import { Plus, Trash2 } from "lucide-react";
import type { ColumnConfig, DateFormat } from "./types";

interface Props {
  column: ColumnConfig;
  onChange: (column: ColumnConfig) => void;
  // foreign_key列の「参照するテーブル」選択肢(アクティブなテーブル以外の一覧)。
  // 単一テーブルの列(foreign_key列タイプ自体を使わない場面)では渡さなくてよい
  otherTables?: { name: string; columns: ColumnConfig[] }[];
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelClass = "text-xs text-slate-500 dark:text-slate-400";

// 選択中の列タイプに応じて、min/max・choicesなどの追加設定フォームを出し分ける
export function ColumnTypeFields({ column, onChange, otherTables }: Props) {
  const set = <K extends keyof ColumnConfig>(key: K, value: ColumnConfig[K]) =>
    onChange({ ...column, [key]: value });

  switch (column.type) {
    case "name_ja":
      return (
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={column.with_space ?? false}
            onChange={(e) => set("with_space", e.target.checked)}
          />
          姓と名の間にスペースを入れる(例:山田 太郎)
        </label>
      );

    case "integer":
    case "float":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最小値</span>
            <input
              type="number"
              className={inputClass}
              value={column.min ?? 0}
              onChange={(e) => set("min", Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最大値</span>
            <input
              type="number"
              className={inputClass}
              value={column.max ?? 0}
              onChange={(e) => set("max", Number(e.target.value))}
            />
          </label>
          {column.type === "float" && (
            <label className="col-span-2 flex flex-col gap-1">
              <span className={labelClass}>小数点以下の桁数</span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={column.decimals ?? 2}
                onChange={(e) => set("decimals", Number(e.target.value))}
              />
            </label>
          )}
        </div>
      );

    case "date":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>開始日</span>
            <input
              type="date"
              className={inputClass}
              value={column.start ?? ""}
              onChange={(e) => set("start", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>終了日</span>
            <input
              type="date"
              className={inputClass}
              value={column.end ?? ""}
              onChange={(e) => set("end", e.target.value)}
            />
          </label>
          <DateFormatSelect column={column} onChange={onChange} />
        </div>
      );

    case "birth_date":
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最低年齢</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={column.min_age ?? 0}
              onChange={(e) => set("min_age", Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>最高年齢</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={column.max_age ?? 0}
              onChange={(e) => set("max_age", Number(e.target.value))}
            />
          </label>
          <DateFormatSelect column={column} onChange={onChange} />
        </div>
      );

    case "email":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>ドメイン</span>
          <input
            type="text"
            className={inputClass}
            placeholder="example.com"
            value={column.domain ?? ""}
            onChange={(e) => set("domain", e.target.value)}
          />
        </label>
      );

    case "enum": {
      const choices = column.choices ?? [];
      // 既存(重み未設定)の列とも噛み合うよう、要素数が足りない分は「重み1」で補って扱う
      const weights = choices.map((_, i) => column.weights?.[i] ?? 1);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      const setChoiceAt = (i: number, value: string) => {
        const next = [...choices];
        next[i] = value;
        set("choices", next);
      };
      const setWeightAt = (i: number, value: number) => {
        const next = [...weights];
        next[i] = value;
        set("weights", next);
      };
      const removeAt = (i: number) => {
        set("choices", choices.filter((_, idx) => idx !== i));
        set("weights", weights.filter((_, idx) => idx !== i));
      };
      const addChoice = () => {
        set("choices", [...choices, `選択肢${choices.length + 1}`]);
        set("weights", [...weights, 1]);
      };

      return (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>選択肢と出現比率</span>
          {choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                value={choice}
                onChange={(e) => setChoiceAt(i, e.target.value)}
              />
              <input
                type="number"
                min={0}
                step={0.1}
                className={`${inputClass} w-16 shrink-0 !w-16`}
                title="出現比率(重み)"
                value={weights[i]}
                onChange={(e) => setWeightAt(i, Number(e.target.value))}
              />
              <span className="w-10 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                {totalWeight > 0 ? Math.round((weights[i] / totalWeight) * 100) : 0}%
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={choices.length <= 1}
                title="この選択肢を削除"
                className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            className="flex items-center gap-1 self-start rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            選択肢を追加
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            比率をすべて同じ数にすると、今まで通り均等なランダムになります。
          </p>
        </div>
      );
    }

    case "fixed":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>固定値</span>
          <input
            type="text"
            className={inputClass}
            value={column.value ?? ""}
            onChange={(e) => set("value", e.target.value)}
          />
        </label>
      );

    case "pattern":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>パターン</span>
          <input
            type="text"
            className={`${inputClass} font-mono`}
            value={column.pattern ?? ""}
            onChange={(e) => set("pattern", e.target.value)}
            placeholder="例: [A-Z]{3}-[0-9]{4}"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            正規表現に似た記法。文字クラス<code>[A-Z]</code>・繰り返し
            <code>{"{n}"}</code>/<code>{"{n,m}"}</code>/<code>?</code>/<code>*</code>/<code>+</code>
            ・エスケープ<code>{"\\"}</code>に対応(グループ化<code>()</code>や選択<code>|</code>は非対応)。
          </p>
        </label>
      );

    case "foreign_key": {
      const tables = otherTables ?? [];
      const [refTable, refColumn] = (column.references ?? "").split(".");
      const selectedTable = tables.find((t) => t.name === refTable);
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>参照するテーブル</span>
            <select
              className={inputClass}
              value={refTable ?? ""}
              onChange={(e) => set("references", e.target.value ? `${e.target.value}.` : "")}
            >
              <option value="">選択してください</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>参照する列</span>
            <select
              className={inputClass}
              value={refColumn ?? ""}
              disabled={!selectedTable}
              onChange={(e) => set("references", `${refTable}.${e.target.value}`)}
            >
              <option value="">選択してください</option>
              {(selectedTable?.columns ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {tables.length === 0 && (
            <p className="col-span-2 text-xs text-amber-600 dark:text-amber-400">
              参照できる他のテーブルがありません。先に「テーブルを追加」してください。
            </p>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

function DateFormatSelect({ column, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>表示形式</span>
      <select
        className={inputClass}
        value={column.format ?? "ymd"}
        onChange={(e) => onChange({ ...column, format: e.target.value as DateFormat })}
      >
        <option value="ymd">YYYY-MM-DD</option>
        <option value="iso8601">ISO8601</option>
        <option value="slash">YYYY/MM/DD</option>
        <option value="wareki">和暦</option>
      </select>
    </label>
  );
}
