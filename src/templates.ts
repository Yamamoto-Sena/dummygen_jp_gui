import { newColumn, type ColumnConfig } from "./types";

export interface Template {
  id: string;
  label: string;
  tableName: string;
  columns: ColumnConfig[];
}

// ワンクリックでカラム構成を一式セットするテンプレート(仕様書3.1「ワンクリック開発テンプレート」)。
// 選択すると、今の列設定を丸ごとこの内容で置き換える。
export const TEMPLATES: Template[] = [
  {
    id: "user_basic",
    label: "ユーザー基本情報",
    tableName: "users",
    columns: [
      newColumn("id", "sequence"),
      newColumn("name", "name_ja"),
      newColumn("kana", "katakana_name"),
      newColumn("email", "email"),
      newColumn("phone", "phone_ja"),
      { ...newColumn("registered_at", "date"), start: "2023-01-01", end: "2025-12-31" },
    ],
  },
  {
    id: "ec_order",
    label: "EC注文データ",
    tableName: "orders",
    columns: [
      newColumn("order_id", "sequence"),
      { ...newColumn("user_id", "integer"), min: 1, max: 10000 },
      { ...newColumn("product_code", "enum"), choices: ["SKU-1001", "SKU-1002", "SKU-1003", "SKU-1004", "SKU-1005"] },
      { ...newColumn("amount", "integer"), min: 500, max: 50000 },
      { ...newColumn("status", "enum"), choices: ["未処理", "処理中", "発送済み", "キャンセル"] },
      { ...newColumn("paid_at", "date"), start: "2023-01-01", end: "2025-12-31" },
    ],
  },
  {
    id: "store_location",
    label: "店舗・拠点データ",
    tableName: "stores",
    columns: [
      newColumn("store_id", "sequence"),
      newColumn("store_name", "company_name_ja"),
      newColumn("postal_code", "postal_code"),
      newColumn("prefecture", "prefecture_ja"),
      newColumn("address", "city_ja"),
      newColumn("phone", "phone_ja_landline"),
    ],
  },
];
