import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const config = `PUBLIC_TPX_IDENTITY_LOGIN_URL=https://example.test/login
PUBLIC_TPX_IDENTITY_LOGOUT_URL=https://example.test/logout
PUBLIC_TPX_IDENTITY_SESSION_URL=https://example.test/session
PUBLIC_TPX_IDENTITY_RETURN_PARAM=return_to
PUBLIC_TPX_IDENTITY_EMAIL_PARAM=email
PUBLIC_TPX_IDENTITY_LOGOUT_METHOD=POST
PUBLIC_TPX_IDENTITY_HYDRATE_SESSION_ON_LOAD=true
PUBLIC_TPX_BUILD_ID=${'a'.repeat(40)}
`;
const manifest = 'Dockerfile\nsrc/layouts/BaseLayout.astro\n.env.production\n';
function check(contents, files) {
  const directory = mkdtempSync(join(tmpdir(), 'tpx-upload-'));
  try {
    const file = join(directory, '.env.production');
    writeFileSync(file, contents);
    return spawnSync('python3', ['scripts/check-production-upload.py', file], { input: files, encoding: 'utf8' });
  } finally { rmSync(directory, { recursive: true }); }
}

test('production upload requires the generated public configuration and rejects sensitive files', () => {
  assert.equal(check(config, manifest).status, 0);
  for (const files of [manifest.replace('.env.production\n', ''), manifest + '.env.private\n', manifest + 'gha-creds-example.json\n', manifest + '.git/config\n']) {
    assert.notEqual(check(config, files).status, 0);
  }
});

test('production upload rejects private or injected keys, duplicate keys, credential URLs and missing revision', () => {
  for (const contents of [config + 'PRIVATE_KEY=do-not-upload\n', config + 'PUBLIC_TPX_IDENTITY_LOGIN_URL=duplicate\n', config.replace('https://example.test/login', 'https://user:password@example.test/login'), config.replace('a'.repeat(40), '')]) {
    const result = check(contents, manifest);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /do-not-upload|password@example/);
  }
});
