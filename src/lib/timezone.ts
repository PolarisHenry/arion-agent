// ============================================================
// Project-wide display/business timezone
// ------------------------------------------------------------
// The single knob for "which timezone do we show times in / evaluate
// time-based logic in". Defaults to Beijing (Asia/Shanghai).
//
// NEXT_PUBLIC_ prefix so the value is inlined into the browser bundle —
// dashboard tables are client components and can only read NEXT_PUBLIC_ env at
// runtime. The worker reads the same var from .env via dotenv, so ONE setting
// controls: dashboard date display, agent-runtime "current time" injection
// (buildCurrentTimeContext), and scheduler cron evaluation. Storage stays UTC;
// this only affects presentation/evaluation, never storage.
//
// Dependency-free, no @/ alias — imported by BOTH the Next app (@/) and the
// worker (relative paths).
// ============================================================

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Shanghai';
