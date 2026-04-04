# Troubleshooting

## Serial Connection Issues

| Problem | Solution |
|---------|----------|
| `ENOENT` / port not found | Check USB connection, verify port path in `.env` |
| Permission denied | `sudo chmod 666 /dev/ttyUSB0` or add user to `dialout` group |
| Garbled output | Baud rate mismatch — check `SERIAL_BAUD` matches firmware `config.h` |
| No data received | Verify TX node is running and generating traffic |
| Intermittent disconnects | Check USB cable quality, try a different port |

## Gateway Issues

| Problem | Solution |
|---------|----------|
| Gateway starts but no metrics | Check serial connection, verify demo mode if no hardware |
| WebSocket not connecting | Verify `NEXT_PUBLIC_WS_URL` in web app `.env` matches gateway port |
| High parse error count | Firmware format may have changed — check parser expectations |
| Backend forwarding fails | Verify `BACKEND_URL` and that backend is running |

## Backend Issues

| Problem | Solution |
|---------|----------|
| Application fails to start | Check PostgreSQL is running, verify connection string |
| Flyway migration error | Check `db/migration/` for syntax errors, verify DB is clean |
| 401 Unauthorized | Token expired — re-login, check JWT_SECRET consistency |
| 403 Forbidden | User role insufficient for the endpoint |

## Database Issues

| Problem | Solution |
|---------|----------|
| Connection refused | `make db-up` to start PostgreSQL container |
| Migration checksum mismatch | Don't modify applied migrations — create new ones |
| Disk full | Check Docker volume space, prune old data |

## Web UI Issues

| Problem | Solution |
|---------|----------|
| Blank page | Check browser console for errors, verify API URL env vars |
| No live data | Check WebSocket connection in browser dev tools |
| Stale data | Clear TanStack Query cache, check API responses |

## Calibration Issues

| Problem | Solution |
|---------|----------|
| Low quality score | Review station placement, remove obstructions |
| Calibration expired | Re-run calibration wizard |
| Inconsistent baselines | Ensure consistent environment between calibration and sessions |

## Signal Quality Issues

| Problem | Solution |
|---------|----------|
| Low packet rate | Check TX traffic generation, verify Wi-Fi channel |
| High RSSI variance | Stabilize node mounting, reduce interference |
| Periodic artifacts | Identify and remove source of periodic interference |
