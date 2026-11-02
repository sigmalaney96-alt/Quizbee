import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("server dependency compatibility", () => {
  it("loads Firebase Admin and verifies signing keys without CommonJS-to-ESM support", () => {
    const script = `
      const { getAuth } = require('firebase-admin/auth');
      const { generateKeyPairSync, sign, verify } = require('node:crypto');
      const { retrieveSigningKeys } = require('jwks-rsa/src/utils');
      (async () => {
        if (typeof getAuth !== 'function') throw new Error('Firebase Auth is unavailable');
        for (const [type, options] of [
          ['rsa', { modulusLength: 2048 }],
          ['ec', { namedCurve: 'prime256v1' }]
        ]) {
          const { publicKey, privateKey } = generateKeyPairSync(type, options);
          const jwk = { ...publicKey.export({ format: 'jwk' }), kid: type, use: 'sig' };
          const keys = await retrieveSigningKeys([jwk]);
          const data = Buffer.from('quizbee-signing-key-test');
          const signature = sign('sha256', data, privateKey);
          if (keys.length !== 1 || keys[0].kid !== type ||
              !verify('sha256', data, keys[0].getPublicKey(), signature)) {
            throw new Error('Failed to verify ' + type + ' signing key');
          }
        }
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    expect(() => execFileSync(process.execPath, [
      "--no-experimental-require-module", "--input-type=commonjs", "-e", script,
    ], { encoding: "utf8", stdio: "pipe" })).not.toThrow();
  });
});
