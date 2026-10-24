/** Binary min-heap of (key, value) pairs. Ties break on the smaller value, so routing is deterministic. */
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  private size = 0;
  /** Set by pop(). */
  topKey = 0;
  topVal = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  private less(i: number, j: number): boolean {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.vals[i] < this.vals[j]);
  }

  private swap(i: number, j: number): void {
    const k = this.keys[i];
    const v = this.vals[i];
    this.keys[i] = this.keys[j];
    this.vals[i] = this.vals[j];
    this.keys[j] = k;
    this.vals[j] = v;
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      const vals = new Int32Array(this.size * 2);
      keys.set(this.keys);
      vals.set(this.vals);
      this.keys = keys;
      this.vals = vals;
    }
    let i = this.size++;
    this.keys[i] = key;
    this.vals[i] = val;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** Removes the smallest entry into topKey/topVal. Returns false when empty. */
  pop(): boolean {
    if (this.size === 0) return false;
    this.topKey = this.keys[0];
    this.topVal = this.vals[0];
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size];
      this.vals[0] = this.vals[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.less(l, m)) m = l;
        if (r < this.size && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return true;
  }
}
