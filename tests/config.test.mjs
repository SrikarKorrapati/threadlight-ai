import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openConfig } from '../server/config.mjs';

test('concurrent settings saves and pairing rotation preserve every committed change', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'threadlight-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json'), config = await openConfig(path, {});
  const previousToken = config.get().pairingToken;
  const [, token] = await Promise.all([
    config.save({ model: 'test-model' }),
    config.rotate(),
    config.save({ transcriptionModel: 'test-transcription' }),
  ]);
  const disk = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(disk.model, 'test-model');
  assert.equal(disk.transcriptionModel, 'test-transcription');
  assert.equal(disk.pairingToken, token);
  assert.notEqual(token, previousToken);
  assert.deepEqual(config.get(), disk);
});
