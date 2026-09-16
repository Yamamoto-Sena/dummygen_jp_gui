import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Vite公式のreact-tsテンプレートに準拠した最小構成。tsc --noEmitでは検出できない
// 「未使用import/変数」「useEffectの依存配列漏れ」等をエディタ・CIで自動検出するため
export default tseslint.config(
  { ignores: ["dist", "src-tauri", "src-server"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // react-hooksプラグインのrecommendedは、React Compiler向けの新しい厳格なルール群を
      // 大量に含み既存の正当なコード(マウント時のlocalStorage読み込み等)を誤検知するため、
      // 定番の2ルール(hooks呼び出し順序・依存配列)だけを個別に有効化する
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
