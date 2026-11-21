"""Deterministic geometry-only perturbations for tracking robustness tests.

This is NOT a detector. Ground-truth track IDs and user video bytes never enter
the perturbation. The synthetic noise policy is not an empirical camera model.
"""


def perturb_frames(frames, drop_every=0, jitter_pixels=0, image_width=1920, image_height=1080):
    if type(drop_every) is not int or drop_every < 0:
        raise ValueError("drop_every must be an integer >= 0")
    if type(jitter_pixels) is not int or not 0 <= jitter_pixels <= 50:
        raise ValueError("jitter_pixels must be an integer in [0, 50]")
    if image_width <= 0 or image_height <= 0:
        raise ValueError("positive image dimensions required")
    result = []
    global_index = 0
    for frame_number, reference in enumerate(frames):
        output = {}
        # Canonical order is geometry-only, never a label or GT identity.
        for position, box in enumerate(sorted(reference.values())):
            global_index += 1
            if drop_every and global_index % drop_every == 0:
                continue
            left, top, right, bottom = box
            width, height = right - left, bottom - top
            if width <= 0 or height <= 0 or not 0 <= left < right <= 1 or not 0 <= top < bottom <= 1:
                raise ValueError("invalid source bounding box")
            if jitter_pixels:
                direction = (frame_number + position) % 4
                dx = (1 if direction in (0, 1) else -1) * jitter_pixels / image_width
                dy = (1 if direction in (0, 2) else -1) * jitter_pixels / image_height
                left = max(0, min(left + dx, 1 - width))
                top = max(0, min(top + dy, 1 - height))
            output[len(output)] = (left, top, left + width, top + height)
        result.append(output)
    return result
