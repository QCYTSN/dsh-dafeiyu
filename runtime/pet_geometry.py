"""Keep the character anchored while its status card changes size."""

from __future__ import annotations


def position_window(
    pet_position: tuple[int, int],
    pet_size: tuple[int, int],
    window_size: tuple[int, int],
    screen: tuple[int, int, int, int] | None,
    card_height: int = 0,
) -> tuple[int, int, int, int]:
    """Return window x/y and pet x/y, clamping the pet only at screen edges.

    Put the card below the pet when there is no room above it. Clamping the
    container must never rewrite a valid character position.
    """
    pet_x, pet_y = pet_position
    pet_width, pet_height = pet_size
    width, height = window_size
    center_offset = (width - pet_width) // 2
    top_offset = height - pet_height - 8
    if screen is None:
        return pet_x - center_offset, pet_y - top_offset, pet_x, pet_y

    left, top, screen_width, screen_height = screen
    pet_x = min(max(pet_x, left), max(left, left + screen_width - pet_width))
    pet_y = min(max(pet_y, top), max(top, top + screen_height - pet_height))
    if card_height and pet_y - card_height - 26 < top:
        top_offset = 8
    window_x = min(max(pet_x - center_offset, left), max(left, left + screen_width - width))
    window_y = min(max(pet_y - top_offset, top), max(top, top + screen_height - height))
    return window_x, window_y, pet_x, pet_y


def bubble_top(pet_y: int, pet_height: int, card_height: int, window_height: int) -> int:
    above = pet_y - card_height - 19
    desired = above if above >= 7 else pet_y + pet_height + 19
    return min(max(desired, 7), max(7, window_height - card_height - 7))
