import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONFIG_PATH = fileURLToPath(new URL('../.local/config.json', import.meta.url));
export function makeToken() { return randomBytes(32).toString('base64url'); }

export async function openConfig(path = DEFAULT_CONFIG_PATH, env = process.env) {
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read local configuration. Check .local/config.json without sharing its contents.');
    config = {};
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Local configuration is invalid.');
  config = {
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    model: typeof config.model === 'string' && config.model ? config.model : 'gpt-5-mini',
    transcriptionModel: typeof config.transcriptionModel === 'string' && config.transcriptionModel ? config.transcriptionModel : 'gpt-transcribe',
    pairingToken: typeof config.pairingToken === 'string' && config.pairingToken.length >= 40 ? config.pairingToken : makeToken(),
  };
  const persist = async next => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
    const temp = join(dirname(path), `.config-${makeToken()}.tmp`);
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
    await chmod(path, 0o600);
    config = next;
  };
  await persist(config);
  // Setup tabs may save settings and rotate pairing concurrently. Build each
  // update from the last committed state so neither operation restores stale data.
  let pending = Promise.resolve();
  const update = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  return {
    get: () => ({ ...config, apiKey: config.apiKey || env.OPENAI_API_KEY || '' }),
    public: () => ({ ready: !!(config.apiKey || env.OPENAI_API_KEY), model: config.model, transcriptionModel: config.transcriptionModel, keySource: config.apiKey ? 'local' : env.OPENAI_API_KEY ? 'environment' : 'none' }),
    save: changes => update(async () => {
      const next = { ...config };
      if (changes.clearKey) next.apiKey = '';
      else if (changes.apiKey) next.apiKey = changes.apiKey;
      if (changes.model) next.model = changes.model;
      if (changes.transcriptionModel) next.transcriptionModel = changes.transcriptionModel;
      await persist(next);
    }),
    rotate: () => update(async () => { await persist({ ...config, pairingToken: makeToken() }); return config.pairingToken; }),
  };
}
