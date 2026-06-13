import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";

export type DbTarget = {
  host: string;
  port: string;
  username: string;
  database: string;
  ssl: boolean;
};

export type DiagnosticStep = {
  step: string;
  status: "ok" | "fail" | "warn" | "skip";
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

export type NetworkDiagnosticsReport = {
  generatedAt: string;
  pluginVersion: string;
  mode: "instant" | "quick" | "full";
  summary: string;
  note?: string;
  target: Record<string, unknown> | null;
  steps: DiagnosticStep[];
};

export type DiagnosticOptions = {
  mode: "quick" | "full";
  tcpTimeoutMs: number;
  httpTimeoutMs: number;
  includePostgresConnect: boolean;
};

export const QUICK_DIAGNOSTIC_OPTIONS: DiagnosticOptions = {
  mode: "quick",
  tcpTimeoutMs: 3_000,
  httpTimeoutMs: 3_000,
  includePostgresConnect: false,
};

export const FULL_DIAGNOSTIC_OPTIONS: DiagnosticOptions = {
  mode: "full",
  tcpTimeoutMs: 10_000,
  httpTimeoutMs: 8_000,
  includePostgresConnect: true,
};

const BACKGROUND_NOTE =
  "Network tests (DNS/TCP/TLS/postgres.connect) run asynchronously in plugin logs — " +
  "cy plugin logs cycloid-plugin-postgresql-users | grep NETWORK-DIAG";

export function runInstantDiagnostics(
  pluginVersion: string,
  target: Record<string, unknown> | null,
): NetworkDiagnosticsReport {
  const steps: DiagnosticStep[] = [
    {
      step: "container.info",
      status: "ok",
      durationMs: 0,
      details: {
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        pid: process.pid,
        env: {
          PORT: process.env.PORT ?? null,
          DATABASE_URL: process.env.DATABASE_URL ? "[set]" : "[unset]",
          HOSTNAME: process.env.HOSTNAME ?? null,
          KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST ?? null,
          CY_ORG: process.env.CY_ORG ?? null,
          CY_PROJECT: process.env.CY_PROJECT ?? null,
          CY_ENV: process.env.CY_ENV ?? null,
          CY_COMPONENT: process.env.CY_COMPONENT ?? null,
        },
      },
    },
    {
      step: "dns.resolv_conf",
      status: "ok",
      durationMs: 0,
      details: (() => {
        try {
          return { content: fs.readFileSync("/etc/resolv.conf", "utf8").trim() };
        } catch (err) {
          return { message: (err as Error).message };
        }
      })(),
    },
    {
      step: "network.interfaces",
      status: "ok",
      durationMs: 0,
      details: { interfaces: os.networkInterfaces() },
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    pluginVersion,
    mode: "instant",
    summary: "Instant container snapshot returned. See plugin logs for network test results.",
    note: BACKGROUND_NOTE,
    target,
    steps,
  };
}

function elapsed(start: number): number {
  return Date.now() - start;
}

async function runStep(
  step: string,
  fn: () => Promise<{ details?: Record<string, unknown>; status?: DiagnosticStep["status"] }>,
): Promise<DiagnosticStep> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      step,
      status: result.status ?? "ok",
      durationMs: elapsed(start),
      details: result.details,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
    return {
      step,
      status: "fail",
      durationMs: elapsed(start),
      error: code ? `${error} (code=${code})` : error,
    };
  }
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<{ localAddress?: string; localPort?: number }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("connect", () => {
      const local = socket.address();
      clearTimeout(timer);
      socket.end();
      resolve(
        typeof local === "object" && local
          ? { localAddress: local.address, localPort: local.port }
          : {},
      );
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function tlsConnect(host: string, port: number, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        resolve({
          authorized: socket.authorized,
          authorizationError: socket.authorizationError || null,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher(),
          peerSubject: cert.subject,
          peerIssuer: cert.issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
        });
        socket.end();
      },
    );

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once("close", () => clearTimeout(timer));
  });
}

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 500);
    }
    return { status: res.status, statusText: res.statusText, body };
  } finally {
    clearTimeout(timer);
  }
}

