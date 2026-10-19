/* ======================================================
 * 图表封装：统一配色、自动销毁旧实例（可视化大屏用）
 * ====================================================== */

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

Chart.defaults.font.family = "'PingFang SC', 'Microsoft YaHei', sans-serif";

const Charts = {
  registry: {},

  draw(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (this.registry[canvasId]) this.registry[canvasId].destroy();
    this.registry[canvasId] = new Chart(canvas, { type, data, options });
  },

  destroyAll() {
    Object.keys(this.registry).forEach(k => {
      this.registry[k].destroy();
      delete this.registry[k];
    });
  },
};

// 大屏图表通用选项
function bigScreenLegend() {
  return {
    labels: { color: '#9fb3d9', font: { size: 12 } },
  };
}
