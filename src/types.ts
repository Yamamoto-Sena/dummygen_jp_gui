// dummy_data_gen(Rust)側の ColumnType / ColumnDef と対応する型定義。
// Rust側に列タイプを追加したときは、必ずこちらも合わせて更新すること
// (自動生成ではなく手動同期のため)。

export type DateFormat = "ymd" | "iso8601" | "slash" | "wareki";

export interface ColumnTypeMeta {
  id: string;
  label: string;
  group: "識別子" | "氏名" | "連絡先・住所" | "日時" | "論理値・定数" | "ビジネス" | "Web/IT" | "金融";
}

// UIのプルダウンに表示する順序・分類。Rust側のColumnType(enum)の各バリアントに対応する
export const COLUMN_TYPES: ColumnTypeMeta[] = [
  { id: "sequence", label: "連番", group: "識別子" },
  { id: "uuid", label: "UUID", group: "識別子" },
  { id: "integer", label: "ランダム数値", group: "識別子" },
  { id: "name_ja", label: "氏名(フルネーム)", group: "氏名" },
  { id: "last_name_ja", label: "姓(苗字)", group: "氏名" },
  { id: "first_name_ja", label: "名", group: "氏名" },
  { id: "katakana_name", label: "フリガナ(全角)", group: "氏名" },
  { id: "katakana_name_hankaku", label: "フリガナ(半角)", group: "氏名" },
  { id: "katakana_last_name", label: "フリガナ(姓)", group: "氏名" },
  { id: "katakana_first_name", label: "フリガナ(名)", group: "氏名" },
  { id: "romaji_name", label: "ローマ字氏名", group: "氏名" },
  { id: "gender", label: "性別", group: "氏名" },
  { id: "blood_type", label: "血液型", group: "氏名" },
  { id: "email", label: "メールアドレス", group: "連絡先・住所" },
  { id: "phone_ja", label: "携帯電話番号", group: "連絡先・住所" },
  { id: "phone_ja_landline", label: "固定電話番号", group: "連絡先・住所" },
  { id: "postal_code", label: "郵便番号", group: "連絡先・住所" },
  { id: "prefecture_ja", label: "都道府県", group: "連絡先・住所" },
  { id: "city_ja", label: "市区町村", group: "連絡先・住所" },
  { id: "address_ja", label: "住所(1列)", group: "連絡先・住所" },
  { id: "company_name_ja", label: "会社名", group: "連絡先・住所" },
  { id: "date", label: "日付(範囲指定)", group: "日時" },
  { id: "birth_date", label: "生年月日(年齢範囲指定)", group: "日時" },
  { id: "boolean", label: "Boolean", group: "論理値・定数" },
  { id: "enum", label: "カスタム選択肢", group: "論理値・定数" },
  { id: "fixed", label: "固定値テキスト", group: "論理値・定数" },
  { id: "pattern", label: "カスタムパターン", group: "論理値・定数" },
  { id: "float", label: "ランダム小数", group: "識別子" },
  { id: "department_ja", label: "部署名", group: "ビジネス" },
  { id: "job_title_ja", label: "役職名", group: "ビジネス" },
  { id: "ip_address", label: "IPアドレス", group: "Web/IT" },
  { id: "jwt", label: "JWT", group: "Web/IT" },
  { id: "api_key", label: "APIキー", group: "Web/IT" },
  { id: "username", label: "ユーザー名", group: "Web/IT" },
  { id: "password", label: "パスワード", group: "Web/IT" },
  { id: "profile_image_url", label: "プロフィール画像URL", group: "Web/IT" },
  { id: "credit_card_number", label: "クレジットカード番号", group: "金融" },
  { id: "credit_card_expiry", label: "クレジットカード有効期限", group: "金融" },
  { id: "bank_account_number", label: "銀行口座番号", group: "金融" },
  { id: "my_number", label: "マイナンバー", group: "金融" },
  { id: "product_sku", label: "商品SKU", group: "ビジネス" },
  { id: "foreign_key", label: "外部キー(他テーブル参照)", group: "識別子" },
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
  // name_ja
  with_space?: boolean;
  // foreign_key。"テーブル名.列名"の形式(例: "users.id")
  references?: string;
  // pattern。正規表現に似た簡易パターン(例: "[A-Z]{3}-[0-9]{4}")
  pattern?: string;
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
    default:
      return base;
  }
}

export type OutputEncoding = "utf8" | "sjis";
// xlsxは文字コード(OutputEncoding)の概念が無く(dummy_data_gen側の仕様)、常にUTF-8相当で書き出される
export type OutputFormat = "csv" | "sql" | "xlsx";

export interface PreviewResult {
  headers: string[];
  rows: (string | null)[][];
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
}

export interface GenerationProgress {
  done: number;
  total: number;
}
