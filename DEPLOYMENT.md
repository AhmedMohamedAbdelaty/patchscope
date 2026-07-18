# How Patchscope reaches Deno Deploy

## The model

A Deno Deploy **app** owns configuration, environment variables, domains, and
build history. Each successful build creates an immutable **revision**. A
**timeline** chooses which revision receives traffic; Patchscope's public domain
points at the active revision on the production timeline.

That separation makes rollback fast. Changing the active production revision
does not require rebuilding old code.

## Current Patchscope flow

```text
local commit -> GitHub push -> Deno GitHub integration -> revision -> timeline
```

The Deno app is linked to `AhmedMohamedAbdelaty/patchscope`. Each push creates a
revision automatically. The default branch routes successful builds to the
Production timeline; other branches receive branch and preview URLs.

The CLI remains a recovery path for deliberate manual redeployment:

```sh
deno deploy . \
  --org ahmedmohamedabdelaty \
  --app patchscope \
  --prod
```

Normal releases do not run that command. Test, commit, and push; Deno checks out
the GitHub commit, builds it, and routes it only after every build stage passes.

## What the build screen means

1. **Queue** waits for a builder.
2. **Prepare** uploads or checks out source and restores caches.
3. **Install** runs `deno install`.
4. **Build** runs `deno task build`; Fresh and Vite create the client and server
   artifact.
5. **Deploy** starts the artifact and routes the selected timeline to it.

Patchscope needs the 3 GiB builder setting. That memory belongs to the temporary
build machine, not each request-serving runtime. The earlier 1 GiB failure
happened during Fresh artifact finalization after Vite had compiled
successfully.

## Configuration and secrets

`deno.json` identifies the organization, app, and Fresh framework preset. The
dashboard currently supplies the build commands and 3 GiB build-memory setting.
The runtime uses its separate 768 MiB default memory limit.

`GITHUB_TOKEN` is optional. If added, store it as a secret in the Production and
Development contexts, never in the repository:

```sh
deno deploy env add GITHUB_TOKEN "github_pat_..." --secret \
  --org ahmedmohamedabdelaty \
  --app patchscope
```

Build, Production, and Development are separate environment contexts. A build
secret is not automatically available to the running production service.

## Release checks

```sh
deno task test
deno task check
deno task build
git push origin main
curl -fsS https://patchscope.ahmedmohamedabdelaty.deno.net/health
```

The health response exposes `DENO_DEPLOY_BUILD_ID`, so the deployed revision can
be matched to the GitHub-triggered build. A failed build never receives
production traffic. Deno's build page records the source commit and trigger.

Current platform references:

- [Builds and revisions](https://docs.deno.com/deploy/reference/builds/)
- [Timelines and rollback](https://docs.deno.com/deploy/reference/timelines/)
- [Environment contexts](https://docs.deno.com/deploy/reference/env_vars_and_contexts/)
- [`deno deploy` CLI](https://docs.deno.com/runtime/reference/cli/deploy/)
