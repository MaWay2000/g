"""Simple arcade-style dodging game built with pygame.

Run the module with ``python main.py`` to start the game locally. Use the
instructions in ``README.md`` to package it into a standalone ``.exe``.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
import pygame

# Constants defining the game layout and pacing.
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
FPS = 60
PLAYER_SPEED = 6
METEOR_SPAWN_INTERVAL = 800  # milliseconds
METEOR_MIN_SPEED = 3
METEOR_MAX_SPEED = 8

# Colors used in the UI.
COLOR_BACKGROUND = (10, 10, 30)
COLOR_PLAYER = (240, 240, 255)
COLOR_METEOR = (255, 120, 50)
COLOR_TEXT = (250, 250, 250)
COLOR_OVERLAY = (20, 20, 40, 200)


@dataclass
class Meteor:
    """Represents a single falling meteor."""

    rect: pygame.Rect
    speed: int

    def update(self) -> None:
        """Move the meteor downward based on its speed."""
        self.rect.y += self.speed

    def is_off_screen(self) -> bool:
        """Return True when the meteor has left the visible play area."""
        return self.rect.top > WINDOW_HEIGHT


class SpaceDodgerGame:
    """Encapsulates the Space Dodger game state and logic."""

    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("Space Dodger")
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("arial", 28)
        self.big_font = pygame.font.SysFont("arial", 64, bold=True)

        player_width, player_height = 60, 20
        self.player = pygame.Rect(
            WINDOW_WIDTH // 2 - player_width // 2,
            WINDOW_HEIGHT - player_height * 2,
            player_width,
            player_height,
        )

        self.meteors: list[Meteor] = []
        self.meteor_timer = 0
        self.running = True
        self.game_over = False
        self.score = 0.0
        self.best_score = 0.0

    def spawn_meteor(self) -> None:
        width = random.randint(30, 60)
        height = random.randint(20, 40)
        x_pos = random.randint(0, WINDOW_WIDTH - width)
        meteor_speed = random.randint(METEOR_MIN_SPEED, METEOR_MAX_SPEED)
        meteor_rect = pygame.Rect(x_pos, -height, width, height)
        self.meteors.append(Meteor(rect=meteor_rect, speed=meteor_speed))

    def handle_input(self) -> None:
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.player.x -= PLAYER_SPEED
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.player.x += PLAYER_SPEED

        # Clamp the player's rectangle inside the visible area.
        self.player.left = max(0, self.player.left)
        self.player.right = min(WINDOW_WIDTH, self.player.right)

    def update_meteors(self, delta: float) -> None:
        for meteor in self.meteors:
            meteor.update()

        # Remove meteors that have moved off-screen to keep the list small.
        self.meteors = [meteor for meteor in self.meteors if not meteor.is_off_screen()]

        # Spawn new meteors at random intervals.
        self.meteor_timer += delta
        if self.meteor_timer >= METEOR_SPAWN_INTERVAL:
            self.spawn_meteor()
            self.meteor_timer = 0

    def check_collisions(self) -> None:
        for meteor in self.meteors:
            if self.player.colliderect(meteor.rect):
                self.game_over = True
                self.best_score = max(self.best_score, self.score)
                break

    def reset(self) -> None:
        self.meteors.clear()
        self.meteor_timer = 0
        self.score = 0.0
        self.game_over = False
        self.player.centerx = WINDOW_WIDTH // 2

    def draw_background(self) -> None:
        self.screen.fill(COLOR_BACKGROUND)

    def draw_player(self) -> None:
        pygame.draw.rect(self.screen, COLOR_PLAYER, self.player, border_radius=6)

    def draw_meteors(self) -> None:
        for meteor in self.meteors:
            pygame.draw.rect(self.screen, COLOR_METEOR, meteor.rect, border_radius=4)

    def draw_score(self) -> None:
        score_surface = self.font.render(f"Score: {int(self.score)}", True, COLOR_TEXT)
        best_surface = self.font.render(f"Best: {int(self.best_score)}", True, COLOR_TEXT)
        self.screen.blit(score_surface, (20, 20))
        self.screen.blit(best_surface, (20, 60))

    def draw_game_over(self) -> None:
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        overlay.fill(COLOR_OVERLAY)
        self.screen.blit(overlay, (0, 0))

        title_surface = self.big_font.render("Game Over", True, COLOR_TEXT)
        title_rect = title_surface.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 40))
        self.screen.blit(title_surface, title_rect)

        info_lines = [
            "Press R to restart",
            "Press ESC to quit",
        ]
        for index, line in enumerate(info_lines):
            text_surface = self.font.render(line, True, COLOR_TEXT)
            rect = text_surface.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20 + index * 40))
            self.screen.blit(text_surface, rect)

    def process_events(self) -> None:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.running = False
                elif event.key == pygame.K_r and self.game_over:
                    self.reset()

    def run(self) -> None:
        while self.running:
            delta_ms = self.clock.tick(FPS)
            delta_seconds = delta_ms / 1000

            self.process_events()

            if not self.game_over:
                self.handle_input()
                self.update_meteors(delta_ms)
                self.check_collisions()
                self.score += delta_seconds * 10

            self.draw_background()
            self.draw_player()
            self.draw_meteors()
            self.draw_score()
            if self.game_over:
                self.draw_game_over()

            pygame.display.flip()

        pygame.quit()


def main() -> None:
    """Entry point used by ``python main.py`` and PyInstaller."""

    game = SpaceDodgerGame()
    game.run()


if __name__ == "__main__":
    main()
