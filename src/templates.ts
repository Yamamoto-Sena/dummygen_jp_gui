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
      { ...newColumn("quantity", "integer"), min: 1, max: 10 },
      { ...newColumn("unit_price", "integer"), min: 500, max: 5000 },
      // correlated_number(amount)が参照するpaid_at/product_codeは、この列より前に
      // 定義しておく必要があるため、amountより前に置いている
      { ...newColumn("paid_at", "date"), start: "2023-01-01", end: "2025-12-31" },
      // amountはquantity×unit_priceを基準に、SKUごとの価格帯差(category_multipliers)と
      // 購入月による季節変動(monthly_multipliers、12月だけ売上が伸びる想定)を組み合わせて計算する
      {
        ...newColumn("amount", "correlated_number"),
        base_columns: ["quantity", "unit_price"],
        category_column: "product_code",
        category_multipliers: {
          "SKU-1001": 1.0,
          "SKU-1002": 1.5,
          "SKU-1003": 0.8,
          "SKU-1004": 2.0,
          "SKU-1005": 1.2,
        },
        date_column: "paid_at",
        monthly_multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
      },
      { ...newColumn("status", "enum"), choices: ["未処理", "処理中", "発送済み", "キャンセル"] },
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
