// ============================================================
// execFileAsync — promise-based subprocess runner (spawn-backed)
// ------------------------------------------------------------
// Replaces execFileSync across the worker so no lark-cli call blocks the
// Node event loop — agent message handling stays responsive while a tool
// or auth command runs. Built on spawn because execFile / promisify(execFile)
// do NOT support the `input` option, and several lark-cli calls need stdin
// (config init --app-secret-stdin, tool bodies). Rejected errors carry
// .status / .signal / .stdout / .stderr to match execFileSync's shape so the
// existing catch blocks (interpretLarkError etc.) keep working unchanged.
// ============================================================

import { spawn } from 'child_process';

export type ExecFileOptions = {
  input?: string;
  timeout?: number;
  maxBuffer?: number;
  encoding?: BufferEncoding;
  env?: NodeJS.ProcessEnv;
};

export type ExecResult = { stdout: string; stderr: string };

export function execFileAsync(
  file: string,
  args: string[],
  opts: ExecFileOptions = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const encoding = opts.encoding ?? 'utf8';
    const maxBuffer = opts.maxBuffer ?? 10 * 1024 * 1024;
    const child = spawn(file, args, {
      env: opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    type ExecError = Error & {
      status?: number | null;
      code?: number | string | null;
      signal?: string | null;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };

    const settle = (err?: ExecError) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    };

    const append = (buf: Buffer, target: 'stdout' | 'stderr') => {
      const text = buf.toString(encoding);
      if (target === 'stdout') stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > maxBuffer) {
        try {
          child.kill('SIGKILL');
        } catch {
          // process may have already exited
        }
        const e: ExecError = new Error(`maxBuffer exceeded (${maxBuffer} bytes)`);
        e.signal = 'SIGKILL';
        settle(e);
      }
    };

    child.stdout.on('data', (b: Buffer) => append(b, 'stdout'));
    child.stderr.on('data', (b: Buffer) => append(b, 'stderr'));
    child.on('error', (e) => settle(e as ExecError));

    child.on('close', (status, signal) => {
      if (status === 0) {
        settle();
      } else {
        const e: ExecError = new Error(`Command failed: ${file} ${args.join(' ')}`);
        e.status = status;
        e.code = status;
        e.signal = signal;
        settle(e);
      }
    });

    if (opts.timeout) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // process may have already exited
        }
        const e: ExecError = new Error(`Command timed out after ${opts.timeout}ms: ${file}`);
        e.signal = 'SIGTERM';
        e.killed = true;
        settle(e);
      }, opts.timeout);
    }

    // EPIPE is expected if the process exits before draining stdin (e.g. a
    // quick error); swallow it — the close/error handlers settle the promise.
    child.stdin.on('error', () => {});
    if (opts.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}
