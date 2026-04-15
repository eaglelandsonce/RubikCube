# RubikCube

Interactive 3x3 Rubik's Cube built with Three.js.

## Features

- 27 independent cubies with animated face turns
- Move queue for smooth, sequential rotations
- Controls for all standard face moves: F, B, R, L, U, D and prime variants
- Keyboard shortcuts: press F/B/R/L/U/D, hold Shift for prime turns
- Scramble and reset actions
- Orbit camera controls (drag to rotate, scroll to zoom)

## Run locally

Because ES modules are used, run with a local web server.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```
