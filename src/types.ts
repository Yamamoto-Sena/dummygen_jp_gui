// dummy_data_gen(Rust)側の ColumnType / ColumnDef と対応する型定義。
// Rust側に列タイプを追加したときは、必ずこちらも合わせて更新すること
// (自動生成ではなく手動同期のため)。

export type DateFormat = "ymd" | "iso8601" | "slash";

export interface ColumnTypeMeta {
  id: string;
  label: string;
  group: "識別子" | "氏名" | "連絡先・住所" | "日時" | "論理値・定数";
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
  { id: "float", label: "ランダム小数", group: "識別子" },
];

// ColumnDef(name/null_rate/unique) + ColumnType(flatten)をまとめてフラットに表現したもの。
// Rust側は`#[serde(tag = "type")]`の内部タグ付きenumなので、typeとその他のフィールドを
// 同じ階層に並べて送るとそのままデシリアライズできる。使わない型のフィールドが
// 残っていても、Rust側は無視するだけなのでエラーにはならない。
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
  // enum
  choices?: string[];
  // fixed
  value?: string;
}

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
      return { ...base, choices: ["選択肢1", "選択肢2"] };
    case "fixed":
      return { ...base, value: "" };
    case "email":
      return { ...base, domain: "example.com" };
    default:
      return base;
  }
}

export type OutputEncoding = "utf8" | "sjis";

export interface PreviewResult {
  headers: string[];
  rows: (string | null)[][];
}

export interface GenerateRequest {
  row_count: number;
  columns: ColumnConfig[];
  table_name?: string;
  format: "csv" | "sql";
  encoding: OutputEncoding;
  seed?: number;
  output_path: string;
}

export interface GenerationProgress {
  done: number;
  total: number;
}
