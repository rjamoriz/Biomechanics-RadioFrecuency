import { parseCsiLine } from '../src/serial/serial.parser';

describe('parseCsiLine', () => {
  it('should parse a valid CSI line', () => {
    const values = Array(128).fill(0).map((_, i) => i % 256);
    const line = `CSI,1000,${-55},6,AA:BB:CC:DD:EE:FF,${values.length},${values.join(',')}`;
    const result = parseCsiLine(line);

    expect(result.valid).toBe(true);
    expect(result.packet).toBeDefined();
    expect(result.packet!.timestamp).toBe(1000);
    expect(result.packet!.rssi).toBe(-55);
    expect(result.packet!.channel).toBe(6);
    expect(result.packet!.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(result.packet!.csiValues).toHaveLength(128);
    expect(result.packet!.csiValues[0]).toBe(0);
    expect(result.packet!.csiValues[55]).toBe(55);
  });

  it('should reject a line without CSI prefix', () => {
    const result = parseCsiLine('NOISE,1000,-55,6,AA:BB,4,1,2,3,4');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('prefix');
  });

  it('should reject a line with missing fields', () => {
    const result = parseCsiLine('CSI,1000,-55');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('fields');
  });

  it('should reject non-numeric CSI values', () => {
    const result = parseCsiLine('CSI,1000,-55,6,AA:BB,3,1,abc,3');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('numeric');
  });

  it('should reject when csi_len does not match actual values', () => {
    const result = parseCsiLine('CSI,1000,-55,6,AA:BB,5,1,2,3');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('length');
  });

  it('should handle empty strings', () => {
    const result = parseCsiLine('');
    expect(result.valid).toBe(false);
  });

  it('should handle negative CSI values', () => {
    const line = 'CSI,1000,-55,6,AA:BB,4,-10,20,-30,40';
    const result = parseCsiLine(line);
    expect(result.valid).toBe(true);
    expect(result.packet!.csiValues).toEqual([-10, 20, -30, 40]);
  });
});
