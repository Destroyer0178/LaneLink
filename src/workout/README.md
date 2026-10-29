# Circuits and adaptive intervals

## Circuit model

Circuits are `SetPiece` objects with `kind: "circuit"`, an ordered `children`
array, and a positive `rounds` count. Rest between child pieces and rest between
rounds are stored separately and do not affect yardage.

Circuit yardage is:

```text
yardage per round = sum of each child piece's resolved yardage
total circuit yardage = yardage per round × circuit rounds
```

Nested repeated groups are calculated recursively. A child piece's own repeat
count is applied once, and the circuit round count is applied once.

## Adaptive interval rules

Recommendations are reviewable planning aids, not claims of physiological
optimality.

1. Match a swimmer record by stroke, course, and repetition distance.
2. If no exact distance exists, use the nearest same-stroke/same-course record
   only when the target distance is between half and twice the recorded
   distance. Related-distance estimates use a Riegel exponent of `1.06`.
3. Apply the selected goal's documented working-time multiplier:
   - Recovery: `1.35`
   - Aerobic: `1.22`
   - Threshold: `1.10`
   - Speed: `1.03`
4. Add the goal's minimum rest, or the coach's explicit rest target.
5. Round the send-off up to the next five seconds.
6. Sort swimmers by set-specific estimated working time and split them into the
   requested number of contiguous groups. Each proposed group uses the slowest
   member's candidate send-off so minimum rest is not silently removed.
7. Flag groups where a shared interval creates insufficient rest or more rest
   than the selected goal's configured maximum ratio.

No estimate is generated from a mismatched stroke/course or from a record more
than two times or less than half the target distance. Unknown units and
unsupported set activities require manual configuration.

## Persistence and security

This project has no configured backend or authentication service. Workouts,
library pieces, and swimmer performance records are stored in browser
`localStorage`. They persist in the same browser profile but are not securely
shared across accounts or devices.

Secure coach-specific persistence requires a backend with authentication,
coach-owned performance-record rows, and row-level access controls. No such
backend is claimed by this implementation.
