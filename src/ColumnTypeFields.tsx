import type { ColumnConfig, DateFormat } from "./types";

interface Props {
  column: ColumnConfig;
  onChange: (column: ColumnConfig) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelClass = "text-xs text-slate-500 dark:text-slate-400";

// 選択中の列タイプに応じて、min/max・choicesなどの追加設定フォームを出し分ける
export function ColumnTypeFields({ column, onChange }: Props) {
  const set = <K extends keyof ColumnConfig>(key: K, value: ColumnConfig[K]) =>
    onChange({ ...column, [key]: value });

  switch (column.type) {
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

    case "enum":
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>選択肢(カンマ区切り)</span>
          <input
            type="text"
            className={inputClass}
            placeholder="利用中,休止中,退会済み"
            value={(column.choices ?? []).join(",")}
            onChange={(e) =>
              set(
                "choices",
                e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
              )
            }
          />
        </label>
      );

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
      </select>
    </label>
  );
}
