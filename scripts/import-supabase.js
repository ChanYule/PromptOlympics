import fs from 'node:fs';
import { createCompetition } from '../competitionStore.js';
import { createCompetitionRepository } from '../competitionRepository.js';

try {
  const filename = process.argv[2];
  if (!filename) throw new Error('Usage: node scripts/import-supabase.js path/to/backup.json');
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  const source = raw.competition ?? raw;
  if (!Array.isArray(source.rounds) || !source.rounds.length || source.rounds.some(round =>
    !Array.isArray(round.submissions) || !Array.isArray(round.votes))) throw new Error('Invalid competition backup.');
  const { currentRound, ...saved } = source;
  const incoming = createCompetition(saved);
  const repository = createCompetitionRepository();
  if (repository.kind !== 'supabase') throw new Error('Configure Supabase before importing.');
  await repository.update(store => {
    if (store.importedAt || store.rounds.some(round => round.submissions.length || round.votes.length) || store.rounds.length > 1) {
      throw new Error('Import stopped: Supabase already contains competition data. Nothing was overwritten.');
    }
    Object.assign(store, incoming, { importedAt: Date.now() });
  });
  console.log('Import complete. Stories, scores, votes and round history are saved in Supabase.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
