"""Entry point for the basic Pygame window loop."""

import sys
import pygame

WINDOW_SIZE = (800, 600)
WINDOW_TITLE = "Starter Game Window"
BACKGROUND_COLOR = pygame.Color("#1e1e1e")
FRAME_RATE = 60

def init_pygame() -> pygame.Surface:
    """Initialize Pygame and create the main window surface."""
    pygame.init()
    screen = pygame.display.set_mode(WINDOW_SIZE)
    pygame.display.set_caption(WINDOW_TITLE)
    return screen

def handle_events() -> bool:
    """Process events. Return False when the window should close."""
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            return False
    return True

def main() -> None:
    """Run the main loop for the starter game window."""
    screen = init_pygame()
    clock = pygame.time.Clock()

    running = True
    while running:
        running = handle_events()

        screen.fill(BACKGROUND_COLOR)

        pygame.display.flip()
        clock.tick(FRAME_RATE)

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
