import { useRef } from "react";
import { Upload } from "lucide-react";
import { newColumn, type ColumnConfig } from "./types";
import { parseCsv } from "./csvParse";

interface Props {
  columns: ColumnConfig[];
  onImport: (columns: ColumnConfig[]) => void;
}

const MAX_CHOICES_PER_COLUMN = 50;
// 「サンプル」からの候補作りが目的なので全行を見る必要はなく、巨大なCSVでも
// 一瞬で終わるよう先頭のこの件数だけデータ行を走査する
const MAX_SCANNED_ROWS = 2000;

// 日本のツールが書き出すCSVはUTF-8とは限らずShift-JIS(CP932)であることも多いため、
// まずUTF-8として厳密デコードを試み(不正なバイト列があれば例外になる)、失敗したら
// Shift-JISとして読み直す。"shift_jis"はWHATWG Encoding標準のラベルで、追加の
// ライブラリなしにブラウザ標準のTextDecoderだけで判定できる
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

// サンプルCSVを読み込み、1行目を列名、各列の値を選択肢(choices)の候補として
// カラム設定に反映する機能。読み込んだCSVの中身はブラウザのメモリ上でのみ扱い、
// 外部への送信・保存はしない
export function SampleCsvImport({ columns, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await readCsvText(file);
    const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ""));
    if (rows.length === 0) {
      window.alert("CSVを読み取れませんでした(空のファイルです)");
      return;
    }

    const [header, ...dataRows] = rows;
    const scanned = dataRows.slice(0, MAX_SCANNED_ROWS);

    const imported: ColumnConfig[] = header.map((rawName, colIndex) => {
      const seen = new Set<string>();
      const values: string[] = [];
      for (const row of scanned) {
        const value = (row[colIndex] ?? "").trim();
        if (value === "" || seen.has(value)) continue;
        seen.add(value);
        values.push(value);
        if (values.length >= MAX_CHOICES_PER_COLUMN) break;
      }
      const column = newColumn(rawName.trim() || `column${colIndex + 1}`, "enum");
      return { ...column, choices: values.length > 0 ? values : column.choices };
    });

    if (columns.length > 0) {
      const replace = window.confirm(
        "既存の列設定があります。読み込んだ内容で置き換えますか?\n(OK=置き換え / キャンセル=末尾に追加)",
      );
      onImport(replace ? imported : [...columns, ...imported]);
    } else {
      onImport(imported);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
      >
        <Upload className="w-3.5 h-3.5" />
        サンプルCSVから列・選択肢を読み込む
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
