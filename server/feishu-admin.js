'use strict';
function renderFeishuStatus() {
  return `<div id="feishuStatusPanel" style="margin:0 0 16px;padding:12px;border:1px solid var(--line);border-radius:9px;background:#fff"><h3>Feishu notifications and sync</h3><p id="feishuStatusText" role="status">Loading notification and sync status…</p><div class="actions"><button type="button" class="btn" id="feishuRefreshStatus">Refresh status</button><button type="button" class="btn" id="feishuReconcile">Full reconciliation</button><input id="feishuRetryRef" aria-label="Registration reference or failed job ID" placeholder="Registration reference or failed job ID" style="padding:8px"><button type="button" class="btn" id="feishuRetry">Retry failed tasks</button></div><pre id="feishuErrors" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></div>`;
}
module.exports={renderFeishuStatus};
