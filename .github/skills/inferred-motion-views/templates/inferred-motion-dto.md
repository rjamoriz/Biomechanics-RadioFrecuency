# Example inferred motion DTO

```ts
type InferredMotionFrame = {
  timestamp: string;
  sessionId?: string;
  stationId?: string;
  modelVersion: string;
  schemaVersion: string;
  viewType?: "front" | "rear" | "left-lateral" | "right-lateral" | "orbit";
  confidence: number;
  validationState: "unvalidated" | "experimental" | "station-validated" | "externally-validated";
  signalQualityScore?: number;
  joints3d?: Array<{ name: string; x: number; y: number; z: number; confidence?: number }>;
  keypoints2d?: Array<{ name: string; x: number; y: number; confidence?: number }>;
};
```
