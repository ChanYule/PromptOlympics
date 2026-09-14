import { createCompetition, readCompetitionStore, persistCompetitionStore } from './competitionStore.js';

export class StorageError extends Error {
  constructor(message = 'We could not access saved stories. Please try again shortly.') {
    super(message);
    this.status = 503;
  }
}

export function createCompetitionRepository({ env = process.env, fetchImpl = fetch } = {}) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if ((url || key) && !(url && key)) throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY.');
  if (!url) {
    return {
      kind: 'local',
      async read() {
        try { return readCompetitionStore(); } catch { throw new StorageError(); }
      },
      async update(change) {
        // Synchronous local read/change/write prevents interleaved local requests.
        let store;
        try { store = readCompetitionStore(); } catch { throw new StorageError(); }
        const result = change(store);
        try { persistCompetitionStore(store); } catch { throw new StorageError(); }
        return result;
      }
    };
  }

  const base = new URL(url);
  if (base.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.');
  if (key.startsWith('sb_publishable_')) throw new Error('Use a server secret key, not a publishable key.');
  const endpoint = `${base.origin}/rest/v1/prompt_olympics_state`;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Modern secret keys go only in apikey; legacy service_role keys are JWTs.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;

  async function request(query, options = {}) {
    try {
      const response = await fetchImpl(`${endpoint}${query}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new StorageError();
      return response.status === 204 ? null : await response.json();
    } catch {
      // Never expose credentials or database diagnostics to visitors.
      throw new StorageError();
    }
  }

  async function snapshot() {
    let rows = await request('?id=eq.prompt-olympics&select=state,version');
    if (!Array.isArray(rows)) throw new StorageError();
    if (!rows.length) {
      await request('?on_conflict=id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ id: 'prompt-olympics', state: createCompetition(), version: 0 })
      });
      rows = await request('?id=eq.prompt-olympics&select=state,version');
    }
    const row = rows?.[0];
    if (!row || !Number.isInteger(row.version) || !Array.isArray(row.state?.rounds) || !row.state.rounds.length) {
      throw new StorageError();
    }
    return { store: createCompetition(row.state), version: row.version };
  }

  return {
    kind: 'supabase',
    async read() { return (await snapshot()).store; },
    async update(change) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { store, version } = await snapshot();
        // Callbacks must be synchronous and free of external side effects:
        // they may run again after a competing request commits first.
        const result = change(store);
        const saved = await request(`?id=eq.prompt-olympics&version=eq.${version}&select=version`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ state: store, version: version + 1 })
        });
        if (!Array.isArray(saved)) throw new StorageError();
        if (saved.length === 1) return result;
      }
      throw new StorageError('Many people are saving at once. Please try again.');
    }
  };
}
