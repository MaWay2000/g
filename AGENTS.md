# AGENTS.md

## Project overview

This is a browser-based 3D sci-fi / Mars game hosted with GitHub Pages.

Live page:
https://maway2000.github.io/g/game.html

The project is mostly plain HTML, CSS, JavaScript, and Three.js/WebGL.
The live game includes:
- 3D/WebGL scene
- player movement
- settings panel
- performance/FPS options
- sky/star settings
- inventory
- drone/mining/resource tools
- mission/terminal panels
- local save/progress systems

## Main rule

Do not rewrite the project.

This repo has many connected systems. Fixing one bug must not break another system.

Every task must be small, focused, and minimal.

## Very important behavior rules

- Do not refactor unless the task explicitly asks for refactoring.
- Do not rename existing functions, variables, IDs, classes, files, or modules unless required.
- Do not change working UI layout unless the task is specifically about UI.
- Do not change player controls unless the task is specifically about controls.
- Do not change inventory logic unless the task is specifically about inventory.
- Do not change save/localStorage logic unless the task is specifically about saving.
- Do not change WebGL/Three.js initialization unless the task is specifically about rendering startup.
- Do not replace existing systems with new systems.
- Do not remove features because they look unused.
- Do not “clean up” unrelated code.
- Do not make broad style changes.
- Do not update dependencies unless explicitly asked.
- Do not add new libraries unless explicitly asked.
- Do not convert the project to React/Vite/TypeScript unless explicitly asked.

## Patch size rule

For normal bug fixes:
- Prefer editing 1 file.
- Avoid editing more than 2 files.
- If more than 2 files seem necessary, stop and explain why before changing them.
- Keep diffs small.
- Prefer surgical patches over rewrites.

## Before editing

Before modifying files, Codex must first identify:

1. The exact bug or requested change.
2. The smallest file area likely responsible.
3. Which systems must not be touched.
4. A short patch plan.

For complex bugs, first return analysis only. Do not edit files in the same step unless the user asked for direct implementation.

## Testing checklist

After every change, verify these manually or with available commands:

- Page still loads.
- No new browser console errors.
- WebGL initialization still works when GPU/WebGL is available.
- Existing settings panel still opens.
- FPS/performance settings still work.
- Player movement still works.
- Inventory panel still opens.
- Mission/terminal panels still open.
- Local progress/save behavior is not broken.
- Mobile/responsive layout is not made worse.

If browser-based testing is not available in the Codex environment, say that clearly and explain what was checked instead.

## JavaScript style

- Use existing code style.
- Prefer plain JavaScript.
- Avoid clever abstractions.
- Keep functions readable.
- Add comments only for non-obvious logic.
- Do not introduce global variables unless the existing file already uses that pattern and it is necessary.
- Preserve existing event listeners and DOM IDs.
- Preserve existing localStorage keys.

## Three.js / WebGL rules

- Do not recreate renderer/camera/scene architecture unless asked.
- Do not change render loop timing unless asked.
- Do not change camera/player physics unless asked.
- Do not increase draw calls unnecessarily.
- Prefer performance-safe fixes.
- Be careful with texture/model loading paths because GitHub Pages is case-sensitive.

## UI rules

- Keep current sci-fi/Mars game style.
- Do not redesign menus unless asked.
- Do not remove buttons, panels, or options.
- If adding a control, place it near related controls.
- Keep labels simple and visible.
- Do not break small-screen layout.

## Save/progress rules

- Treat localStorage/save data as important.
- Do not rename save keys.
- Do not reset user progress.
- Do not change storage format unless the task explicitly asks for migration.
- If storage format must change, provide backward compatibility.

## GitHub Pages rules

This project runs on GitHub Pages.

- Use relative paths where possible.
- File and folder names are case-sensitive.
- Do not rely on server-side PHP or Node.js.
- Do not require build tools unless explicitly asked.
- The final project should work as static files.

## Debugging rules

When fixing a bug:

1. Reproduce or locate the likely cause.
2. Fix the cause, not only the symptom.
3. Avoid touching unrelated systems.
4. Explain what changed.
5. Explain how to test it.

## Forbidden Codex behavior

Codex must not:

- Rewrite whole `game.html` for a small bug.
- Replace the whole game loop.
- Replace working controls.
- Remove old features to simplify the code.
- Add frameworks.
- Add package managers.
- Make huge formatting-only diffs.
- Change many files without a clear reason.
- Claim something is tested if it was not tested.

## Definition of done

A task is done only when:

- The requested issue is fixed.
- Existing major systems still work.
- The diff is minimal.
- The answer includes changed files.
- The answer includes testing performed.
- The answer includes any known risks or untested parts.

## Preferred final response format

After coding, respond with:

1. Summary
2. Changed files
3. What was fixed
4. What was not changed
5. Tests/checks performed
6. Known risks

If no browser playtest was run, include:
`Known risks: I did not run a browser playtest here.`
