# Open this project in Codex

GitHub repository: Hamish87/-trimble-forestry-challenge- (private).

1. Create the empty GitHub repository, or use a repository you already own.
2. Unzip this export and push the contents of this folder to that repository. The repository root should contain package.json, AGENTS.md and dist/, not another nested project folder.
3. In ChatGPT on the web or desktop, choose Work in > Cloud > Select environment > Create environment. Select this GitHub repository and choose Get started. Review the setup/tests, publish the environment, then start a task. Authorise access to the new repository if it is not listed.
4. For local Codex, open this folder in your editor or Codex client and use the same files and task prompt.

Setup command: npm ci
Preview command: npm run dev
Verification command: npm test

## First task prompt

Read AGENTS.md and docs/CFHARVEST_PLANNING_PLAN.md. Implement the first planning-workspace milestone: connected work-order list, map, machine schedule and digital handover inspector. Use existing simulation state, preserve all four journey stages and DE/EN/FR support, and retain Trimble blues. Distinguish demo assumptions from documented CFHarvest capabilities. Run the relevant checks and open a pull request with the changes and test results.

## Source provenance

Exported from Trimble Forestry · Forst Challenge, Site appgprj_6abcc3d5c7fc819189c13d32b94aabb4, version 10, source commit a4d22bfb633fe53a809931057218813706b11326. The source has been prepared for import into the private GitHub repository. The Codex cloud environment still needs to be selected or created in your account.

Live Site: https://trimble-forst-challenge.hamish-bruce87.chatgpt.site
Official Codex Cloud guidance: https://learn.chatgpt.com/docs/cloud

## Generated files and reference material

`npm ci` runs the prepare step to build the embedded scene bundle. `dist/scenes.js` is generated from `src/scenes.js` and the six original WebP files, which are included. Run `npm run build` after changing those sources. Python 3 is required. The reference PDF was excluded from this GitHub import after automatic approval review rejected uploading that document; the app retains the public product-page link instead.
