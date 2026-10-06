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

// 列名(ヘッダー)の文字列だけから、対応する列タイプを推測するための対応表。
// 上から順に調べ、最初に一致したものを採用する(「電話」より前に「固定電話」を
// 置く、といった具合に、より具体的なキーワードを先に置く必要がある)。
// ここでの判定はヘッダーの文字列だけを見ており、実際のセルの値は一切見ない
// (値を見て推測する方式だと、本物の顧客データの中身をこのツールが「見た」ことに
// なってしまうため、ヘッダー名だけで判断できる範囲にとどめている)。
// 一致した列は、その型のnewColumn(...)が用意する既定値(date列の既定の日付範囲、
// birth_date列の既定の年齢範囲など)をそのまま使う。実データの値は使わないため、
// 既定値が実際のデータの分布と合うとは限らない(その場合は生成後に手で調整する想定)
const HEADER_TYPE_RULES: { keywords?: string[]; suffixes?: string[]; type: string }[] = [
  { keywords: ["フリガナ", "ふりがな", "カナ", "kana"], type: "katakana_name" },
  { keywords: ["固定電話", "landline"], type: "phone_ja_landline" },
  { keywords: ["携帯", "電話", "tel", "phone", "mobile"], type: "phone_ja" },
  { keywords: ["郵便番号", "郵便", "zip", "postal"], type: "postal_code" },
  { keywords: ["都道府県", "prefecture"], type: "prefecture_ja" },
  { keywords: ["市区町村", "市町村", "city"], type: "city_ja" },
  { keywords: ["住所", "address"], type: "address_ja" },
  { keywords: ["メール", "mail", "email"], type: "email" },
  { keywords: ["会社名", "企業名", "法人名", "勤務先", "company"], type: "company_name_ja" },
  { keywords: ["部署", "部門", "department"], type: "department_ja" },
  { keywords: ["役職", "肩書", "job title", "position"], type: "job_title_ja" },
  { keywords: ["生年月日", "誕生日", "birthday", "birth date", "birth_date"], type: "birth_date" },
  { keywords: ["血液型", "blood type"], type: "blood_type" },
  { keywords: ["性別", "gender", "sex"], type: "gender" },
  // "名前"は日本語では「フルネーム」の意味で使われることが多いため、first_name(名のみ)
  // ではなくname_ja(フルネーム)に寄せている
  { keywords: ["氏名", "フルネーム", "full name", "名前"], type: "name_ja" },
  { keywords: ["姓", "苗字", "名字", "last name", "surname"], type: "last_name_ja" },
  // 英語ヘッダーに限定しているのは、日本語の「名」は「氏名」等の一部としても
  // 出現しやすく単独のキーワードにすると誤判定しやすいため
  { keywords: ["first name", "given name", "firstname"], type: "first_name_ja" },
  { keywords: ["日付", "date"], type: "date" },
  // 「学習日」「登録日」「訪問日」のように、日本語では日付を表す列名の末尾が「日」に
  // なることが非常に多い(逆に「日」で終わって日付以外を表す列名はほぼ無い)。個別の
  // キーワードを列挙しきるより、末尾一致で広く拾った方が漏れが少ない。
  // 英語ヘッダーでも"paid_at"/"created_at"/"updated_at"のように日時系の列名が
  // "_at"で終わる慣習が一般的なため、同様に末尾一致で拾う("_at"は"date"という
  // 文字列を含まないため、上のkeywords一致だけでは拾えない)
  { suffixes: ["日", "_at"], type: "date" },
  { keywords: ["会員番号", "注文番号", "伝票番号", "番号", "no."], type: "sequence" },
];

// ヘッダー名(列名)の文字列だけを見て、上のHEADER_TYPE_RULESに一致する列タイプが
// あればそのidを返す。無ければnull(呼び出し側がマスキングされたenumにフォールバックする)
function detectColumnTypeFromHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  if (normalized === "") return null;
  for (const rule of HEADER_TYPE_RULES) {
    const matches =
      rule.keywords?.some((keyword) => normalized.includes(keyword.toLowerCase())) ||
      rule.suffixes?.some((suffix) => normalized.endsWith(suffix.toLowerCase()));
    if (matches) return rule.type;
  }
  return null;
}

