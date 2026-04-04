# Example normalized CSI frame

Use a typed normalized object rather than passing raw serial strings around.

Example shape:

```ts
type NormalizedCsiFrame = {
  timestamp: string;
  stationId?: string;
  channel?: number;
  rssi?: number;
  rate?: number;
  sourceMac?: string;
  csiLength?: number;
  csiValues: number[];
  parserVersion: string;
};
```
