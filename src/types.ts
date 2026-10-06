// dummy_data_gen(Rust)側の ColumnType / ColumnDef と対応する型定義。
// Rust側に列タイプを追加したときは、必ずこちらも合わせて更新すること
// (自動生成ではなく手動同期のため)。

export type DateFormat = "ymd" | "iso8601" | "slash" | "compact" | "wareki";

// 47都道府県の名前一覧(Rust側のCITIES_BY_PREFECTUREと同じ並び順=北海道→沖縄県)。
// prefecture_ja / address_ja の「都道府県を絞り込む」チェックボックス一覧の元データ。
// Rust側と同様、都道府県名が変わることは実質無いため手動で同期させている
export const PREFECTURES: string[] = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export interface ColumnTypeMeta {
  id: string;
  label: string;
  // 英語名。プルダウンでは「日本語 / English」の形で併記する
  en: string;
  group: "識別子" | "氏名" | "連絡先・住所" | "日時" | "論理値・定数" | "ビジネス" | "Web/IT" | "金融";
}

// UIのプルダウンに表示する順序・分類。Rust側のColumnType(enum)の各バリアントに対応する
export const COLUMN_TYPES: ColumnTypeMeta[] = [
  { id: "sequence", label: "連番", en: "Sequence", group: "識別子" },
  { id: "uuid", label: "UUID", en: "UUID", group: "識別子" },
  { id: "integer", label: "ランダム数値", en: "Random integer", group: "識別子" },
  { id: "name_ja", label: "氏名(フルネーム)", en: "Full name", group: "氏名" },
  { id: "last_name_ja", label: "姓(苗字)", en: "Last name", group: "氏名" },
  { id: "first_name_ja", label: "名", en: "First name", group: "氏名" },
  { id: "katakana_name", label: "フリガナ(全角)", en: "Furigana (full-width)", group: "氏名" },
  { id: "katakana_name_hankaku", label: "フリガナ(半角)", en: "Furigana (half-width)", group: "氏名" },
  { id: "katakana_last_name", label: "フリガナ(姓)", en: "Furigana (last name)", group: "氏名" },
  { id: "katakana_first_name", label: "フリガナ(名)", en: "Furigana (first name)", group: "氏名" },
  { id: "romaji_name", label: "ローマ字氏名", en: "Romaji name", group: "氏名" },
  { id: "gender", label: "性別", en: "Gender", group: "氏名" },
  { id: "blood_type", label: "血液型", en: "Blood type", group: "氏名" },
  { id: "email", label: "メールアドレス", en: "Email address", group: "連絡先・住所" },
  { id: "phone_ja", label: "携帯電話番号", en: "Mobile phone number", group: "連絡先・住所" },
  { id: "phone_ja_landline", label: "固定電話番号", en: "Landline phone number", group: "連絡先・住所" },
  { id: "postal_code", label: "郵便番号", en: "Postal code", group: "連絡先・住所" },
  { id: "prefecture_ja", label: "都道府県", en: "Prefecture", group: "連絡先・住所" },
  { id: "city_ja", label: "市区町村", en: "City / ward", group: "連絡先・住所" },
  { id: "address_ja", label: "住所(1列)", en: "Address (single column)", group: "連絡先・住所" },
  { id: "company_name_ja", label: "会社名", en: "Company name", group: "連絡先・住所" },
  { id: "date", label: "日付(範囲指定)", en: "Date (range)", group: "日時" },
  { id: "birth_date", label: "生年月日(年齢範囲指定)", en: "Birth date (age range)", group: "日時" },
  { id: "boolean", label: "Boolean", en: "Boolean", group: "論理値・定数" },
  { id: "enum", label: "カスタム選択肢", en: "Custom choices", group: "論理値・定数" },
  { id: "fixed", label: "固定値テキスト", en: "Fixed text", group: "論理値・定数" },
  { id: "pattern", label: "カスタムパターン", en: "Custom pattern", group: "論理値・定数" },
  { id: "float", label: "ランダム小数", en: "Random decimal", group: "識別子" },
  { id: "department_ja", label: "部署名", en: "Department", group: "ビジネス" },
  { id: "job_title_ja", label: "役職名", en: "Job title", group: "ビジネス" },
  { id: "ip_address", label: "IPアドレス", en: "IP address", group: "Web/IT" },
  { id: "jwt", label: "JWT", en: "JWT", group: "Web/IT" },
  { id: "api_key", label: "APIキー", en: "API key", group: "Web/IT" },
  { id: "username", label: "ユーザー名", en: "Username", group: "Web/IT" },
  { id: "password", label: "パスワード", en: "Password", group: "Web/IT" },
  { id: "profile_image_url", label: "プロフィール画像URL", en: "Profile image URL", group: "Web/IT" },
  { id: "credit_card_number", label: "クレジットカード番号", en: "Credit card number", group: "金融" },
  { id: "credit_card_expiry", label: "クレジットカード有効期限", en: "Credit card expiry", group: "金融" },
  { id: "bank_account_number", label: "銀行口座番号", en: "Bank account number", group: "金融" },
  { id: "my_number", label: "マイナンバー", en: "My Number (national ID)", group: "金融" },
  { id: "product_sku", label: "商品SKU", en: "Product SKU", group: "ビジネス" },
  { id: "correlated_number", label: "相関のある数値(売上金額など)", en: "Correlated number (e.g. sales)", group: "ビジネス" },
  { id: "tax_amount", label: "消費税額", en: "Consumption tax amount", group: "ビジネス" },
  { id: "tax_inclusive_amount", label: "税込金額", en: "Tax-inclusive amount", group: "ビジネス" },
  { id: "foreign_key", label: "外部キー(他テーブル参照)", en: "Foreign key (other table)", group: "識別子" },
];

