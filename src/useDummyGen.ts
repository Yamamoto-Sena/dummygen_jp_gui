import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { downloadBlob, isTauriRuntime } from "./runtimeEnv";
import type {
  ColumnConfig,
  GenerateRequest,
  GenerationProgress,
  OutputEncoding,
  PreviewResult,
  SchemaFileResult,
  SchemaInput,
} from "./types";

// ブラウザ版(src-serverのHTTPサーバー)のAPIを呼び、失敗時はTauri版と同じように
// エラーメッセージの文字列でreject(エラーを投げる)する
async function apiPost(path: string, body: unknown): Promise<Response> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// レスポンスのContent-Dispositionヘッダーからダウンロード時のファイル名を取り出す。
// 取れなければ呼び出し側が指定したデフォルト名を使う
function fileNameFromResponse(res: Response, fallback: string): string {
  const header = res.headers.get("content-disposition") ?? "";
  const match = header.match(/filename="?([^"]+)"?/);
  return match ? match[1] : fallback;
}

// Tauriとのやり取り(保存先選択・生成実行・進捗イベント購読)をコンポーネントから切り離すフック。
// ブラウザ(Tauriアプリの外)で動いているときは、同じ関数の中でsrc-serverのHTTP APIを
// 呼ぶように分岐する(呼び出し側のApp.tsxは分岐を意識しなくてよい)
export function useDummyGen() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // ブラウザ(src-server経由)にはTauriの進捗イベントが無いため、Tauri実行時のみ購読する。
    // 購読しないと@tauri-apps/api/eventのlisten()がwindow.__TAURI_INTERNALS__を
    // 参照できず、呼び出すたびに例外(Unhandled rejection)になる
    if (!isTauriRuntime()) return;

    let disposed = false;
    listen<GenerationProgress>("generation:progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });
    return () => {
      disposed = true;
      unlistenRef.current?.();
    };
  }, []);

  // ブラウザではネイティブの保存先ダイアログが無いため、選ばせずにdefaultNameを
  // そのまま返す(実際の保存先はブラウザの「ダウンロード」機能に任せる)
  const pickSavePath = useCallback(async (defaultName: string, filterName: string, extension: string) => {
    if (!isTauriRuntime()) return defaultName;
    return invoke<string | null>("pick_save_path", { defaultName, filterName, extension });
  }, []);

  const generate = useCallback(async (request: GenerateRequest) => {
    setError(null);
    setIsGenerating(true);
    setProgress({ done: 0, total: request.row_count });
    try {
      if (isTauriRuntime()) {
        await invoke("generate_dummy_data", { request });
      } else {
        // ブラウザではファイルの中身をレスポンスとして受け取り、ダウンロードさせる。
        // output_pathはTauri版と違い実在のパスではなく、ダウンロード時のファイル名の候補として扱う
        const { output_path, ...rest } = request;
        const res = await apiPost("/api/generate", { ...rest, file_name: output_path });
        const blob = await res.blob();
        downloadBlob(blob, fileNameFromResponse(res, output_path));
      }
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const preview = useCallback((columns: ColumnConfig[], sampleSize: number) => {
    if (!isTauriRuntime()) {
      return apiPost("/api/preview", { columns, sample_size: sampleSize }).then((res) => res.json());
    }
    return invoke<PreviewResult>("preview_dummy_data", {
      request: { columns, sample_size: sampleSize },
    });
  }, []);

  // テーブルが2個以上(外部キーで関連付けられている)ときに使う複数テーブル版。
  // 進捗はrow_count(行数)ではなく「テーブルがいくつ完了したか」の単位で届く
  // (Rust側generate_dummy_data_multiのGenerationProgress参照。ブラウザでは進捗イベントを
  // 購読できないため、進捗バーは出さずスピナー表示のみになる)
  const generateMulti = useCallback(
    async (tables: SchemaInput[], format: "csv" | "sql", encoding: OutputEncoding, outputPath: string) => {
      setError(null);
      setIsGenerating(true);
      setProgress({ done: 0, total: tables.length });
      try {
        if (isTauriRuntime()) {
          await invoke("generate_dummy_data_multi", {
            request: { tables, format, encoding, output_path: outputPath },
          });
        } else {
          const res = await apiPost("/api/generate_multi", { tables, format, encoding });
          const blob = await res.blob();
          downloadBlob(blob, fileNameFromResponse(res, format === "sql" ? "output.sql" : "output.zip"));
        }
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const previewMulti = useCallback((tables: SchemaInput[], sampleSize: number) => {
    if (!isTauriRuntime()) {
      return apiPost("/api/preview_multi", { tables, sample_size: sampleSize }).then((res) => res.json());
    }
    return invoke<PreviewResult[]>("preview_dummy_data_multi", {
      request: { tables, sample_size: sampleSize },
    });
  }, []);

  // テーブル一覧をdummy_data_gen互換のschema.yamlとして保存する。
  // Tauriではダイアログでキャンセルされた場合にnullが返る(エラーではない)。
  // ブラウザではキャンセルという概念が無いため、常にダウンロードして"schema.yaml"を返す
  const exportSchemaYaml = useCallback(async (tables: SchemaInput[]) => {
    if (!isTauriRuntime()) {
      const res = await apiPost("/api/export_schema_yaml", { tables });
      const text = await res.text();
      downloadBlob(new Blob([text], { type: "application/x-yaml" }), "schema.yaml");
      return "schema.yaml";
    }
    return invoke<string | null>("export_schema_yaml", { tables });
  }, []);

  // schema.yamlを開くネイティブダイアログを表示し、読み込んだテーブル一覧を返す(Tauri専用)。
  // キャンセルされた場合はnullが返る(エラーではない)。ブラウザではこの関数は使わない
  const importSchemaYaml = useCallback(() => {
    return invoke<SchemaFileResult | null>("import_schema_yaml");
  }, []);

  // ブラウザ専用: <input type="file">で選ばれたschema.yamlファイルの中身を読み、
  // サーバーにテキストのまま送って解析してもらう
  const importSchemaYamlFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const res = await fetch("/api/import_schema_yaml", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<SchemaFileResult>;
  }, []);

  return {
    pickSavePath,
    generate,
    preview,
    generateMulti,
    previewMulti,
    exportSchemaYaml,
    importSchemaYaml,
    importSchemaYamlFromFile,
    progress,
    isGenerating,
    error,
  };
}
