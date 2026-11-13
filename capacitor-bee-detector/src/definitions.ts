export interface BeeDetectorStatus {
  bridgeAvailable: boolean;
  bridgeVersion: string;
  runtimeAvailable: boolean;
  modelAvailable: boolean;
  inferenceAvailable: boolean;
  status: 'unavailable' | 'ready';
  reason?: string;
}

export interface BeeDetectorResult {
  status: 'unavailable' | 'ok' | 'partial';
  reason?: string;
  detections?: Array<{
    className: 'bee' | 'wasp' | 'drone' | 'unknown';
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
  }>;
}

export interface BeeDetectorPlugin {
  getStatus(): Promise<BeeDetectorStatus>;
  detectFrame(options: { framePath: string }): Promise<BeeDetectorResult>;
}
