import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ColumnConfig, GenerateRequest, GenerationProgress, PreviewResult } from "./types";

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

  return { pickSavePath, generate, preview, progress, isGenerating, error };
}
