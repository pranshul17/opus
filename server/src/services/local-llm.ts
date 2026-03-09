import path from 'path';
import fs from 'fs';
import type { AICompleteOptions } from './ai-provider';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Default model: Phi-3.5-mini-instruct (Q4_K_M, ~2.3 GB)
 * Excellent at instruction following and structured JSON output.
 * Swap via LOCAL_MODEL_HF_URI env var or by dropping any .gguf into models/.
 */
const DEFAULT_HF_URI =
  'hf:bartowski/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct-Q4_K_M.gguf';

const MODELS_DIR = path.join(process.cwd(), 'models');

// ─── Singleton model (loaded once per process) ────────────────────────────────

let _model: any = null;
let _initPromise: Promise<any> | null = null;

/** Scan models/ for any .gguf file. Returns the path or null. */
function findLocalGguf(): string | null {
  if (!fs.existsSync(MODELS_DIR)) return null;
  const gguf = fs.readdirSync(MODELS_DIR).find(f => f.endsWith('.gguf'));
  return gguf ? path.join(MODELS_DIR, gguf) : null;
}

/**
 * Load the model (downloading it first if needed).
 * This runs once; subsequent calls return the cached instance immediately.
 */
async function getModel(): Promise<any> {
  if (_model) return _model;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // node-llama-cpp is loaded lazily so it doesn't slow down startup when the
    // local provider isn't selected.
    const { getLlama, createModelDownloader } = await import('node-llama-cpp');

    // ── 1. Resolve model path ────────────────────────────────────────────────
    let modelPath: string | null = process.env.LOCAL_MODEL_PATH ?? null;

    if (modelPath && !fs.existsSync(modelPath)) {
      throw new Error(
        `[LocalLLM] LOCAL_MODEL_PATH is set but file not found: ${modelPath}\n` +
        `Run: npm run download-model   (from the server/ directory)`
      );
    }

    if (!modelPath) {
      modelPath = findLocalGguf();
    }

    // ── 2. Auto-download if no model found ───────────────────────────────────
    if (!modelPath) {
      const hfUri = process.env.LOCAL_MODEL_HF_URI ?? DEFAULT_HF_URI;

      if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
      }

      console.log('[LocalLLM] No model found — downloading on first run.');
      console.log(`[LocalLLM] Model : ${hfUri}`);
      console.log(`[LocalLLM] Dest  : ${MODELS_DIR}`);
      console.log('[LocalLLM] Size  : ~2.3 GB — this takes a few minutes once, then never again.');
      console.log('[LocalLLM] You can skip this by setting AI_PROVIDER=anthropic and providing ANTHROPIC_API_KEY.');

      const downloader = await createModelDownloader({
        modelUri: hfUri,
        dirPath: MODELS_DIR,
      });

      await downloader.download();
      modelPath = downloader.entrypointFilePath;
      console.log(`[LocalLLM] Download complete → ${modelPath}`);
    }

    // ── 3. Load ──────────────────────────────────────────────────────────────
    console.log(`[LocalLLM] Loading model from ${modelPath}…`);
    const llama = await getLlama();
    _model = await llama.loadModel({ modelPath });
    console.log('[LocalLLM] Model ready ✓');
    return _model;
  })();

  return _initPromise;
}

// ─── Inference ────────────────────────────────────────────────────────────────

/**
 * Run a stateless completion against the local model.
 * Creates a fresh context per call (ensures no cross-request state leakage).
 */
export async function completeLocal(opts: AICompleteOptions): Promise<string> {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const model = await getModel();

  // Fresh context per request — model singleton is reused (in-memory weights)
  const context = await model.createContext({ contextSize: 4096 });
  try {
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      ...(opts.system ? { systemPrompt: opts.system } : {}),
    });

    return await session.prompt(opts.prompt, {
      maxTokens: opts.maxTokens ?? 2048,
    });
  } finally {
    await context.dispose();
  }
}
