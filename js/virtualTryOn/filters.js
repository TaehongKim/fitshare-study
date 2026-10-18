// Adapted from user-provided 코드페어_결선/js/filters.js
// One Euro Filter: 가만히 있을 땐 떨림을 강하게 줄이고, 빠르게 움직일 땐 지연 없이 따라가는 필터
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
}

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 8, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.tPrev = null;
  }

  filter(value, t) {
    if (this.tPrev === null) {
      this.tPrev = t;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(t - this.tPrev, 1e-3);
    this.tPrev = t;
    const d = (value - this.x.y) / dt;
    const ed = this.dx.filter(d, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

// 33개 포즈 랜드마크(x, y, z) 전체에 필터 적용
export class LandmarkSmoother {
  constructor(count = 33) {
    this.filters = Array.from({ length: count }, () => [new OneEuro(), new OneEuro(), new OneEuro(1, 2)]);
  }

  reset() {
    this.filters.forEach((f) => f.forEach((x) => x.reset()));
  }

  apply(landmarks, t) {
    return this.filters.map((filters, i) => {
      const p = landmarks[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        filters.forEach(filter => filter.reset());
        return { x: 0, y: 0, z: 0, visibility: 0 };
      }
      const [fx, fy, fz] = this.filters[i];
      return {
        x: fx.filter(p.x, t),
        y: fy.filter(p.y, t),
        z: fz.filter(Number.isFinite(p.z) ? p.z : 0, t),
        visibility: p.visibility === undefined ? 1 : Number.isFinite(p.visibility) ? p.visibility : 0,
      };
    });
  }
}
