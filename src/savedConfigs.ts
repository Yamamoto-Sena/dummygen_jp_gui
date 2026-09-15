import type { ColumnConfig, OutputEncoding } from "./types";

// 画面の設定一式(列設定＋エクスポート設定)をまとめた型。
// 保存・復元の対象はこれだけ(進捗やプレビュー結果のような一時的な状態は含めない)
export interface AppState {
  columns: ColumnConfig[];
  rowCount: number;
  format: "csv" | "sql";
  tableName: string;
  encoding: OutputEncoding;
}

export interface SavedConfig {
  name: string;
  savedAt: string;
  state: AppState;
}

const LAST_SESSION_KEY = "dummygen_jp_last_session";
const SAVED_CONFIGS_KEY = "dummygen_jp_saved_configs";

// localStorageは、プライベートウィンドウやサイトデータのブロック等で使えない・
// 例外を投げることがあるため、必ずtry/catchで包み、失敗しても画面自体は
// 問題なく動き続けるようにする(保存・復元だけが効かなくなる)。

export function loadLastSession(): AppState | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export function saveLastSession(state: AppState): void {
  try {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても致命的ではないので無視する
  }
}

export function loadSavedConfigs(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(SAVED_CONFIGS_KEY);
    return raw ? (JSON.parse(raw) as SavedConfig[]) : [];
  } catch {
    return [];
  }
}

function persistSavedConfigs(configs: SavedConfig[]): void {
  try {
    localStorage.setItem(SAVED_CONFIGS_KEY, JSON.stringify(configs));
  } catch {
    // 保存できなくても致命的ではないので無視する
  }
}

// 同じ名前で保存済みなら上書きする
export function upsertSavedConfig(name: string, state: AppState): SavedConfig[] {
  const configs = loadSavedConfigs().filter((c) => c.name !== name);
  configs.push({ name, savedAt: new Date().toISOString(), state });
  persistSavedConfigs(configs);
  return configs;
}

export function deleteSavedConfig(name: string): SavedConfig[] {
  const configs = loadSavedConfigs().filter((c) => c.name !== name);
  persistSavedConfigs(configs);
  return configs;
}
