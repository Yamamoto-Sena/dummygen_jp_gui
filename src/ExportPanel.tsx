import { Loader2, Save } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import type { GenerationProgress, OutputEncoding } from "./types";

interface Props {
  rowCount: number;
  onRowCountChange: (value: number) => void;
  format: "csv" | "sql";
  onFormatChange: (value: "csv" | "sql") => void;
  tableName: string;
  onTableNameChange: (value: string) => void;
  encoding: OutputEncoding;
  onEncodingChange: (value: OutputEncoding) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  error: string | null;
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelClass = "text-xs font-medium text-slate-500 dark:text-slate-400";

export function ExportPanel({
  rowCount,
  onRowCountChange,
  format,
  onFormatChange,
  tableName,
  onTableNameChange,
  encoding,
  onEncodingChange,
  onGenerate,
  isGenerating,
  progress,
  error,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">エクスポート設定</h2>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>生成件数(10〜1,000,000)</span>
        <input
          type="number"
          min={10}
          max={1_000_000}
          className={inputClass}
          value={rowCount}
          onChange={(e) => onRowCountChange(Number(e.target.value))}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>出力フォーマット</span>
        <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={format === "csv"} onChange={() => onFormatChange("csv")} />
            CSV
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={format === "sql"} onChange={() => onFormatChange("sql")} />
            SQL (INSERT)
          </label>
        </div>
      </div>

      {format === "sql" && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>テーブル名</span>
          <input
            type="text"
            className={inputClass}
            placeholder="users"
            value={tableName}
            onChange={(e) => onTableNameChange(e.target.value)}
          />
        </label>
      )}

      <div className="flex flex-col gap-1">
        <span className={labelClass}>文字コード</span>
        <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={encoding === "utf8"} onChange={() => onEncodingChange("utf8")} />
            UTF-8
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={encoding === "sjis"} onChange={() => onEncodingChange("sjis")} />
            Shift-JIS
          </label>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Excel等で開いたときに文字化けする場合はShift-JISを選んでください。
        </p>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:hover:bg-cyan-600 text-white text-sm font-medium py-2.5 transition cursor-pointer"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        ファイルに書き出す
      </button>

      {progress && (isGenerating || progress.done === progress.total) && (
        <ProgressBar done={progress.done} total={progress.total} />
      )}

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
