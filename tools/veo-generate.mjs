#!/usr/bin/env node
/**
 * Generate a video with Google Veo 3.1 on Vertex AI.
 *
 * The veo skill references a scripts/veo-generate.ts that isn't shipped with
 * the installed skill, so this is a dependency-free stand-in: plain Node, no
 * npm install, auth taken from gcloud or an env var.
 *
 * Setup (once):
 *   1. Create/pick a Google Cloud project and enable the Vertex AI API.
 *   2. gcloud auth application-default login
 *   3. export GOOGLE_CLOUD_PROJECT=your-project-id
 *      export GOOGLE_CLOUD_LOCATION=us-central1   # optional, this is the default
 *
 * Usage:
 *   node tools/veo-generate.mjs \
 *     --prompt "your validated prompt" \
 *     --aspect-ratio 16:9 --duration 4 --resolution 720p \
 *     --output assets/video/hero.mp4
 *
 * Cost is roughly $0.50 per clip and generation takes 2-4 minutes.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(`--${name}`); }

const prompt      = arg("prompt");
const aspectRatio = arg("aspect-ratio", "16:9");
const duration    = parseInt(arg("duration", "4"), 10);
const resolution  = arg("resolution", "720p");
const output      = arg("output", "./veo-output.mp4");
const model       = arg("model", "veo-3.1-generate-001");
const seed        = arg("seed");
const audio       = flag("audio");

const project  = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

if (!prompt) { console.error("Missing --prompt"); process.exit(1); }
if (!project) {
  console.error("GOOGLE_CLOUD_PROJECT is not set. See the setup notes at the top of this file.");
  process.exit(1);
}
if (![4, 6, 8].includes(duration)) {
  console.error(`--duration must be 4, 6 or 8 (the API only accepts these). Got ${duration}.`);
  process.exit(1);
}

function accessToken() {
  if (process.env.VEO_ACCESS_TOKEN) return process.env.VEO_ACCESS_TOKEN;
  try {
    return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
      encoding: "utf8",
    }).trim();
  } catch {
    console.error(
      "Could not get a token. Either run `gcloud auth application-default login`\n" +
      "or set VEO_ACCESS_TOKEN to a valid OAuth token."
    );
    process.exit(1);
  }
}

const token = accessToken();
const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const parameters = {
  aspectRatio,
  durationSeconds: duration,
  resolution,
  generateAudio: audio,
  sampleCount: 1,
};
if (seed) parameters.seed = parseInt(seed, 10);

console.log(`Submitting to ${model} (${aspectRatio}, ${duration}s, ${resolution})...`);

const submit = await fetch(`${base}:predictLongRunning`, {
  method: "POST",
  headers,
  body: JSON.stringify({ instances: [{ prompt }], parameters }),
});

if (!submit.ok) {
  console.error(`Submit failed (${submit.status}):\n${await submit.text()}`);
  process.exit(1);
}

const { name: operationName } = await submit.json();
console.log(`Operation: ${operationName}\nPolling (this takes 2-4 minutes)...`);

const deadline = Date.now() + 10 * 60 * 1000;
let result;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));

  const poll = await fetch(`${base}:fetchPredictOperation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operationName }),
  });
  if (!poll.ok) {
    console.error(`Poll failed (${poll.status}):\n${await poll.text()}`);
    process.exit(1);
  }

  const body = await poll.json();
  if (body.error) {
    console.error(`Generation failed: ${JSON.stringify(body.error)}`);
    process.exit(1);
  }
  if (body.done) { result = body.response; break; }
  process.stdout.write(".");
}

if (!result) { console.error("\nTimed out after 10 minutes."); process.exit(1); }

const video = (result.videos || result.generatedSamples || [])[0];
if (!video) {
  console.error(`\nNo video in response:\n${JSON.stringify(result, null, 2)}`);
  process.exit(1);
}

if (video.bytesBase64Encoded) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, Buffer.from(video.bytesBase64Encoded, "base64"));
  console.log(`\nSaved ${output}`);
} else if (video.gcsUri) {
  console.log(`\nVideo written to ${video.gcsUri} (download it with: gcloud storage cp ${video.gcsUri} ${output})`);
} else {
  console.error(`\nUnrecognized video payload:\n${JSON.stringify(video, null, 2)}`);
  process.exit(1);
}