function redactTarget(db: DbTarget | null): Record<string, unknown> | null {
  if (!db) return null;
  return {
    host: db.host,
    port: db.port,
    username: db.username,
    database: db.database,
    ssl: db.ssl,
    password: "[redacted]",
  };
}

function buildSummary(steps: DiagnosticStep[]): string {
  const failed = steps.filter((s) => s.status === "fail");
  if (failed.length === 0) return "All diagnostic steps passed.";

  const names = failed.map((s) => s.step).join(", ");
  const dnsFailed = failed.some((s) => s.step.startsWith("dns."));
  const tcpFailed = failed.some((s) => s.step.startsWith("tcp."));
  const tlsFailed = failed.some((s) => s.step.startsWith("tls."));
  const pgFailed = failed.some((s) => s.step === "postgres.connect");
  const egressFailed = failed.some((s) => s.step.startsWith("egress."));

  if (dnsFailed && !tcpFailed) return `DNS resolution failed (${names}). Likely a DNS problem inside the plugin container.`;
  if (dnsFailed && tcpFailed) return `DNS and TCP failed (${names}). Check DNS and outbound firewall from Cycloid plugin runtime.`;
  if (egressFailed && tcpFailed) return `General egress and PostgreSQL TCP failed (${names}). Plugin container may block outbound traffic.`;
  if (tcpFailed && !dnsFailed && tlsFailed) return `TCP/TLS to PostgreSQL failed (${names}). Host resolves but connection is blocked or filtered.`;
  if (pgFailed && !tcpFailed) return `TCP works but PostgreSQL login/query failed (${names}). Check credentials, SSL, or server auth rules.`;
  return `Failed steps: ${names}`;
}

async function runOptionalStep(
  step: string,
  enabled: boolean,
  fn: () => Promise<DiagnosticStep>,
): Promise<DiagnosticStep | null> {
  if (!enabled) return null;
  return fn();
}

