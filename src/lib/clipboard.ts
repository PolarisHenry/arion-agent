// 浏览器剪贴板复制。安全上下文(HTTPS / localhost)走异步 Clipboard API;
// 纯 HTTP 直连(如 frp 隧道 http://39.96.77.152:8081)是非安全上下文,
// navigator.clipboard 为 undefined,navigator.clipboard.writeText 会同步抛
// TypeError,故回退到 execCommand —— 它不要求安全上下文,但必须在用户手势
// (点击 / 按键)内调用。
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand copy failed');
  } finally {
    document.body.removeChild(textarea);
  }
}
