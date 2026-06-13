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
  summary: string;
  target: Record<string, unknown> | null;
  steps: DiagnosticStep[];
};

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

export async function runNetworkDiagnostics(
  pluginVersion: string,
  db: DbTarget | null,
  pgConnect?: () => Promise<Record<string, unknown>>,
): Promise<NetworkDiagnosticsReport> {
  const steps: DiagnosticStep[] = [];
  const tcpTimeoutMs = 10_000;
  const httpTimeoutMs = 8_000;

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

  if (db) {
    steps.push(
      await runStep("dns.lookup", async () => {
        const lookup = await dns.lookup(db.host, { all: true, verbatim: true });
        return { details: { host: db.host, records: lookup } };
      }),
    );

    steps.push(
      await runStep("dns.resolve4", async () => {
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
    );

    steps.push(
      await runStep("dns.resolve6", async () => {
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
    );

    steps.push(
      await runStep("dns.reverse", async () => {
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
    );
  } else {
    steps.push({
      step: "dns.target",
      status: "skip",
      durationMs: 0,
      details: { message: "DATABASE_URL not configured" },
    });
  }

  steps.push(
    await runStep("network.interfaces", async () => ({
      details: { interfaces: os.networkInterfaces() },
    })),
  );

  steps.push(
    await runStep("egress.http_ipify", async () => ({
      details: await fetchJson("https://api.ipify.org?format=json", httpTimeoutMs),
    })),
  );

  steps.push(
    await runStep("egress.http_cloudflare", async () => ({
      details: await fetchJson("https://1.1.1.1/cdn-cgi/trace", httpTimeoutMs),
    })),
  );

  steps.push(
    await runStep("tcp.control_cloudflare_443", async () => ({
      details: await tcpConnect("1.1.1.1", 443, tcpTimeoutMs),
    })),
  );

  steps.push(
    await runStep("tcp.control_google_dns_53", async () => ({
      details: await tcpConnect("8.8.8.8", 53, tcpTimeoutMs),
    })),
  );

  if (db) {
    steps.push(
      await runStep("tcp.postgres", async () => ({
        details: {
          host: db.host,
          port: Number(db.port),
          ...(await tcpConnect(db.host, Number(db.port), tcpTimeoutMs)),
        },
      })),
    );

    if (db.ssl) {
      steps.push(
        await runStep("tls.postgres", async () => ({
          details: {
            host: db.host,
            port: Number(db.port),
            ...(await tlsConnect(db.host, Number(db.port), tcpTimeoutMs)),
          },
        })),
      );
    } else {
      steps.push({
        step: "tls.postgres",
        status: "skip",
        durationMs: 0,
        details: { message: "SSL not enabled for target host" },
      });
    }

    if (pgConnect) {
      steps.push(
        await runStep("postgres.connect", async () => ({
          details: await pgConnect(),
        })),
      );
    }
  } else {
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
    summary: buildSummary(steps),
    target: redactTarget(db),
    steps,
  };

  return report;
}

export function formatReportForLogs(report: NetworkDiagnosticsReport): string {
  const lines = [
    `[NETWORK-DIAG] generatedAt=${report.generatedAt} version=${report.pluginVersion}`,
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
