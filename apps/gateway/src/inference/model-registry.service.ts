import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/** Metadata for a locally available model. */
export interface LocalModelInfo {
  name: string;
  path: string;
  type: 'onnx' | 'safetensors' | 'head_json' | 'quantized' | 'checkpoint';
  sizeKb: number;
  experimental: boolean;
  validationStatus: string;
  metadata?: Record<string, unknown>;
}

/** Model availability status for health endpoint. */
export interface ModelStatus {
  available: boolean;
  activeModel: string | null;
  modelCount: number;
  models: LocalModelInfo[];
}

/**
 * Scans storage/models/ for available ML models and manages model loading priorities.
 *
 * Priority order for ONNX inference:
 *   1. biomech-encoder.onnx (contrastive encoder exported to ONNX)
 *   2. csi_pose_net.onnx (full CsiPoseNet model)
 *   3. Fall back to demo mode
 *
 * All models are EXPERIMENTAL unless metadata says otherwise.
 */
@Injectable()
export class ModelRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ModelRegistryService.name);

  private readonly modelsDir: string;
  private models: LocalModelInfo[] = [];
  private activeOnnxModel: string | null = null;

  /** ONNX model files in priority order. */
  private static readonly ONNX_PRIORITY = [
    'biomech-encoder.onnx',
    'csi_pose_net.onnx',
  ];

  constructor() {
    this.modelsDir =
      process.env.MODELS_DIR ?? path.resolve(process.cwd(), 'storage', 'models');
  }

  async onModuleInit(): Promise<void> {
    this.scanModels();
    this.resolveActiveModel();
  }

  /** Scan the models directory and catalog all found model files. */
  scanModels(): void {
    this.models = [];

    if (!fs.existsSync(this.modelsDir)) {
      this.logger.warn(`Models directory not found: ${this.modelsDir}`);
      return;
    }

    const files = this.walkDir(this.modelsDir);

    for (const filePath of files) {
      const info = this.classifyModel(filePath);
      if (info) {
        this.models.push(info);
      }
    }

    this.logger.log(
      `Model registry: found ${this.models.length} model(s) in ${this.modelsDir}`,
    );
  }

  /** Determine which ONNX model to use based on priority. */
  resolveActiveModel(): void {
    this.activeOnnxModel = null;

    for (const candidate of ModelRegistryService.ONNX_PRIORITY) {
      const found = this.models.find(
        (m) => m.type === 'onnx' && path.basename(m.path) === candidate,
      );
      if (found) {
        this.activeOnnxModel = found.path;
        this.logger.log(`Active ONNX model: ${found.name} (${found.sizeKb} KB)`);
        return;
      }
    }

    this.logger.warn('No ONNX model found — inference will use demo mode');
  }

  /** Get the path to the active ONNX model, or null if none available. */
  getActiveOnnxModelPath(): string | null {
    return this.activeOnnxModel;
  }

  /** Get full model status for health/diagnostics. */
  getStatus(): ModelStatus {
    return {
      available: this.activeOnnxModel !== null,
      activeModel: this.activeOnnxModel
        ? path.basename(this.activeOnnxModel)
        : null,
      modelCount: this.models.length,
      models: this.models,
    };
  }

  /** List all discovered models. */
  listModels(): LocalModelInfo[] {
    return [...this.models];
  }

  /** Trigger a re-scan (for hot-reload when models are updated). */
  refresh(): void {
    this.scanModels();
    this.resolveActiveModel();
    this.logger.log('Model registry refreshed');
  }

  // ── Private helpers ──────────────────────────────────────────────── //

  private classifyModel(filePath: string): LocalModelInfo | null {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const sizeKb = Math.round((stats.size / 1024) * 100) / 100;

    let type: LocalModelInfo['type'];
    if (ext === '.onnx') {
      type = 'onnx';
    } else if (ext === '.safetensors') {
      type = 'safetensors';
    } else if (ext === '.json' && (name.includes('head') || name.includes('adapter'))) {
      type = 'head_json';
    } else if (ext === '.bin') {
      type = 'quantized';
    } else if (ext === '.pt') {
      type = 'checkpoint';
    } else {
      return null; // Unknown file type — skip
    }

    const info: LocalModelInfo = {
      name,
      path: filePath,
      type,
      sizeKb,
      experimental: true,
      validationStatus: 'unvalidated',
    };

    // Try to read companion metadata
    const metaPath = filePath.replace(ext, '.meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        info.metadata = meta;
        if (typeof meta.experimental === 'boolean') {
          info.experimental = meta.experimental;
        }
        if (typeof meta.validation_status === 'string') {
          info.validationStatus = meta.validation_status;
        }
      } catch {
        // Ignore malformed metadata
      }
    }

    return info;
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.walkDir(full));
        } else if (entry.isFile()) {
          results.push(full);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to read directory ${dir}: ${err}`);
    }

    return results;
  }
}
