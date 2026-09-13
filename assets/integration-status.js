// v35: client-side readiness helpers. Never place secrets in browser code.
export function updateIntegrationStatus({elementId, configured, readyText, pendingText}) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = configured ? '✅ ' + readyText : '⚙️ ' + pendingText;
  el.className = 'integration-status ' + (configured ? 'ready' : 'pending');
}
