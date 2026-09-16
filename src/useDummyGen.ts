import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { downloadBlob, isTauriRuntime } from "./runtimeEnv";
import type {
  ColumnConfig,
  GenerateRequest,
  GenerationProgress,
  OutputEncoding,
  OutputFormat,
  PreviewResult,
  SchemaFileResult,
  SchemaInput,
} from "./types";

// src-server(ブラウザ版のHTTPサーバー)はエラー時に`{"error": "メッセージ"}`という
// JSONを返す(README.md「エラー形式」参照)。JSONとして読めない場合はテキストのまま使う
// (万一サーバー以外の何か、例えばプロキシのエラーページ等が返ってきた場合の保険)
async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  } catch {
    // JSONではなかった。textをそのまま使う
  }
  return text;
}

// ブラウザ版(src-serverのHTTPサーバー)のAPIを呼び、失敗時はTauri版と同じように
// エラーメッセージの文字列でreject(エラーを投げる)する
async function apiPost(path: string, body: unknown): Promise<Response> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
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

  // useCallbackは「この関数を、依存する値([]の中身)が変わらない限り毎回作り直さない」
  // ようにするReactの仕組み(パフォーマンス最適化のため。[]が空なので、この関数は最初の
  // 1回だけ作られてずっと使い回される)。
  // try/catch/finallyは「tryの中を実行し、エラーが起きたらcatchで受け止め、
  // 成功しても失敗しても最後にfinallyを必ず実行する」というJavaScript標準の構文。
  // ここではfinallyでsetIsGenerating(false)を呼ぶことで、成功時もエラー時も
  // 必ず「生成中」の状態を解除している
  const generate = useCallback(async (request: GenerateRequest) => {
    setError(null);
    setIsGenerating(true);
    setProgress({ done: 0, total: request.row_count });
    try {
      if (isTauriRuntime()) {
        await invoke("generate_dummy_data", { request });
      } else {
        // ブラウザではファイルの中身をレスポンスとして受け取り、ダウンロードさせる。
        // output_pathはTauri版と違い実在のパスではなく、ダウンロード時のファイル名の候補として扱う。
        // "const { output_path, ...rest } = request;"は分割代入とレスト構文の組み合わせで、
        // 「output_pathだけを取り出し、残り全部(...rest)を別のオブジェクトにまとめる」という書き方。
        // 次の行の"{ ...rest, file_name: output_path }"は、その残り全部をコピーしつつ
        // file_nameという新しい名前でoutput_pathの値を追加している
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
    async (
      tables: SchemaInput[],
      format: OutputFormat,
      encoding: OutputEncoding,
      outputPath: string,
      quoteAll: boolean,
    ) => {
      setError(null);
      setIsGenerating(true);
      setProgress({ done: 0, total: tables.length });
      try {
        if (isTauriRuntime()) {
          await invoke("generate_dummy_data_multi", {
            request: { tables, format, encoding, output_path: outputPath, quote_all: quoteAll },
          });
        } else {
          const res = await apiPost("/api/generate_multi", { tables, format, encoding, quote_all: quoteAll });
          const blob = await res.blob();
          const fallbackName = format === "sql" ? "output.sql" : format === "xlsx" ? "output.xlsx" : "output.zip";
          downloadBlob(blob, fileNameFromResponse(res, fallbackName));
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
    if (!res.ok) throw new Error(await readApiError(res));
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
