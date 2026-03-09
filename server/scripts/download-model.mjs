#!/usr/bin/env node
/**
 * Download a GGUF model for local inference.
 *
 * Usage:
 *   npm run download-model                         # default: Phi-3.5-mini Q4_K_M
 *   npm run download-model -- hf:user/repo/file.gguf   # custom HuggingFace model
 *
 * The model is saved to <repo-root>/models/ and you can drop any .gguf file
 * there manually instead if you prefer.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createModelDownloader } from 'node-llama-cpp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '../../../models');

// Default: Phi-3.5-mini-instruct Q4_K_M (~2.3 GB)
// Great at instruction following and structured JSON output.
// Other good options:
//   hf:bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf  (~2 GB)
//   hf:bartowski/Qwen2.5-3B-Instruct-GGUF/Qwen2.5-3B-Instruct-Q4_K_M.gguf      (~2 GB)
//   hf:bartowski/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct-Q8_0.gguf     (~4 GB, higher quality)
const DEFAULT_URI = 'hf:bartowski/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct-Q4_K_M.gguf';

const modelUri = process.argv[2] ?? DEFAULT_URI;

console.log('');
console.log('⚡ Opus — Local Model Download');
console.log('──────────────────────────────────────────');
console.log(`Model : ${modelUri}`);
console.log(`Dest  : ${MODELS_DIR}`);
console.log('');

const downloader = await createModelDownloader({
  modelUri,
  dirPath: MODELS_DIR,
});

await downloader.download();

const modelPath = downloader.entrypointFilePath;

console.log('');
console.log('──────────────────────────────────────────');
console.log(`✓ Downloaded to: ${modelPath}`);
console.log('');
console.log('Set in your .env to use this model:');
console.log('');
console.log('  AI_PROVIDER=local');
console.log(`  LOCAL_MODEL_PATH=${modelPath}`);
console.log('');
console.log('Or just set AI_PROVIDER=local and Opus will find it automatically.');
console.log('');
