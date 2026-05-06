# Solo Clearance Product Redesign Design

Date: 2026-05-06

## Summary

Redesign the current Chinese Eight Ball demo into a complete single-player product while preserving the working Babylon.js rendering, Rapier physics, and tested game-core modules. The first product version focuses on a realistic-feel solo clearance mode: the player opens the rack, clears one assigned group, then clears the eight ball. Fouls provide feedback and ball-in-hand instead of ending the session.

The redesign keeps the core simulation testable and moves product concerns into clear modules for routing, settings, solo-session state, HUD rendering, input commands, and scene adaptation.

## Current Project Context

The project is a Vite + TypeScript browser app. It already has:

- `@babylonjs/core` for the 3D table scene.
- `@dimforge/rapier3d-compat` for fixed-step physics.
- Core game modules under `src/game`.
- Existing tests for controls, geometry, rules, and physics.
- A single large `EightBallApp.ts` that currently owns DOM rendering, input, game state, scene coordination, shot flow, and HUD updates.

`npm test` and `npm run build` pass before this redesign. The current workspace is not a Git repository, so the design document cannot be committed unless the workspace is initialized as Git later.

## Goals

- Build a complete product shell with homepage, mode selection, settings, rules, game, and current-session stats screens.
- Make the primary mode single-player solo clearance.
- Preserve realistic feel by default: minimal visual assists, strong camera and stroke control, and no forced training rails.
- Allow optional assists through settings: prediction line and landing hint default off, while aim direction and foul hints default on.
- Retain the current Babylon/Rapier foundation and existing core tests where possible.
- Split the current app controller into smaller, testable modules with clear ownership.
- Keep first-version stats lightweight: current-session overview only, no saved history.

## Non-Goals

- No online multiplayer.
- No AI opponent.
- No persistent player profile or historical statistics.
- No full training-course system or predefined shot curriculum.
- No large rewrite of the physics engine unless required by integration issues.
- No mobile-first experience. Coarse-pointer devices may still show an unsupported or limited-use message.

## Product Flow

The first-version navigation flow is:

1. Homepage: continue current session if available, start a new solo clearance session, open settings, open rules.
2. Mode selection: show solo clearance as the available playable mode and leave room for later modes.
3. Settings: configure assists, feel, and camera behavior.
4. Rules: explain solo clearance goals, grouping, black-eight phase, foul behavior, and ball-in-hand.
5. Game: play the full single-player clearance session.
6. Stats: show current-session overview.

The homepage is functional rather than marketing-oriented. The product should open into something that helps the user start playing quickly.

## Solo Clearance Rules

Solo clearance keeps the eight-ball sequence but removes opponent win/loss pressure.

Session phases:

- `ready`: table is prepared and the player can start the opening shot.
- `break`: opening shot is being played and recorded.
- `open`: group is not yet assigned.
- `groupClear`: player clears the assigned group.
- `eight`: player has cleared the assigned group and now targets the eight ball.
- `complete`: session is complete and current-session stats are shown.

Opening and grouping:

- After the break, the session enters open-table play.
- A legal pocketed solid or stripe assigns the player to that group.
- If both groups are pocketed on the same assigning shot, the first legal group determined from the shot result assigns the group.
- The opposite group remains visible for context but is not an opponent target.

Fouls:

- Fouls are recorded and shown to the player.
- Fouls do not fail the session.
- A foul grants ball-in-hand and keeps the current clearance objective active.
- Examples include cue ball pocketed, cue ball off table, no first contact, wrong first contact, object ball off table, and no object ball or rail after contact.

Eight ball:

- The eight phase begins when the assigned group is cleared.
- Early eight-ball pocketing is treated as a serious foul, not a session failure.
- On early eight-ball pocketing, the physics layer respots the eight at the first valid point from a deterministic respot list that starts with the original rack position. If no candidate is valid, the current rack resets, the foul is recorded, and the player continues from `ready`.
- Solo clearance does not require called-pocket enforcement in the first version. The existing called-pocket panel should be hidden or disabled for this mode.

## UI Design

The UI should feel like a focused billiards simulator, not a landing page. It should be quiet, dense enough to scan, and should not compete with the table.

Screens:

- Homepage: title, primary start action, continue action when a session exists, settings, rules, stats.
- Mode selection: solo clearance card with a short description and start action.
- Settings: assist toggles, feel controls, camera controls.
- Rules: concise explanation of the solo clearance rules and controls.
- Game: full-screen table with edge HUD and compact controls.
- Stats: current-session overview only.

In-game HUD:

- Top: elapsed time, shot count, foul count, current phase.
- Left: assigned group, remaining target balls, eight-ball readiness.
- Right: stroke controls for power, spin, cue elevation, and key action buttons.
- Bottom: current shot feedback, foul messages, ball-in-hand state, and eight-phase message.
- Pause menu: resume, settings, rules, current stats, restart, return home.

The HUD must not obscure the central table view. Controls should keep stable dimensions so labels, icons, and dynamic values do not shift layout during play.

## Settings