export async function runNetworkDiagnostics(
  pluginVersion: string,
  db: DbTarget | null,
  pgConnect: (() => Promise<Record<string, unknown>>) | undefined,
  options: DiagnosticOptions,
): Promise<NetworkDiagnosticsReport> {
  const { mode, tcpTimeoutMs, httpTimeoutMs, includePostgresConnect } = options;
  const quick = mode === "quick";
  const steps: DiagnosticStep[] = [];

  steps.push(
    await runStep("container.info", async () => ({
      details: {
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        pid: process.pid,
        env: {
          PORT: process.env.PORT ?? null,
          DATABASE_URL: process.env.DATABASE_URL ? "[set]" : "[unset]",
          HOSTNAME: process.env.HOSTNAME ?? null,
          KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST ?? null,
          CY_ORG: process.env.CY_ORG ?? null,
          CY_PROJECT: process.env.CY_PROJECT ?? null,
          CY_ENV: process.env.CY_ENV ?? null,
          CY_COMPONENT: process.env.CY_COMPONENT ?? null,
        },
      },
    })),
  );

  steps.push(
    await runStep("dns.resolv_conf", async () => {
      try {
        const content = fs.readFileSync("/etc/resolv.conf", "utf8");
        return { details: { content: content.trim() } };
      } catch (err) {
        return {
          status: "warn",
          details: { message: (err as Error).message },
        };
      }
    }),
  );

  const parallelSteps: Promise<DiagnosticStep>[] = [];

  if (db) {
    parallelSteps.push(
      runStep("dns.lookup", async () => {
        const lookup = await dns.lookup(db.host, { all: true, verbatim: true });
        return { details: { host: db.host, records: lookup } };
      }),
    );
  }

  parallelSteps.push(
    runStep("network.interfaces", async () => ({
      details: { interfaces: os.networkInterfaces() },
    })),
    runStep("egress.http_ipify", async () => ({
      details: await fetchJson("https://api.ipify.org?format=json", httpTimeoutMs),
    })),
    runStep("tcp.control_cloudflare_443", async () => ({
      details: await tcpConnect("1.1.1.1", 443, tcpTimeoutMs),
    })),
    runStep("tcp.control_google_dns_53", async () => ({
      details: await tcpConnect("8.8.8.8", 53, tcpTimeoutMs),
    })),
  );

  if (db) {
    parallelSteps.push(
      runStep("tcp.postgres", async () => ({
        details: {
          host: db.host,
          port: Number(db.port),
          ...(await tcpConnect(db.host, Number(db.port), tcpTimeoutMs)),
        },
      })),
    );
    if (db.ssl) {
      parallelSteps.push(
        runStep("tls.postgres", async () => ({
          details: {
            host: db.host,
            port: Number(db.port),
            ...(await tlsConnect(db.host, Number(db.port), tcpTimeoutMs)),
          },
        })),
      );
    }
  }

  steps.push(...(await Promise.all(parallelSteps)));

  if (!db) {
    steps.push({
      step: "dns.target",
      status: "skip",
      durationMs: 0,
      details: { message: "DATABASE_URL not configured" },
    });
  }

  if (!quick && db) {
    const extraSteps = await Promise.all([
      runOptionalStep("dns.resolve4", true, () =>
        runStep("dns.resolve4", async () => {
          try {
            const addresses = await dns.resolve4(db.host);
            return { details: { host: db.host, addresses } };
          } catch (err) {
            const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
            if (code === "ENODATA" || code === "ENOTFOUND") {
              return { status: "warn", details: { host: db.host, message: (err as Error).message } };
            }
            throw err;
          }
        }),
      ),
      runOptionalStep("dns.resolve6", true, () =>
        runStep("dns.resolve6", async () => {
          try {
            const addresses = await dns.resolve6(db.host);
            return { details: { host: db.host, addresses } };
          } catch (err) {
            const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
            if (code === "ENODATA" || code === "ENOTFOUND") {
              return { status: "warn", details: { host: db.host, message: (err as Error).message } };
            }
            throw err;
          }
        }),
      ),
      runOptionalStep("dns.reverse", true, () =>
        runStep("dns.reverse", async () => {
          const lookup = await dns.lookup(db.host, { verbatim: true });
          const address = typeof lookup === "string" ? lookup : lookup.address;
          try {
            const hostnames = await dns.reverse(address);
            return { details: { address, hostnames } };
          } catch (err) {
            return {
              status: "warn",
              details: { address, message: (err as Error).message },
            };
          }
        }),
      ),
      runOptionalStep("egress.http_cloudflare", true, () =>
        runStep("egress.http_cloudflare", async () => ({
          details: await fetchJson("https://1.1.1.1/cdn-cgi/trace", httpTimeoutMs),
        })),
      ),
      runOptionalStep("postgres.connect", includePostgresConnect && !!pgConnect, () =>
        runStep("postgres.connect", async () => ({
          details: await pgConnect!(),
        })),
      ),
    ]);
    steps.push(...extraSteps.filter((step): step is DiagnosticStep => step !== null));
  } else if (db) {
    steps.push({
      step: "postgres.connect",
      status: "skip",
      durationMs: 0,
      details: {
        message:
          "Skipped in quick mode to stay within Cycloid proxy timeout. Full report is written to plugin logs.",
      },
    });
  }

  if (!db) {
    steps.push({
      step: "tcp.postgres",
      status: "skip",
      durationMs: 0,
      details: { message: "DATABASE_URL not configured" },
    });
  }

  const report: NetworkDiagnosticsReport = {
    generatedAt: new Date().toISOString(),
    pluginVersion,
    mode,
    summary: buildSummary(steps),
    note: quick
      ? BACKGROUND_NOTE
      : undefined,
    target: redactTarget(db),
    steps,
  };

  return report;
}

export function formatReportForLogs(report: NetworkDiagnosticsReport): string {
  const lines = [
    `[NETWORK-DIAG] generatedAt=${report.generatedAt} version=${report.pluginVersion} mode=${report.mode}`,
    `[NETWORK-DIAG] summary=${report.summary}`,
    `[NETWORK-DIAG] target=${JSON.stringify(report.target)}`,
  ];
  for (const step of report.steps) {
    const base = `[NETWORK-DIAG] ${step.step} status=${step.status} durationMs=${step.durationMs}`;
    if (step.error) lines.push(`${base} error=${step.error}`);
    else if (step.details) lines.push(`${base} details=${JSON.stringify(step.details)}`);
    else lines.push(base);
  }
  return lines.join("\n");
}
