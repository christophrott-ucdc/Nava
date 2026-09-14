import { Hono } from 'hono';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import type { AuthEnv } from './auth';
export interface AdminDashboardOptions {
    appRoot: string;
    processMetrics?: () => unknown;
}
export const WIKI_PAGES = [
    {id:"identity",title:"Identitate, RBAC și Google",file:"docs/IDENTITATE-SI-RBAC.md"},
    { id: 'start', title: 'Ghid complet EXODUS7', file: 'README.md' },
    { id: 'operator', title: 'Operarea experienței', file: 'docs/OPERARE.md' },
    { id: 'children', title: 'Steaua Omenirii · copii', file: 'docs/STEAUA-OMENIRII-INTEGRARE.md' },
    { id: 'screens', title: 'TV-uri și configurare adaptivă', file: 'docs/ADAPTIVE-DISPLAYS.md' },
    { id: 'languages', title: 'Română, engleză și franceză', file: 'docs/MULTILINGUAL-RO-EN-FR.md' },
    { id: 'audio', title: 'Prim-planuri și mixer', file: 'docs/PLANETE-SI-MIXER-2026-09-14.md' },
    { id: 'recovery', title: 'Recuperare după întrerupere', file: 'docs/RECUPERARE-SQLITE.md' },
    { id: 'backup', title: 'Pornire, stare tehnică și backup', file: 'docs/PORNIRE-TV-SI-BACKUP.md' },
    { id: 'logs', title: 'Loguri și diagnostic', file: 'docs/LOGURI.md' },
    { id: 'diploma', title: 'Diplome și acces public', file: 'docs/DIPLOME-PUBLICE-SI-TELEMETRIE-PERETE.md' },
    { id: 'robot', title: 'H2 EDU și actualizări', file: 'docs/ROBOT-SI-ACTUALIZARI.md' },
    { id: 'security', title: 'Securitate și acces', file: 'docs/SECURITATE.md' },
    { id: 'admin', title: 'Administrare, parolă și MFA', file: 'docs/ADMIN-CENTER.md' },
] as const;
type Gpu = {
    name: string;
    utilization: number | null;
    memoryUsedMb: number | null;
    memoryTotalMb: number | null;
    temperatureC: number | null;
};
export function parseNvidiaCsv(text: string): Gpu[] { return text.trim().split(/\r?\n/).filter(Boolean).map(line => { const [name, ...values] = line.split(',').map(v => v.trim()); const n = values.map(v => /^\d+(\.\d+)?$/.test(v) ? Number(v) : null); return { name, utilization: n[0] ?? null, memoryUsedMb: n[1] ?? null, memoryTotalMb: n[2] ?? null, temperatureC: n[3] ?? null }; }); }
function cpu() { return os.cpus().reduce((sum, c) => ({ idle: sum.idle + c.times.idle, total: sum.total + Object.values(c.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 }); }
export function createAdminDashboard(options: AdminDashboardOptions) {
    const router = new Hono<AuthEnv>();
    let previous = cpu(), previousProcess = process.cpuUsage(), previousTime = performance.now(), loop = performance.eventLoopUtilization();
    let cached: unknown = null, lastAt = 0, pending: Promise<unknown> | null = null, gpuAt = 0, gpus: Gpu[] = [], gpuIssue: string | null = 'Se citește placa video.';
    async function sample() {
        const now = Date.now();
        if (cached && now - lastAt < 2000)
            return cached;
        if (pending)
            return pending;
        pending = (async () => {
            const current = cpu(), elapsed = (performance.now() - previousTime) * 1000, processUsage = process.cpuUsage(previousProcess), total = current.total - previous.total;
            const utilization = performance.eventLoopUtilization(loop);
            loop = performance.eventLoopUtilization();
            previousTime = performance.now();
            previousProcess = process.cpuUsage();
            const hostCpu = total > 0 ? Math.max(0, Math.min(100, 100 * (1 - (current.idle - previous.idle) / total))) : null;
            previous = current;
            if (now - gpuAt >= 10000) {
                gpuAt = now;
                await new Promise<void>(resolve => execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 2000, maxBuffer: 65536 }, (error, stdout) => { gpus = error ? [] : parseNvidiaCsv(stdout); gpuIssue = error ? 'Utilizarea GPU nu este disponibilă: nvidia-smi/driver NVIDIA indisponibil.' : gpus.length ? null : 'Driverul nu a returnat măsurători GPU.'; resolve(); }));
            }
            let disk: {
                totalBytes: number;
                freeBytes: number;
            } | null = null;
            try {
                const stat = await fs.statfs(options.appRoot);
                disk = { totalBytes: stat.blocks * stat.bsize, freeBytes: stat.bavail * stat.bsize };
            }
            catch { /* unsupported filesystem */ }
            cached = { at: new Date().toISOString(), host: { name: os.hostname(), platform: os.platform(), release: os.release(), uptimeSec: os.uptime(), cpuModel: os.cpus()[0]?.model ?? null, logicalCores: os.cpus().length, cpuPercent: hostCpu, memoryTotalBytes: os.totalmem(), memoryUsedBytes: os.totalmem() - os.freemem(), disk }, process: { uptimeSec: process.uptime(), cpuPercent: elapsed > 0 ? (processUsage.user + processUsage.system) / elapsed * 100 : null, memory: process.memoryUsage(), eventLoopUtilization: utilization.utilization * 100 }, gpu: { devices: gpus, issue: gpuIssue, sampledAt: new Date(gpuAt).toISOString() }, electron: options.processMetrics?.() ?? null };
            lastAt = Date.now();
            return cached;
        })().finally(() => { pending = null; });
        return pending;
    }
    router.get('/metrics', async (c) => c.json(await sample()));
    router.get('/wiki', c => c.json({ pages: WIKI_PAGES }));
    router.get('/wiki/:id', async (c) => {
        const page = WIKI_PAGES.find(p => p.id === c.req.param('id'));
        if (!page)
            return c.json({ ok: false, reason: 'Articol necunoscut.' }, 404);
        const roots = [options.appRoot, ...(typeof process.resourcesPath === 'string' ? [process.resourcesPath] : [])];
        for (const root of roots)
            try {
                const file = path.join(root, page.file), stat = await fs.stat(file);
                if (stat.size > 1024 * 1024)
                    continue;
                return c.json({ ...page, content: await fs.readFile(file, 'utf8'), updatedAt: stat.mtime.toISOString() });
            }
            catch { /* try bundled docs */ }
        return c.json({ ok: false, reason: 'Articolul nu este inclus în această instalare.' }, 503);
    });
    return router;
}
