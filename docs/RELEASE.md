# Preparing a release

The source package contains the current authored working-tree files, including
untracked additions. Its manifest identifies those bytes; Git HEAD alone does
not identify a package made from a dirty checkout. Runtime databases, accounts,
logs, simulation history, dependency installations and private configuration
are excluded. Packaging rejects missing required source targets and unsupported
file types. Review the manifest before distributing a candidate.

## Package and verify

Use Node 22.5 or newer and npm. Freeze source edits before packaging, choose a
new output directory, and keep the archive, sidecar manifest and verification
logs together. Packaging refuses to overwrite either output.

```sh
npm run package:release -- --out artifacts/releases/<candidate>/source.tar.gz --json
mkdir /tmp/dragonrealms-candidate
tar -xzf artifacts/releases/<candidate>/source.tar.gz -C /tmp/dragonrealms-candidate
cd /tmp/dragonrealms-candidate
node --input-type=module -e 'import { verifyExtractedRelease } from "./scripts/lib/release-package.mjs"; const r = verifyExtractedRelease(process.cwd()); if (!r.ok) throw Error(r.errors.join("\n")); console.log(r);'
npm ci --ignore-scripts
npm run doctor
npm audit --omit=dev
DR_VERIFY_BROWSER_DRIVER=ego npm run verify:release -- --report /tmp/candidate-verification.json
```

The release gate runs syntax checks, the full test suite, content and command
audits, module and documentation checks, plus wire capture/replay and browser
regression against disposable worlds. It never needs the shared development
world. The Ego browser driver requires the configured browser runtime; the
default driver requires Chromium. Read the receipt and accompanying log: all
checks must pass, none may be skipped, counts must be known, and the scoped
source identity must remain stable. Capture/replay on the same source checks
repeatability; it is not a comparison with an earlier release.

On macOS, verify the optional operator app from the extracted candidate with
`bash scripts/build-admin-app.sh`. Generated binaries are separate artifacts;
the source archive contains the Swift source and build script.

Release packaging and automated tests establish source completeness and tested
behavior. They do not establish live progression pacing. Keep bounded simulator
results and matched comparison evidence separately, as described in the
[project guide](README.md#operations-and-evidence).

## Launch and recovery

Start an extracted, installed candidate with `npm start`. For a public world,
configure the [public launch profile](LAUNCH-PROFILES.md), dedicated GM credentials
and allowed browser origins. Keep private configuration outside the source
archive. Check the configured origin, authentication and read-only GM surfaces
before opening the world to players.

Back up an existing world using the [recovery procedure](RECOVERY.md) before an
upgrade. Keep the prior source package and database snapshot. Restore into a
new database path for a rollback; do not overwrite a running world's database.
Normal shutdown flushes player state before closing SQLite.