// 整数・小数だけで構成された列かどうかを判定する結果
type NumericColumnShape =
  | { kind: "integer"; min: number; max: number }
  | { kind: "float"; min: number; max: number; decimals: number };

// "123"や"-4.5"のような、符号+数字+小数点だけの文字列かどうか(桁区切りのカンマや
// 通貨記号が入っているものは対象外。そういう値は後述の「ほとんど数字」判定でのみ無視される)
const PLAIN_NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

// 実データの列は、集計行(「合計」等)や空欄代わりの記号("-"等)が数件だけ混ざっていることが
// よくある。1件でも数字以外があれば列全体を文字列のマスキングenumに倒してしまうと、実際には
// user_idのような普通の整数列まで巻き添えで文字列化されてしまう。そこで「大部分(9割以上)が
// 数字なら整数/小数の列とみなし、数字でない少数の値だけ無視する」という多数決の判定にする
const NUMERIC_SHAPE_MIN_MATCH_RATIO = 0.9;

// 日付形式の判定結果。startDate/endDateはColumnConfig.start/end用で、常に"YYYY-MM-DD"
// 形式(dummy_data_gen側がこの形式でのみstart/endをパースするため。formatはCSV等への
// 出力時の見た目だけを切り替える値で、start/endの保存形式には影響しない)
type DateColumnShape = { format: "ymd" | "slash"; start: string; end: string };

// "2024-03-04"や"2024/03/04"のような、ゼロ埋め4桁年+2桁月+2桁日の文字列かどうか
// (実在する日付かどうか=うるう年や月末日の妥当性までは見ない。サンプルCSVの列タイプ
// 推定という用途では、形式が日付らしいかどうかだけで十分なため)
const YMD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;

// detectNumericColumnShapeと同じ考え方の多数決判定(集計行等のノイズを無視する)
const DATE_SHAPE_MIN_MATCH_RATIO = 0.9;

