# Regression Checklist

Run this checklist before release or after touching gameplay/state logic.

## 1. Oxygen and Recovery
- Start on a surface area and verify oxygen drains while moving.
- Stop moving on the surface and verify drain rate visibly lowers.
- Enter a no-drain/safe area and verify oxygen regenerates.
- Force oxygen to 0% and verify emergency flow triggers (chamber or safe-floor fallback).
- Wait for chamber recovery completion and verify oxygen returns to 10%.

## 2. Mission Completion Flow
- Open missions and verify active mission cards render with requirement text.
- Complete a mission with enough resources and verify reward currency increases.
- Verify a pending mission is promoted into an active slot after completion.
- Try to complete without required resources and verify UI blocks completion.

## 3. News Modal (GitHub Commit Feed)
- Open quick-access News and verify loading subtitle appears first.
- Verify commit list renders entries and "latest" card appears when data exists.
- Simulate offline/network failure and verify fallback subtitle appears without crash.

## 4. Local Storage Resilience
- In normal browser mode, verify state persists across refresh (inventory/oxygen/todos/model editor session).
- In a mode that blocks storage (or with storage disabled), verify no hard crash on save/restore/clear actions.
- Specifically in model editor, click "Clear session" and verify user gets status feedback even when storage is blocked.

## 5. Outside Map / Placement Persistence
- Place or move an outside object, reload, and verify transform persists.
- Mine/deplete terrain, reload, and verify depleted state is preserved.
- Resize relevant map area in map maker, reload game, and verify dimensions are respected.
