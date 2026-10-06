// 出力フォーマット(CSV/SQL/JSON/Excel)・文字コード・quote_all(CSVの値を""で囲むか)・
// json_array(JSONを配列形式にするか)を選び、
// 「ファイルに書き出す」ボタンを押すパネル。実際の生成処理はここでは行わず、
// 選んだ設定をonGenerate()経由で親(App.tsx)に伝えるだけ
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import { SQL_DIALECTS, type GenerationProgress, type OutputEncoding, type OutputFormat, type OutputSqlDialect } from "./types";

interface Props {
  format: OutputFormat;
  onFormatChange: (value: OutputFormat) => void;
  encoding: OutputEncoding;
  onEncodingChange: (value: OutputEncoding) => void;
  quoteAll: boolean;
  onQuoteAllChange: (value: boolean) => void;
  escapeDatesForExcel: boolean;
  onEscapeDatesForExcelChange: (value: boolean) => void;
  jsonArray: boolean;
  onJsonArrayChange: (value: boolean) => void;
  sqlDialect: OutputSqlDialect;
  onSqlDialectChange: (value: OutputSqlDialect) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  progressUnit?: string;
  error: string | null;
  // Excel(.xlsx)の注意書きの出し分けに使う、全テーブル合計の生成件数
  totalRows: number;
}

// Excel(.xlsx)は他形式と違い、全行を一度にメモリへ載せてから書き出す方式のため
// (dummy_data_gen側の仕様)、件数が多いと時間・メモリ消費が大きくなる。
// 実測(列数16、100万行)で生成に約78秒・メモリ約4.6GBかかったため、
// この目安を注意書きに出す基準として10万行を閾値にしている
const XLSX_LARGE_ROW_WARNING_THRESHOLD = 100_000;

const labelClass = "text-xs font-medium text-slate-500 dark:text-slate-400";

export function ExportPanel({
  format,
  onFormatChange,
  encoding,
  onEncodingChange,
  quoteAll,
  onQuoteAllChange,
  escapeDatesForExcel,
  onEscapeDatesForExcelChange,
  jsonArray,
  onJsonArrayChange,
  sqlDialect,
  onSqlDialectChange,
  onGenerate,
  isGenerating,
  progress,
  progressUnit,
  error,
  totalRows,
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
            <input type="radio" checked={format === "json"} onChange={() => onFormatChange("json")} />
            JSON
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={format === "xlsx"} onChange={() => onFormatChange("xlsx")} />
            Excel (.xlsx)
          </label>
        </div>
      </div>

      {/* "条件 && (中身)"はReactの書き方で、「条件がtrueのときだけ中身を表示する」という意味
          (falseのときは何も表示しない)。ここではformatが"csv"のときだけこの欄を表示する */}
      {format === "csv" && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={quoteAll} onChange={(e) => onQuoteAllChange(e.target.checked)} />
            値を""(ダブルクォート)で囲む
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            氏名にスペースを含むケースなど、値の区切りを明確にしたい場合にオンにしてください。
          </p>

          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={escapeDatesForExcel}
              onChange={(e) => onEscapeDatesForExcelChange(e.target.checked)}
            />
            日付をExcelに数値変換させず、文字列のまま保つ
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            このCSVをExcelでダブルクリックして開くと、日付の列が数値として誤認識され、行によって
            "####"と表示されてしまうことがあります。オンにすると日付の値の先頭に見えない印(半角の')が付き、
            Excelはそれを日付に変換しなくなります(表示上は付きません)。Excel以外のツールでこのCSVを
            読み込む場合は、その印が値の一部として残る点に注意してください。
          </p>
        </div>
      )}

      {/* SQLのときだけ、INSERT文の識別子(テーブル名・カラム名)をどのDB向けのクォート記号で
          囲むかを選ばせる(標準SQL/MySQL/PostgreSQL/SQL Server/SQLite)。csv/json/xlsxには無関係 */}
      {format === "sql" && (
        <div className="flex flex-col gap-1">
          <span className={labelClass}>SQL方言(識別子のクォート方式)</span>
          <select
            value={sqlDialect}
            onChange={(e) => onSqlDialectChange(e.target.value as OutputSqlDialect)}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 px-2 py-1.5"
          >
            {SQL_DIALECTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            MySQLはダブルクォートを識別子として受け付けないため、MySQLに流し込む場合は「MySQL」を選んでください。
          </p>
        </div>
      )}

      {/* JSONは文字コード選択を出さず、配列形式にするかのチェックと注意書きだけを出す */}
      {format === "json" && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={jsonArray} onChange={(e) => onJsonArrayChange(e.target.checked)} />
            配列形式で出力する([ ] で全体を囲む)
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {jsonArray
              ? "ファイル全体を1つのJSON配列として書き出します。ファイルをまるごと読み込むツール向けです。"
              : "1行に1件ずつJSONオブジェクトを書き出す形式(NDJSON)です。1行ずつ読み込むツール向けです。"}
            文字コードは常にUTF-8になります。全行を一度にメモリへ載せてから書き出すため、件数が多いとCSV/SQLより時間がかかります。
          </p>
        </div>
      )}

      {/* こちらは"条件 ? A : B"という三項演算子で、「xlsxならA(注意書き)、csv/sqlならB(文字コード選択)」を出し分ける(jsonは上の注意書きのみ) */}
      {format === "json" ? null : format === "xlsx" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Excel(.xlsx)はファイル自体に文字コードの概念が無いため、文字コードの指定は不要です。全行を一度にメモリへ載せてから書き出すため、CSV/SQLより時間がかかります。
          </p>
          {totalRows >= XLSX_LARGE_ROW_WARNING_THRESHOLD && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                現在の生成件数(合計{totalRows.toLocaleString()}行)はExcel出力では時間・メモリ消費が大きくなる可能性があります。目安(実測値): 100万行で生成に約1分、メモリを4〜5GB程度使用します。件数が多い場合はCSVまたはSQL形式のご利用もご検討ください。
              </span>
            </p>
          )}
        </div>
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
