import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import worker, { steamLoginUrl, accountIdOf, firebaseToken, allowedReturn } from "../workers/steam-auth/src/index.js";

test("Steam id 64 → Dota account id", () => {
  assert.equal(accountIdOf("https://steamcommunity.com/openid/id/76561198035645274"), "75379546");
  assert.equal(accountIdOf("https://evil.example/openid/id/76561198035645274"), null);
  assert.equal(accountIdOf(undefined), null);
});

test("only the site's own pages get a token", () => {
  assert.ok(allowedReturn("https://dota2scrimcircuittracker.github.io/champion/fantasy/"));
  assert.ok(!allowedReturn("https://dota2scrimcircuittracker.github.io.evil.example/"));
  assert.ok(!allowedReturn("not a url"));
});

test("login sends the visitor to Steam with a callback back here", async () => {
  const r = await worker.fetch(new Request("https://steam-auth.x.workers.dev/login?return=https://dota2scrimcircuittracker.github.io/champion/"), {});
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://steamcommunity.com/openid/login");
  assert.match(to.searchParams.get("openid.return_to"), /^https:\/\/steam-auth\.x\.workers\.dev\/callback\?return=/);
  assert.equal((await worker.fetch(new Request("https://w.dev/login?return=https://evil.example/"), {})).status, 400);
  assert.equal(steamLoginUrl("https://w.dev/callback").includes("openid.realm=https%3A%2F%2Fw.dev"), true);
});

test("callback refuses a reply not addressed to it", async () => {
  const r = await worker.fetch(new Request("https://w.dev/callback?return=https://dota2scrimcircuittracker.github.io/&openid.mode=id_res&openid.op_endpoint=https://steamcommunity.com/openid/login&openid.return_to=https://other.dev/callback"), {});
  assert.equal(r.status, 400);
});

test("custom token is a valid RS256 JWT for Firebase", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa = { client_email: "fantasy@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  const tok = await firebaseToken(sa, "steam:75379546", { steam: 75379546 }, 1000);
  const [h, b, s] = tok.split(".");
  const body = JSON.parse(Buffer.from(b, "base64url"));
  assert.deepEqual([body.uid, body.iss, body.exp - body.iat, body.claims.steam], ["steam:75379546", sa.client_email, 3600, 75379546]);
  assert.equal(body.aud, "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit");
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url")));
});