// ヘッダー名からは判断できなかった列について、値の大部分が"YYYY-MM-DD"または
// "YYYY/MM/DD"の形をしているかを見て、date列として復元する("paid_at"のように
// 日付系の列名が"日付"/"date"/"_at"のどれにも一致しないケースを、値の形式から
// 補って救うため)。ゼロ埋めされた年月日の文字列は辞書順ソート=時系列順と一致するため、
// 文字列のまま並べ替えるだけでmin/max(開始日・終了日)を求められる
function detectDateColumnShape(values: string[]): DateColumnShape | null {
  if (values.length === 0) return null;

  const ymdMatched = values.filter((v) => YMD_DATE_PATTERN.test(v));
  if (ymdMatched.length / values.length >= DATE_SHAPE_MIN_MATCH_RATIO) {
    const sorted = [...ymdMatched].sort();
    return { format: "ymd", start: sorted[0], end: sorted[sorted.length - 1] };
  }

  const slashMatched = values.filter((v) => SLASH_DATE_PATTERN.test(v));
  if (slashMatched.length / values.length >= DATE_SHAPE_MIN_MATCH_RATIO) {
    const sorted = [...slashMatched].sort();
    const toYmd = (v: string) => v.replace(/\//g, "-");
    return { format: "slash", start: toYmd(sorted[0]), end: toYmd(sorted[sorted.length - 1]) };
  }

  return null;
}

// ヘッダー名だけでは列タイプを判断できなかった列について、実際の値の大部分が数字だけの
// 形をしているかを見て、整数/小数の列として復元する(「金額」「数量」のようにヘッダーの
// キーワードには無いが明らかに数値の列を、文字列のマスキングenumに落としてしまわない
// ようにするため)。数字でない値がNUMERIC_SHAPE_MIN_MATCH_RATIO未満しか無ければ、
// それらは集計行等のノイズとみなして無視し、数字だった値だけでmin/maxを計算する。
// 数字でない値が多すぎる(9割未満しか数字でない)場合はnull(呼び出し側がマスキングされた
// enumにフォールバックする)。
// ここでは実際の値の中身を見るが、個々の値そのものはColumnConfigに一切残さない。
// 使うのは「最小値・最大値の範囲」「小数点以下の最大桁数」という集計結果だけで、これは
// 個人の識別につながる情報ではない(ちょうど手書きのschema.yamlでintegerのmin/maxを
// 指定するのと同じ抽象度の情報)
function detectNumericColumnShape(values: string[]): NumericColumnShape | null {
  if (values.length === 0) return null;

  let isFloat = false;
  let maxDecimals = 0;
  const numbers: number[] = [];
  for (const value of values) {
    if (!PLAIN_NUMBER_PATTERN.test(value)) continue; // 数字以外の値は(集計行等のノイズとして)読み飛ばす
    numbers.push(Number(value));
    const dotIndex = value.indexOf(".");
    if (dotIndex !== -1) {
      isFloat = true;
      maxDecimals = Math.max(maxDecimals, value.length - dotIndex - 1);
    }
  }
  if (numbers.length === 0 || numbers.length / values.length < NUMERIC_SHAPE_MIN_MATCH_RATIO) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return isFloat ? { kind: "float", min, max, decimals: maxDecimals } : { kind: "integer", min, max };
}

// サンプルCSVを読み込み、1行目(ヘッダー)からできるだけ適切な列タイプへ自動変換する機能。
// 読み込んだCSVの中身はブラウザのメモリ上でのみ扱い、外部への送信・保存はしない。
// マスキング: 本物の顧客データ等が入ったCSVを取り込むケースを考慮し、実際のセルの
// 値そのものは選択肢や固定範囲に一切残さない。列タイプは次の優先順で決める。
//   1. ヘッダーの文字列だけで判断できるもの(詳しくはHEADER_TYPE_RULES/
//      detectColumnTypeFromHeaderのコメントを参照。実際の値は一切見ない)
//   2. ヘッダーからは判断できないが、値の大部分(9割以上)が"YYYY-MM-DD"/"YYYY/MM/DD"の
//      形をしているもの(detectDateColumnShape。"paid_at"のように列名からは日付と
//      判断できない列を値の形式から補う。使うのは開始日・終了日という集計結果だけ)
//   3. ヘッダーからも日付形式からも判断できないが、値の大部分(9割以上)が数字の形を
//      しているもの(detectNumericColumnShape。「金額」「数量」「user_id」のような列が、
//      合計行や空欄代わりの記号がごく一部混ざっただけでマスキングにより文字列化され、
//      元が数値だったという情報が失われてしまうのを防ぐ。使うのは最小値・最大値・
//      小数桁数という集計結果だけ)
//   4. どれでもない列は、フォールバックとして「値の種類数」だけを数え、"A_1"/"A_2"/...
//      という仮の値に置き換えたenum(カスタム選択肢)にする(実データが3種類あれば
//      ["A_1","A_2","A_3"]になる)
export function SampleCsvImport({ columns, onImport }: Props) {
  // useRef(null)は「画面が再描画されても値を覚えておける入れ物」を作るReactの仕組みで、
  // ここでは実際の<input type="file">のDOM要素(画面上の部品そのもの)への参照を保持する。
  // ボタンを押したときにfileInputRef.current?.click()でこの隠れた<input>を
  // プログラムからクリックしたことにする、という使い方をする(下のreturn部分を参照)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await readCsvText(file);
    // 完全に空の行(1列だけで中身も空文字)を除外する。!(...)は「条件を反転する」ので、
    // 「1列だけかつ空文字、ではない行だけを残す」という意味になる
    const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ""));
    if (rows.length === 0) {
      window.alert("CSVを読み取れませんでした(空のファイルです)");
      return;
    }

    // "const [header, ...dataRows] = rows;"は配列の分割代入とレスト構文の組み合わせで、
    // 「先頭の1行をheaderとして取り出し、残り全部をdataRowsという配列にまとめる」という意味
    // (CSVの1行目は列名の行なので、データ行と分けて扱う)
    const [header, ...dataRows] = rows;
    const scanned = dataRows.slice(0, MAX_SCANNED_ROWS);

    // header(列名の一覧)を1つずつ処理して、対応するColumnConfigの一覧を作る
    const imported: ColumnConfig[] = header.map((rawName, colIndex) => {
      const name = rawName.trim() || `column${colIndex + 1}`;

      // まずヘッダーの文字列だけで列タイプを推測する。一致すれば、その列タイプの
      // newColumn(...)が用意する既定値をそのまま使う(実データの値は一切見ない)
      const detectedType = detectColumnTypeFromHeader(rawName);
      if (detectedType) {
        return newColumn(name, detectedType);
      }

      // この列の、空でない値だけを集めておく(以降の数値判定・マスキングの両方で使う)
      const values: string[] = [];
      for (const row of scanned) {
        const value = (row[colIndex] ?? "").trim();
        if (value !== "") values.push(value);
      }

      // ヘッダーからは判断できなかったが、値の大部分が"YYYY-MM-DD"/"YYYY/MM/DD"の形を
      // していればdate列として復元する(paid_atのように列名からは日付と判断できない
      // ケースを値の形式から補う。数値判定より先に試すのは、スラッシュ・ハイフンを含む
      // 日付文字列は後述のPLAIN_NUMBER_PATTERNには元々一致しないため実害は無いが、
      // 将来compact("20240304")のような区切り無し形式を対応させる際に数値列へ
      // 誤って吸われないようにするため)
      const dateShape = detectDateColumnShape(values);
      if (dateShape) {
        return { ...newColumn(name, "date"), start: dateShape.start, end: dateShape.end, format: dateShape.format };
      }

      // ヘッダーからは判断できなかったが、値が全て数字の形をしていれば整数/小数の列として
      // 復元する(「金額」「数量」のようにヘッダーのキーワードに無い数値列が、次のenum
      // マスキングで文字列化されてしまい「元は数値だった」という情報が失われるのを防ぐ)
      const numericShape = detectNumericColumnShape(values);
      if (numericShape) {
        const column = newColumn(name, numericShape.kind);
        return numericShape.kind === "integer"
          ? { ...column, min: numericShape.min, max: numericShape.max }
          : { ...column, min: numericShape.min, max: numericShape.max, decimals: numericShape.decimals };
      }

      // 数値でもなければ、フォールバックとして「値の種類数」だけを数えたマスキング済み
      // enumにする。Set<string>は「同じ値を2回以上持てない」集合で、ここでは重複を除いた
      // 種類数を数えるためだけに使う(中身の値自体はchoicesに一切含めない)
      const distinctCount = Math.min(new Set(values).size, MAX_CHOICES_PER_COLUMN);
      const column = newColumn(name, "enum");
      // 実データの値そのものではなく、見つかった値の種類数ぶんだけ"A_1"/"A_2"/...という
      // 仮の選択肢を作る(マスキング)。1つも見つからなければ(空列だった場合)newColumnが
      // 用意したデフォルトの選択肢のままにする
      const maskedChoices = Array.from({ length: distinctCount }, (_, i) => `A_${i + 1}`);
      return { ...column, choices: distinctCount > 0 ? maskedChoices : column.choices };
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
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        <Upload className="w-3.5 h-3.5" />
        サンプルCSVから読み込む
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          サンプルCSVから列を自動判定して読み込む
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
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
列名(氏名・メールアドレス・住所など)から列タイプを自動判定します。判定できなかった列のうち、値の9割以上が"YYYY-MM-DD"等の日付形式の列は開始日・終了日を保った日付として、9割以上が数字の列は範囲(最小値・最大値)を保った整数/小数として(いずれも合計行等ごく一部の例外は無視します)、それ以外は「値の種類数」だけを読み取ってA_1/A_2/...という仮の値に置き換えます。いずれもセルの値そのものは一切使いません
      </p>
    </div>
  );
}
