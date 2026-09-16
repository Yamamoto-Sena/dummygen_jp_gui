import { Loader2, Save } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import type { GenerationProgress, OutputEncoding, OutputFormat } from "./types";

interface Props {
  format: OutputFormat;
  onFormatChange: (value: OutputFormat) => void;
  encoding: OutputEncoding;
  onEncodingChange: (value: OutputEncoding) => void;
  quoteAll: boolean;
  onQuoteAllChange: (value: boolean) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  progressUnit?: string;
  error: string | null;
  // テーブルが2個以上のとき。複数テーブルの生成(dummy_data_gen側の
  // write_output_multi_table)は現状quote_all(値を""で囲むオプション)に対応していないため、
  // このときはチェックボックス自体を隠す
  isMultiTable?: boolean;
}

const labelClass = "text-xs font-medium text-slate-500 dark:text-slate-400";

export function ExportPanel({
  format,
  onFormatChange,
  encoding,
  onEncodingChange,
  quoteAll,
  onQuoteAllChange,
  onGenerate,
  isGenerating,
  progress,
  progressUnit,
  error,
  isMultiTable,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">エクスポート設定</h2>

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
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={format === "xlsx"} onChange={() => onFormatChange("xlsx")} />
            Excel (.xlsx)
          </label>
        </div>
      </div>

      {format === "csv" && !isMultiTable && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={quoteAll} onChange={(e) => onQuoteAllChange(e.target.checked)} />
            値を""(ダブルクォート)で囲む
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            氏名にスペースを含むケースなど、値の区切りを明確にしたい場合にオンにしてください。
          </p>
        </div>
      )}

      {format === "csv" && isMultiTable && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          複数テーブルの生成では、値を""で囲むオプションは今のところ使えません。
        </p>
      )}

      {format === "xlsx" ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Excel(.xlsx)はファイル自体に文字コードの概念が無いため、文字コードの指定は不要です。
        </p>
      ) : (
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
      )}

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
        <ProgressBar done={progress.done} total={progress.total} unit={progressUnit} />
      )}

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
