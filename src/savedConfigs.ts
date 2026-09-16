import { makeTableId, type ColumnConfig, type OutputEncoding, type OutputFormat, type TableConfig } from "./types";

// 画面の設定一式(テーブル一覧＋エクスポート設定)をまとめた型。
// 保存・復元の対象はこれだけ(進捗やプレビュー結果のような一時的な状態は含めない)
export interface AppState {
  tables: TableConfig[];
  format: OutputFormat;
  encoding: OutputEncoding;
  quoteAll: boolean;
}

// 複数テーブル対応前の保存形式(テーブルは常に1個、tables配列ではなく
// columns/rowCount/tableNameを直接持っていた)。読み込み時にAppStateへ自動変換する
interface LegacyAppState {
  columns: ColumnConfig[];
  rowCount: number;
  format: OutputFormat;
  tableName: string;
  encoding: OutputEncoding;
  quoteAll?: boolean;
}

export interface SavedConfig {
  name: string;
  savedAt: string;
  state: AppState;
}

const LAST_SESSION_KEY = "dummygen_jp_last_session";
const SAVED_CONFIGS_KEY = "dummygen_jp_saved_configs";

// 保存されていたデータが新形式(tablesを持つ)ならそのまま、旧形式(columnsを直接持つ、
// テーブル1個だけの形式)ならAppStateへ変換する。どちらでもなければnull(壊れたデータ扱い)。
// 引数がunknown型(「型が不明な値」を表すTypeScriptの型)なのは、localStorageから
// 読み出した直後のJSONは中身が保証されていない(誰かが手で書き換えているかもしれない)ため。
// "as 型"は「この値をその型として扱ってよい」とTypeScriptに伝えるキャストで、
// 実行時のチェック(Array.isArray等)と組み合わせて安全性を確保している
function migrateAppState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.tables)) {
    return obj as unknown as AppState;
  }

  if (Array.isArray(obj.columns)) {
    const legacy = obj as unknown as LegacyAppState;
    return {
      tables: [
        {
          id: makeTableId(),
          name: legacy.tableName || "table1",
          rowCount: legacy.rowCount,
          columns: legacy.columns,
        },
      ],
      format: legacy.format,
      encoding: legacy.encoding,
      quoteAll: legacy.quoteAll ?? false,
    };
  }

  return null;
}

// localStorageは、プライベートウィンドウやサイトデータのブロック等で使えない・
// 例外を投げることがあるため、必ずtry/catchで包み、失敗しても画面自体は
// 問題なく動き続けるようにする(保存・復元だけが効かなくなる)。

export function loadLastSession(): AppState | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    return raw ? migrateAppState(JSON.parse(raw)) : null;
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
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { name: string; savedAt: string; state: unknown }[];
    const migrated: SavedConfig[] = [];
    for (const c of parsed) {
      const state = migrateAppState(c.state);
      if (state) migrated.push({ name: c.name, savedAt: c.savedAt, state });
    }
    return migrated;
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
