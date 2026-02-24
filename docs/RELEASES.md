# Releases

## URLs
- Staging: https://www.terapixel.games/staging/
- Production: https://www.terapixel.games/

## Deployment Model
- Push to `main` triggers `Deploy Staging`, which publishes build output to `/staging/` on `gh-pages`.
- Push tag `v*` triggers `Deploy Production`, which publishes build output to `/` on `gh-pages`.
- Production deploy preserves `/staging/` for ongoing rehearsal.

## Cut a Release
1. Ensure the target commit is on `main` and verified on staging.
2. Create and push a semantic version tag on that commit:
   - `git checkout main`
   - `git pull origin main`
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
3. Monitor `Deploy Production` workflow.
4. Verify production URL and capture verification notes in the related Issue/PR.

## Failure Handling
- If staging deploy fails, `Deploy Failure To Issue` creates or updates a staging failure Issue.
- If prod deploy fails, `Deploy Failure To Issue` creates or updates a prod failure Issue.
- Incident owner defaults to `agent:devops`.
