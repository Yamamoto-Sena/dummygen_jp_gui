import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ColumnConfig,
  GenerateRequest,
  GenerationProgress,
  OutputEncoding,
  PreviewResult,
  SchemaFileResult,
  SchemaInput,
} from "./types";

// Tauriとのやり取り(保存先選択・生成実行・進捗イベント購読)をコンポーネントから切り離すフック
export function useDummyGen() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
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

  const pickSavePath = useCallback(async (defaultName: string, filterName: string, extension: string) => {
    return invoke<string | null>("pick_save_path", { defaultName, filterName, extension });
  }, []);

  const generate = useCallback(async (request: GenerateRequest) => {
    setError(null);
    setIsGenerating(true);
    setProgress({ done: 0, total: request.row_count });
    try {
      await invoke("generate_dummy_data", { request });
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const preview = useCallback((columns: ColumnConfig[], sampleSize: number) => {
    return invoke<PreviewResult>("preview_dummy_data", {
      request: { columns, sample_size: sampleSize },
    });
  }, []);

  // テーブルが2個以上(外部キーで関連付けられている)ときに使う複数テーブル版。
  // 進捗はrow_count(行数)ではなく「テーブルがいくつ完了したか」の単位で届く
  // (Rust側generate_dummy_data_multiのGenerationProgress参照)
  const generateMulti = useCallback(
    async (tables: SchemaInput[], format: "csv" | "sql", encoding: OutputEncoding, outputPath: string) => {
      setError(null);
      setIsGenerating(true);
      setProgress({ done: 0, total: tables.length });
      try {
        await invoke("generate_dummy_data_multi", {
          request: { tables, format, encoding, output_path: outputPath },
        });
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
    return invoke<PreviewResult[]>("preview_dummy_data_multi", {
      request: { tables, sample_size: sampleSize },
    });
  }, []);

  // テーブル一覧をdummy_data_gen互換のschema.yamlとして保存する。
  // ダイアログでキャンセルされた場合はnullが返る(エラーではない)
  const exportSchemaYaml = useCallback((tables: SchemaInput[]) => {
    return invoke<string | null>("export_schema_yaml", { tables });
  }, []);

  // schema.yamlを開くネイティブダイアログを表示し、読み込んだテーブル一覧を返す。
  // キャンセルされた場合はnullが返る(エラーではない)
  const importSchemaYaml = useCallback(() => {
    return invoke<SchemaFileResult | null>("import_schema_yaml");
  }, []);

  return {
    pickSavePath,
    generate,
    preview,
    generateMulti,
    previewMulti,
    exportSchemaYaml,
    importSchemaYaml,
    progress,
    isGenerating,
    error,
  };
}
