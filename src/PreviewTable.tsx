import type { PreviewResult } from "./types";

interface Props {
  preview: PreviewResult | null;
  error: string | null;
}

// 列設定に応じた先頭数件のサンプルをその場で表示する(仕様書の「リアルタイムプレビュー」)。
// エラー時は直前の表をそのまま残さず、エラーメッセージだけを表示する
// (設定が一時的に不正な状態でも、何が悪いかひと目でわかるようにするため)
export function PreviewTable({ preview, error }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        リアルタイムプレビュー(先頭{preview?.rows.length ?? 0}件)
      </h2>

      {error && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          プレビューを表示できません: {error}
        </p>
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
