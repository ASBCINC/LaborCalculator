// Cloudflare Worker: "asbc-dtools-relay" (v8.18.0). Paste into a Cloudflare Worker (free plan).
// Starts the "Sync D-Tools opportunities" GitHub workflow:
//   1) instantly, whenever D-Tools calls the webhook URL  https://<worker>.workers.dev/hook/<HOOK_SECRET>
//   2) every 10 minutes from a Cloudflare cron trigger (GitHub's own 15-minute schedule often runs hours late)
// Secrets (Worker > Settings > Variables and Secrets, type "Secret"):
//   GH_TOKEN      fine-grained token, only ASBCINC/LaborCalculator, "Actions: Read and write"
//   HOOK_SECRET   the random string in the webhook URL (keeps strangers from triggering it)
// No D-Tools or Firebase keys live here; the sync itself still runs in GitHub with the repo secrets.
const WORKFLOW = 'https://api.github.com/repos/ASBCINC/LaborCalculator/actions/workflows/sync-opportunities.yml/dispatches';

async function startSync(env, why) {
  const r = await fetch(WORKFLOW, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'asbc-dtools-relay', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' })
  });
  console.log('dispatch', why, r.status);
  return r.status;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!env.HOOK_SECRET || path !== `/hook/${env.HOOK_SECRET}`) return new Response('Not found', { status: 404 });
    const status = await startSync(env, 'webhook');
    return new Response(status === 204 ? 'ok: sync started' : `GitHub said ${status}`, { status: status === 204 ? 200 : 502 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(startSync(env, 'cron'));
  }
};
