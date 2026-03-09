export class CountUp {
  constructor(element, endVal, options = {}) {
    this.el = element;
    this.endVal = endVal;
    this.currentVal = 0;
    this.duration = options.duration || 1500;
    this.decimals = options.decimals || 0;
    this.prefix = options.prefix || '';
    this.suffix = options.suffix || '';
    this.separator = options.separator !== undefined ? options.separator : ',';
    this.useGrouping = options.useGrouping !== undefined ? options.useGrouping : true;
    this.frameId = null;
  }

  _format(n) {
    const fixed = n.toFixed(this.decimals);
    if (!this.useGrouping) {
      return this.prefix + fixed + this.suffix;
    }
    const [intPart, decPart] = fixed.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, this.separator);
    const formatted = decPart !== undefined ? grouped + '.' + decPart : grouped;
    return this.prefix + formatted + this.suffix;
  }

  _animate(startVal, endVal, duration) {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    const startTime = performance.now();
    this.el.classList.add('updating');

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startVal + (endVal - startVal) * eased;

      this.currentVal = current;
      this.el.textContent = this._format(current);

      if (progress < 1) {
        this.frameId = requestAnimationFrame(step);
      } else {
        this.currentVal = endVal;
        this.el.textContent = this._format(endVal);
        this.el.classList.remove('updating');
        this.frameId = null;
      }
    };

    this.frameId = requestAnimationFrame(step);
  }

  start() {
    this._animate(0, this.endVal, this.duration);
  }

  update(newVal) {
    if (newVal === this.endVal) return;
    const from = this.currentVal;
    this.endVal = newVal;
    this._animate(from, newVal, 800);
  }

  setDirect(val) {
    this.currentVal = val;
    this.endVal = val;
    this.el.textContent = this._format(val);
  }
}