Settings are grouped into assists, feel, and camera.

Assists:

- Aim guide: on by default.
- Prediction line: off by default.
- Landing hint: off by default.
- Foul hints: on by default.

Feel:

- Stroke power curve: two-option segmented control, `realistic` by default and `stable` as the alternate.
- Spin sensitivity: slider from 0.5 to 1.5, default 1.0.
- Cue elevation sensitivity: slider from 0.5 to 1.5, default 1.0.

Camera:

- Orbit sensitivity: slider from 0.5 to 1.5, default 1.0.
- Aim sensitivity: slider from 0.5 to 1.5, default 1.0.
- Default camera stance: segmented control with `stand`, `low`, and `aim`.
- Crouch/low-view preference: persisted boolean, default off.

Settings should apply immediately. Assist settings must only change visibility or feedback and must not change the physical shot result. Feel settings may change input mapping but should be explicit and testable.

## Architecture

The redesign should avoid replacing `EightBallApp.ts` with another large controller. Responsibilities should be split into modules.

Proposed module groups:

- `src/app`: application bootstrap, screen routing, app-level state, settings storage.
- `src/modes/solo-clearance`: solo session state machine, shot settlement, current-session stats.
- `src/ui`: screen components, HUD model rendering, menu panels, settings panels.
- `src/input`: keyboard and pointer event handling, command mapping, mode guards.
- `src/rendering`: Babylon scene adapter, camera coordination, assist visual toggles.
- `src/game`: existing physics, rules, geometry, constants, and game-core types.

Key units:

- `AppRouter`: owns current screen and navigation commands.
- `SettingsStore`: owns defaults, validation, and localStorage persistence for settings only. It does not persist full rack state.
- `SoloClearanceSession`: owns solo phase, target group, foul handling, ball-in-hand state, and session completion.
- `SessionStats`: owns shot count, foul count, pocketed count, elapsed time, and best current run.
- `InputController`: converts raw keyboard/pointer events into domain commands.
- `ShotController`: starts shots, waits for physics to settle, receives `ShotResult`, and calls the solo session.
- `SceneAdapter`: exposes scene operations to the app without leaking Babylon internals everywhere.

## Data Flow

There are two separate flows.

Per-frame flow:

1. Physics advances with a fixed timestep.
2. Ball snapshots are read from physics.
3. Scene adapter syncs ball positions.
4. Camera state and assist visibility are applied.
5. The scene renders.

Per-shot flow:

1. Input creates an aim, power, spin, and elevation command.
2. Shot controller validates that balls are still and the session accepts a shot.
3. Physics receives the stroke.
4. When balls stop, physics produces `ShotResult`.
5. Solo clearance session settles the shot.
6. Session stats update.
7. HUD model updates.
8. Ball-in-hand or next-shot mode is selected.

UI should consume view models rather than mutating physics or rules directly.

## Error Handling

Recoverable cases:

- Invalid cue-ball placement: keep ball-in-hand active and show a placement message.
- Shot attempted while balls are moving: ignore the command and show no disruptive error.
- Settings value outside accepted range: clamp or return to default.
- Unsupported coarse-pointer environment: show a clear desktop-browser requirement.
- Missing optional assist data: hide the assist rather than blocking play.

Initialization failures:

- Rapier initialization failure: show an error screen with retry.
- Babylon engine or canvas creation failure: show an error screen.
- Missing required DOM container during development: throw a clear error.

State consistency failures:

- If solo session state and physical balls become irreconcilable, reset the current rack and show a concise message.
- The app should prefer a playable reset over a blank or stuck screen.

## Testing Strategy

Keep existing tests:

- `controls.test.ts`
- `geometry.test.ts`
- `rules.test.ts`
- `physics.test.ts`

Add tests for product behavior:

- Solo clearance state transitions: ready, break, open, group clear, eight, complete.
- Group assignment from the first legal open-table pocket.
- Fouls becoming ball-in-hand without ending the session.
- Eight-ball phase entry after assigned group clearance.
- Session stats updates after legal shots, misses, fouls, and completion.
- Settings defaults and validation.
- Assist visibility mapping from settings to scene adapter inputs.
- Input command guards for aiming, placing the cue ball, shooting, and paused/game states.
- HUD model mapping for phase, target, foul message, stats, and ball-in-hand.

Verification commands:

- `npm test`
- `npm run build`

Manual browser QA:

- Start a solo clearance session from the homepage.
- Toggle assists and confirm scene visibility changes.
- Play through break, group assignment, foul, ball-in-hand, group clearance, and eight phase.
- Confirm current-session stats update and reset correctly.

## Implementation Boundaries

The implementation plan should start with tests for solo session behavior and settings defaults before moving product code. The first implementation slice should not tune physics unless an integration issue requires it. Refactoring should move responsibilities in small steps so existing passing tests remain meaningful throughout the rewrite.

The first version is complete when the user can open the app, navigate through the product shell, start solo clearance, play with realistic default assists, use ball-in-hand after fouls, finish the session by clearing the assigned group and eight ball, and view current-session stats.
