# Pipeline checklist

Use this checklist before finalizing realtime CSI pipeline changes.

## Contract checks
- Is firmware output still line-based and deterministic?
- Did field ordering or delimiters change?
- Did parser fixtures get updated?
- Are malformed lines counted and observable?

## Runtime checks
- Are buffers bounded?
- Is reconnect behavior explicit?
- Are websocket payloads typed?
- Are timestamps preserved?
- Is degraded backend connectivity visible?

## Scientific checks
- Are outputs labeled as estimates or proxies where needed?
- Are confidence and signal quality attached to derived metrics?
- Did any UI/API labels become misleading?
