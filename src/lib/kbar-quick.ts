// 命令面板「计算结果 / 时间转换」增强的纯函数。
// 识别规则移植自 wjerp-plugin 的 useCommandPalette.ts，保持一致体验。

/** 是否像一个数学表达式：含数字、含运算符、且整体仅由合法字符构成。 */
export function isMathExpression(q: string): boolean {
  const trimmed = q.trim();
  if (!/[0-9]/.test(trimmed)) return false;
  if (!/[-+*/%]/.test(trimmed)) return false;
  return /^[\d\s()+*/.%-]+$/.test(trimmed);
}

/**
 * 安全求值。入参已被 isMathExpression 限定为白名单字符集
 * （数字、空格、以及 + - * / % . ( ) 这些字符），无法构造任意 JS，
 * 故 new Function 在此安全。浮点结果保留 4 位小数，规避 0.1 + 0.2 这类误差。
 */
export function safeEval(q: string): string | null {
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${q}`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return String(Number(result.toFixed(4)));
    }
    return null;
  } catch {
    return null;
  }
}

export interface TimeConversion {
  /** 面板里展示的名称（转换结果）。 */
  name: string;
  /** 选中后复制到剪贴板的内容。 */
  result: string;
  kind: 'timestamp-to-date' | 'date-to-timestamp';
}

/** 识别并转换时间戳 / 日期。无法识别时返回 null。 */
export function detectTimeConversion(q: string): TimeConversion | null {
  const trimmed = q.trim();

  // 1. 时间戳转日期（10 位秒 或 13 位毫秒，纯数字）
  if (/^\d{10}(\d{3})?$/.test(trimmed)) {
    const ts = parseInt(trimmed, 10);
    const date = new Date(trimmed.length === 10 ? ts * 1000 : ts);
    if (!isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted =
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      return { name: formatted, result: formatted, kind: 'timestamp-to-date' };
    }
  }

  // 2. 日期转时间戳（YYYY-MM-DD ... 或 YYYY/MM/DD ...）
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const ts = String(date.getTime());
      return { name: `${ts} (ms)`, result: ts, kind: 'date-to-timestamp' };
    }
  }

  return null;
}
