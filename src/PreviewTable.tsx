import type { PreviewResult } from "./types";

interface Props {
  preview: PreviewResult | null;
  error: string | null;
  previewSize: number;
  onPreviewSizeChange: (value: number) => void;
  previewSizeOptions: number[];
}

// 列設定に応じた先頭数件のサンプルをその場で表示する(仕様書の「リアルタイムプレビュー」)。
// エラー時は直前の表をそのまま残さず、エラーメッセージだけを表示する
// (設定が一時的に不正な状態でも、何が悪いかひと目でわかるようにするため)
export function PreviewTable({ preview, error, previewSize, onPreviewSizeChange, previewSizeOptions }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          リアルタイムプレビュー(先頭{preview?.rows.length ?? 0}件)
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>表示件数</span>
          <select
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            value={previewSize}
            onChange={(e) => onPreviewSizeChange(Number(e.target.value))}
          >
            {previewSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}件
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          プレビューを表示できません: {error}
        </p>
      )}

      {/* prepare_columns/prepare_tables(Rust側)がエラーにはしないが気づいた方がよい問題点
          (都道府県/フリガナの列順、明らかに数値化できない列タイプへのデータの型指定など)。
          CLIならターミナルにeprintln!で表示される内容だが、GUIには表示先が無いためここに出す。
          "preview.warnings ?? []"は、再ビルド前の古いsrc-tauri/src-server(warningsフィールドが
          まだ無いバージョン)からの応答が万一届いても、ここで例外にしないための保険 */}
      {!error && preview && (preview.warnings ?? []).length > 0 && (
        <ul className="space-y-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {(preview.warnings ?? []).map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}

      {!error && preview && preview.headers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                {preview.headers.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100 dark:border-slate-800/60">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="whitespace-nowrap px-2 py-1 text-slate-700 dark:text-slate-200">
                      {cell ?? <span className="italic text-slate-400 dark:text-slate-600">NULL</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && !preview && (
        <p className="text-xs text-slate-400 dark:text-slate-500">列を設定すると、ここにサンプルが表示されます。</p>
      )}
    </div>
  );
}
