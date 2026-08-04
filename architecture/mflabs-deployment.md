# mflabs deployment (fork-specific — not for upstream)

This file is deliberately self-contained: it is the only place in the repo
that references Merlin's personal infrastructure. Upstream can delete this
single file and nothing else in the docs changes.

The fork runs live at **https://skyviewer.mflabs.dev**, deployed to the
`mflabs-apps` Hetzner box managed by `~/git/mflabs-infra` (branch
`skyviewer` there; see that repo's CLAUDE.md for the box itself).

## Deploy flow

- Deployable checkout: `~/git/skyviewer-client`, tracking the fork's `main`
  (which contains all topic branches merged, including the Dockerfile
  self-containment fix the standalone image needs).
- Update cycle: push to the fork → `git pull` in `~/git/skyviewer-client` →
  `python deploy.py skyviewer` in `~/git/mflabs-infra`.
- deploy.py rsyncs the checkout to `/opt/skyviewer` on the box (excluding
  `node_modules`/`.next`/`.env`), scps
  `~/secrets/mflabs-infra/skyviewer.env` to `/opt/skyviewer/.env` (the
  Dockerfile bind-mounts it at build; compose `env_file`s it at runtime —
  the env schema validates at server boot too), and runs
  `docker compose up -d --build`.
- Caddy terminates TLS internally; Cloudflare proxies `skyviewer.mflabs.dev`
  (proxied AAAA → the box's IPv6, SSL mode Full). Scoped deploys don't
  reload Caddy — reload manually after Caddyfile changes.
- The box stores no survey data: visitors' browsers fetch HiPS tiles
  straight from `images.rubinobservatory.org`, and CMS reads go to Rubin's
  `api.skyviewer.app`. Nothing in `skyviewer.env` is a real secret.

## Historical branches

Before everything merged to `main` (August 2026), the VPS ran
`u/mfl/mflabs-deploy` = `deploy` (a cherry-picked integration branch) plus
the Dockerfile fix. Both remain on the remote, frozen, for archaeology; the
Dockerfile fix now lives on `u/mfl/docker-self-contained` and in `main`.

## Local 55 GB HiPS mirror

The full tile mirror lives at `~/lsst/skyviewer-data` on Merlin's Mac
(built/verified by `mirror_hips.py` in that directory) and is served in
local dev via `HIPS_DATA_DIR` — see `deployment.md` for the generic
mechanism. The VPS does not carry the mirror (40 GB disk).
