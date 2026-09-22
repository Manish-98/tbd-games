# GitHub Pages deployments

The repository uses GitHub Pages with a dedicated `gh-pages` publishing branch.

## Production

`main` is the only source of production deployments.

A push to `main` runs `.github/workflows/deploy-production.yml` and synchronizes the site into the root of `gh-pages`.

Production URL:

`https://manish-98.github.io/tbd-games/`

## Pull request previews

Open, reopened, and updated pull requests run `.github/workflows/deploy-preview.yml`.

Each PR is published at:

`https://manish-98.github.io/tbd-games/pr-preview/pr-<PR_NUMBER>/`

For example, PR #42 is available at:

`https://manish-98.github.io/tbd-games/pr-preview/pr-42/`

Updating a PR replaces the contents of its existing preview. Closing a PR removes its preview.

Preview deployment is intentionally separate from the production root, so merging is still the only path that changes the production site.

### Preview smoke test

To verify a preview before merging:

1. Confirm the **Deploy PR Preview** workflow succeeds for the PR.
2. Open the PR-specific preview URL.
3. Push another commit to the same PR and confirm the same URL reflects the update.
4. Confirm the production URL is unchanged.
5. Close the PR and confirm its preview is removed.

## One-time GitHub Pages configuration

After these workflows are merged, configure GitHub Pages to use the `gh-pages` branch as its publishing source:

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, select **Deploy from a branch**.
3. Select branch **gh-pages** and folder **/(root)**.
4. Save.

The workflows create `gh-pages` on their first deployment if it does not already exist.

## Notes

- This project is a static site and has no build step, so deployment copies the repository files directly.
- The deployment workflows use a shared concurrency group so production and preview updates cannot publish to `gh-pages` concurrently.
- PR previews are intended for repository branches with write access. Fork PRs may not receive a write-capable `GITHUB_TOKEN`, so their preview deployment is not guaranteed.