// カラム設定欄がグレー一色で見分けづらいという声を受けて、グループ(氏名/連絡先・住所/…)ごとに
// 色分けするための対応表。ColumnRow.tsxで、カードの左端の帯とグループ名バッジの色として使う
export const GROUP_COLORS: Record<ColumnTypeMeta["group"], { border: string; badge: string }> = {
  識別子: {
    border: "border-l-indigo-400 dark:border-l-indigo-600",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  氏名: {
    border: "border-l-rose-400 dark:border-l-rose-600",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  "連絡先・住所": {
    border: "border-l-amber-400 dark:border-l-amber-600",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  日時: {
    border: "border-l-violet-400 dark:border-l-violet-600",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  "論理値・定数": {
    border: "border-l-teal-400 dark:border-l-teal-600",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  },
  ビジネス: {
    border: "border-l-blue-400 dark:border-l-blue-600",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  "Web/IT": {
    border: "border-l-emerald-400 dark:border-l-emerald-600",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  金融: {
    border: "border-l-red-400 dark:border-l-red-600",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
};

// ColumnDef(name/null_rate/unique) + ColumnType(flatten)をまとめてフラットに表現したもの。
// Rust側は`#[serde(tag = "type")]`の内部タグ付きenumなので、typeとその他のフィールドを
// 同じ階層に並べて送るとそのままデシリアライズできる。使わない型のフィールドが
// 残っていても、Rust側は無視するだけなのでエラーにはならない。
// フィールド名の後ろの"?"は「無くてもよい(オプショナル)」という意味のTypeScriptの記法で、
// min/maxのように一部の列タイプでしか使わない設定は、全部このように"?"付きにしてある
export interface ColumnConfig {
  name: string;
  type: string;
  null_rate?: number;
  unique?: boolean;
  // SQL/JSON/Excel出力時、この列の値を文字列/整数/小数/真偽値のどれとして出力するかを
  // 列タイプの自動判定から上書きする(例: "VARCHAR(100)"、"INTEGER"のような自由入力の型名)。
  // 未指定(undefined)のときは今まで通り列タイプから自動判定する。CSVには影響しない
  data_type?: string;
  // email
  domain?: string;
  // integer / float
  min?: number;
  max?: number;
  // float
  decimals?: number;
  // date
  start?: string;
  end?: string;
  // date。trueのとき「月日だけで範囲を指定する」入力モードを表示する(開始・終了で同じ年を使う)。
  // 実際に生成に使われるのは今まで通りstart/endの文字列で、このフィールドはGUIの表示切り替えにしか
  // 使わない(Rust側はこのフィールドを参照しない。未指定/falseのときは今まで通りの日付入力欄になる)
  date_shared_year?: boolean;
  // date / birth_date
  format?: DateFormat;
  // birth_date
  min_age?: number;
  max_age?: number;
  // enum。weightsを指定すると、choicesと同じ順番で出現確率に偏りをつけられる
  // (例: choices=["利用中","休止中"], weights=[7,2] → 利用中が7:2の比率で多く出る)
  choices?: string[];
  weights?: number[];
  // fixed
  value?: string;
  // name_ja / katakana_name / katakana_name_hankaku
  with_space?: boolean;
  // blood_type。未指定(undefined)のときは今まで通りtrue扱い(「A型」のように「型」を付ける)
  with_suffix?: boolean;
  // postal_code / phone_ja / phone_ja_landline。未指定(undefined)のときは今まで通りtrue扱い
  // (「123-4567」のように「-」を入れる)
  with_hyphen?: boolean;
  // credit_card_expiry。未指定(undefined)のときは今まで通りtrue扱い(「12/28」のように「/」を入れる)
  with_slash?: boolean;
  // prefecture_ja / address_ja。指定した都道府県名だけに絞り込む(例: ["東京都", "大阪府"])。
  // 未指定(undefined)のときは今まで通り47都道府県すべてが対象
  allowed_prefectures?: string[];
  // foreign_key。"テーブル名.列名"の形式(例: "users.id")
  references?: string;
  // pattern。正規表現に似た簡易パターン(例: "[A-Z]{3}-[0-9]{4}")
  pattern?: string;
  // correlated_number。掛け合わせる元になる数値列名(この列より前に定義されたinteger/float/
  // sequence/correlated_numberのみ指定可)。1つ以上必須
  base_columns?: string[];
  // correlated_number。指定した列(この列より前の任意の列)の実際の値ごとに倍率を変える。
  // category_multipliersとセットで指定する(片方だけの指定はエラーになる)
  category_column?: string;
  category_multipliers?: Record<string, number>;
  // correlated_number。指定した日付列(date/birth_date)の月ごとに倍率を変える。
  // monthly_multipliers(1〜12月の12個)とセットで指定する
  date_column?: string;
  monthly_multipliers?: number[];
  // correlated_number。最後に掛けるランダムなブレ幅(0以上。例: 0.1なら±10%)。未指定は0(ブレ無し)
  noise?: number;
  // tax_amount / tax_inclusive_amount。base_columnは税抜金額(純売上など)の列名(この列より前の
  // 数値列のみ)。tax_rateとcategory_ratesの値は「10%なら0.10」の割合で持つ(画面では%表示に変換する)。
  // category_column(上のcorrelated_number用と同名の項目)+category_ratesで区分ごと(軽減税率など)に
  // 税率を変えられ、一覧に無い値はtax_rateになる。roundingは消費税額の端数処理(未指定は切り捨て)
  base_column?: string;
  tax_rate?: number;
  category_rates?: Record<string, number>;
  rounding?: TaxRounding;
}

export type TaxRounding = "floor" | "round" | "ceil";

// dummy_data_gen側のValueCategory(SQL/JSON/Excel出力で値を文字列/整数/小数/真偽値の
// どれとして扱うか)と対応する4分類。「現在の型」表示にだけ使う
export type ValueCategory = "text" | "integer" | "float" | "boolean";

// 日本語だけだと分かりにくいという指摘を受けて英語名を併記している。括弧内の2つ目は、
// data_type欄に入力すると同じ分類として扱われる代表的なSQLの型名(dummy_data_gen側の
// classify_data_type_nameが認識する名前)
export const VALUE_CATEGORY_LABELS: Record<ValueCategory, string> = {
  text: "文字列 (String / VARCHAR)",
  integer: "整数 (Integer / INT)",
  float: "小数 (Float / DECIMAL)",
  boolean: "真偽値 (Boolean / BOOL)",
};

// data_type(データの型)が未指定の列について、dummy_data_gen側のdefault_value_categoryと
// 同じ考え方で「今は自動的にどの型として出力されるか」を判定する(ColumnRow.tsxの
// 「現在の型」表示専用。実際の判定はRust側で行われるため、これはあくまでGUI上のヒント)。
// foreign_keyは参照先の列を辿って判定し、参照先が見つからない/未接続なら安全側でtextにする
export function inferDefaultValueCategory(
  column: ColumnConfig,
  otherTables?: { name: string; columns: ColumnConfig[] }[],
  depth = 0
): ValueCategory {
  if (depth > 5) return "text"; // 循環参照など想定外の入れ子に対する安全弁
  switch (column.type) {
    case "sequence":
    case "integer":
      return "integer";
    case "float":
      return "float";
    case "boolean":
      return "boolean";
    case "correlated_number":
      return "float";
    // 消費税額は常に整数、税込金額は税抜金額の小数桁数を引き継ぐため小数(Rust側default_value_categoryと同じ)
    case "tax_amount":
      return "integer";
    case "tax_inclusive_amount":
      return "float";
    case "foreign_key": {
      const [refTable, refColumnName] = (column.references ?? "").split(".");
      const refColumn = otherTables?.find((t) => t.name === refTable)?.columns.find((c) => c.name === refColumnName);
      return refColumn ? inferDefaultValueCategory(refColumn, otherTables, depth + 1) : "text";
    }
    default:
      return "text";
  }
}

const DATA_TYPE_PRESETS_TEXT = [
  { label: "文字列 (VARCHAR(100))", value: "VARCHAR(100)" },
  { label: "文字列 (TEXT)", value: "TEXT" },
];
const DATA_TYPE_PRESETS_INTEGER = [
  { label: "整数 (INTEGER)", value: "INTEGER" },
  { label: "整数 (BIGINT)", value: "BIGINT" },
];
const DATA_TYPE_PRESETS_FLOAT = [
  { label: "小数 (DECIMAL(10,2))", value: "DECIMAL(10,2)" },
  { label: "小数 (FLOAT)", value: "FLOAT" },
];
const DATA_TYPE_PRESETS_BOOLEAN = [{ label: "真偽値 (BOOLEAN)", value: "BOOLEAN" }];

// ColumnRow.tsxの「データの型」欄で、実際にそのカラムが今生成している値の種類(category)と
// 一致する候補だけをプルダウンに出すためのヘルパー。「整数の列に文字列を入れることはできない」
// のように、そもそも噛み合わない型は選択肢自体に出さない。categoryは呼び出し側で
// inferDefaultValueCategory(...)を使って求める(「現在の型」表示と同じ判定を再利用するだけで、
// ここで判定ロジックを重複して持たない)
export function dataTypePresetsForCategory(category: ValueCategory): { label: string; value: string }[] {
  switch (category) {
    case "text":
      return DATA_TYPE_PRESETS_TEXT;
    case "integer":
      return DATA_TYPE_PRESETS_INTEGER;
    case "float":
      return DATA_TYPE_PRESETS_FLOAT;
    case "boolean":
      return DATA_TYPE_PRESETS_BOOLEAN;
  }
}

// GUI画面上の「テーブル1個分」の単位。複数テーブル対応(外部キー)のために、
// 列設定(columns)に加えてテーブル名・生成件数もここに持たせている。
// idはGUI内部でのタブ識別・React key専用で、Rust側には送らない(YAML化もしない)
export interface TableConfig {
  id: string;
  name: string;
  rowCount: number;
  columns: ColumnConfig[];
}

export function makeTableId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `table-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 複数テーブル出力時、1テーブル分として送る形(Rust側のSchemaと同じ形。
// テーブル一覧を送るときはTableConfigのid/rowCount→row_count・name→table_nameに変換する)
export interface SchemaInput {
  row_count: number;
  table_name?: string;
  columns: ColumnConfig[];
}

// import_schema_yamlの戻り値(YAMLから読み込んだテーブル一覧)
export interface SchemaFileResult {
  tables: SchemaInput[];
  multi_table: boolean;
}

// 新しい列(または型を変更した列)を作るための関数。列タイプによって必要な追加設定
// (min/max、choicesなど)が違うため、typeを見てそれぞれに合った初期値を持たせて返す。
// ColumnRow.tsxで型のプルダウンを変更したときも、この関数が呼ばれて古い列を作り直す
// (これにより、型を変えたときに前の型の設定が残ってしまうことを防いでいる)
export function newColumn(name: string, type: string): ColumnConfig {
  const base: ColumnConfig = { name, type };
  switch (type) {
    case "integer":
      return { ...base, min: 1, max: 100 };
    case "float":
      return { ...base, min: 0, max: 100, decimals: 2 };
    case "date":
      return { ...base, start: "2020-01-01", end: "2025-12-31", format: "ymd" };
    case "birth_date":
      return { ...base, min_age: 18, max_age: 65, format: "ymd" };
    case "enum":
      // weightsは意図的に未設定のまま(undefined)にしておく。choicesの個数と必ず
      // 一致させる必要があるため、実際の値はColumnTypeFields側の編集時にだけ設定する
      // (テンプレート/サンプルCSV取り込みなどchoicesを丸ごと差し替える経路と噛み合わせるため)
      return { ...base, choices: ["選択肢1", "選択肢2"] };
    case "fixed":
      return { ...base, value: "" };
    case "pattern":
      return { ...base, pattern: "[A-Z]{3}-[0-9]{4}" };
    case "email":
      return { ...base, domain: "example.com" };
    case "foreign_key":
      return { ...base, references: "" };
    case "tax_amount":
    case "tax_inclusive_amount":
      // base_columnは意図的に空のまま。前の列一覧から選んでもらう必要があるため(correlated_numberと同じ)
      return { ...base, base_column: "", tax_rate: 0.1, rounding: "floor" };
    case "correlated_number":
      // base_columnsは意図的に空のまま(undefined)にしておく。前の列一覧から選んでもらう必要があり、
      // ここでは(otherTables同様)前の列の情報を持たないため決め打ちできない
      return { ...base, decimals: 0, noise: 0 };
    default:
      return base;
  }
}

export type OutputEncoding = "utf8" | "sjis";
// xlsxは文字コード(OutputEncoding)の概念が無く(dummy_data_gen側の仕様)、常にUTF-8相当で書き出される。
// jsonはJSONの仕様上UTF-8が前提のため、画面で選ばれた文字コードに関わらず常にutf8で書き出す(App.tsx参照)
export type OutputFormat = "csv" | "sql" | "json" | "xlsx";

// SQL出力(format: "sql")で、テーブル名・カラム名を囲む識別子クォートの方式(Rust側のSqlDialectと対応)。
// standard/postgresql/sqliteはダブルクォート("name")、mysqlはバッククォート(`name`)、
// sqlserverは角カッコ([name])になる(dummy_data_gen側のsql_identを参照)
export type OutputSqlDialect = "standard" | "mysql" | "postgresql" | "sqlserver" | "sqlite";

export const SQL_DIALECTS: { value: OutputSqlDialect; label: string }[] = [
  { value: "standard", label: "標準SQL" },
  { value: "mysql", label: "MySQL" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlserver", label: "SQL Server" },
  { value: "sqlite", label: "SQLite" },
];

export interface PreviewResult {
  headers: string[];
  rows: (string | null)[][];
  // prepare_columns/prepare_tables(Rust側)がエラーにはしないが気づいた方がよい問題点
  // (例: 明らかに数値化できない列タイプにデータの型でINTEGER等を指定している等)
  warnings: string[];
}

export interface GenerateRequest {
  row_count: number;
  columns: ColumnConfig[];
  table_name?: string;
  format: OutputFormat;
  encoding: OutputEncoding;
  seed?: number;
  output_path: string;
  // trueのとき、CSV出力の全ての値をダブルクォートで囲む。SQL出力には影響しない
  quote_all: boolean;
  // trueのとき、CSV出力のdate/birth_date列の値の先頭に半角の'を付ける。Excelでこの
  // CSVをダブルクリックして開いたときに日付として誤認識され、列幅の関係で一部の行だけ
  // "####"と表示されてしまう問題を避けるためのオプション。CSV以外の形式には影響しない
  escape_dates_for_excel: boolean;
  // trueのとき、JSON出力をファイル全体で1つの配列([{...},{...}])にする。falseならNDJSON(1行1件)。JSON以外には影響しない
  json_array: boolean;
  // SQL出力の識別子クォート方式。省略時はstandard(既存のダブルクォート出力)として扱う。SQL以外には影響しない
  sql_dialect?: OutputSqlDialect;
}

export interface GenerationProgress {
  done: number;
  total: number;
}
