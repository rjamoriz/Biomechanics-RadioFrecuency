import { RingBuffer } from '../src/ingestion/ring-buffer';

describe('RingBuffer', () => {
  it('should store items up to capacity', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.isFull).toBe(true);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  it('should overwrite oldest items when full', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it('should handle clear', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(10);
    buf.push(20);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.isFull).toBe(false);
    expect(buf.toArray()).toEqual([]);
  });

  it('should work with objects', () => {
    const buf = new RingBuffer<{ v: number }>(2);
    buf.push({ v: 1 });
    buf.push({ v: 2 });
    buf.push({ v: 3 });
    expect(buf.toArray()).toEqual([{ v: 2 }, { v: 3 }]);
  });

  it('should report not full when under capacity', () => {
    const buf = new RingBuffer<string>(10);
    buf.push('a');
    expect(buf.isFull).toBe(false);
    expect(buf.size).toBe(1);
  });
});
