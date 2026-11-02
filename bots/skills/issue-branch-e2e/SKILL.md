---
name: issue-branch-e2e
description: >-
  Use when the owner gives a GitHub issue or change goal and wants a
  host-machine feature branch, staged commits, and e2e screenshots without
  push/PR unless asked.
---
# Issue → host branch → staged commits → e2e screenshots

## Goal
Turn an issue or change goal into working code on the owner's **registered host checkout**, with local commits and proof screenshots. Do not push or open a PR unless they explicitly ask.

## Standing rules (from memories; ask if missing)
- **You edit directly** on the host checkout with machine-targeted tools. Do **not** hand the change off to a Cursor cloud / Origin coding agent unless the owner explicitly asks for that path.
- Edit on the host checkout they named (not only a throwaway cloud copy), unless they say otherwise.
- Default base branch is `main` (or their saved base).
- Commits use their configured git author (repo-local), never a generic agent identity.
- Never commit assistant verification skills or `.cursor` skill trees into product feature branches.
- Never `git push` / force-push / open PR unless they clearly ask in that turn.

## Steps
1. **Scope.** Read the issue or goal. Confirm acceptance criteria in one short message if anything is ambiguous enough to change the patch.
2. **Branch.** On the host checkout: fetch, update base, create `fix/<short-slug>` (or their naming) from the base branch. Stay on that branch.
3. **Implement in stages yourself.** Prefer small, reviewable commits (e.g. data/model → UI wire-up → tests/i18n). Each commit message should say why. Apply patches and edit files on the host; do not delegate the product diff to a cloud agent.
4. **Keep verification local.** If you create a verify/doctor skill for the app, keep it on the assistant side or a non-product path; do not land it on the feature branch.
5. **E2E proof.** Run the real app path they use (desktop/dev server/browser). Capture **before** (if still available) and **after** screenshots that show the acceptance criteria. Save shots + a short notes file under a workspace shots folder.
6. **Agents / keys for e2e.** If the product needs an ACP/coding agent to exercise UI, configure one using credentials the owner already has (e.g. OpenAI-compatible / GLM Coding Plan). Never write secrets into the repo; put them in the agent env/auth store only.
7. **Report.** Summarize: branch name, local commits (ahead of origin), what was proven with which screenshots, what was left out (push/PR). Offer push/PR only if they want it next.

## Done when
- Host branch has the staged commits made by you on the host, and is not pushed unless asked.
- E2E notes + screenshots cover the acceptance criteria.
- No verification skill junk in the product branch.
