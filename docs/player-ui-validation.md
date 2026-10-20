# Player toolbar and game instructions

## Source verification

The website changes do not modify game builds. Instructions were checked against current game source, accessed read-only:

- LumaRush `71bb381dab1fe1fc9b78ce34d65b140d528438ca`: `src/game/BoardView.gd` (`_input`, `_click_position_from_event`, `_handle_click`), `src/core/Board.gd` (`find_group`, `_clear_group`), and `src/config/FeatureFlags.gd` (`MIN_MATCH_SIZE = 3`). Mouse presses and screen touches select edge-connected matching groups. Remote HEAD matched the existing local source via the TeraPixelGames SSH identity.
- Color Crunch `eb5c190489e6068ebb13cf686fe6fae25e861e86`: `src/game/BoardView.gd` (4×4 defaults, arrow/WASD keys, touch swipes, left-mouse press/release dragging), `src/core/Board.gd` (`move`, `_slide_line`, `spawn_tile`). Equal levels merge and successful moves spawn a tile.
- Worm Breaker `238702ebe21b953576474628a015460dbcc40593`: `src/game/RotInput.gd` (Left/Right and A/D, horizontal screen dragging), `src/game/GameController.gd` (`_step_paddle`, `_step_ball`, brick and paddle collision handling). No mouse or tilt claim is made because this input implementation does not establish them.

## Validation

Run `npm test` and `ASTRO_TELEMETRY_DISABLED=1 npm run build` with Node 22.12+.

Chrome checks used the built local site, with no live login submissions:

- 1440×900 desktop: home and game toolbar, auth dialog, Tab/Shift+Tab wrapping, Escape and focus return.
- 390×844 mobile: home and game toolbar, auth dialog, Details navigation to Color Crunch `#game-info` (information container at viewport top; document width 390px).
- 320×740 narrow mobile: game toolbar fits within the viewport; dialog and Escape dismissal checked.
- Authenticated label, account-link visibility, and initial dialog focus use isolated jsdom state, not a live account.

Screenshots are retained in the task workspace's sibling `screenshots/` folder. The local build has no identity endpoint configuration, so the dialog correctly reports that login is not configured. End-to-end authentication and physical mobile keyboard behavior were not exercised. Existing embedded game behavior is outside this patch.

## Publication safety

`deploy-staging.yml` and `deploy-edge-router.yml` push triggers target `main`; production deploys target version tags (`v*`) or manual dispatch. Game-sync and access-setup workflows use manual/repository dispatch. The review branch does not match those deployment triggers. The PR lifecycle workflow only updates linked issue labels; this PR does not link a closing issue.

Dependency installation reported 12 audit findings (1 low, 10 high, 1 critical), present before adding the test dependency as well. Dependency remediation is outside this UI patch.
