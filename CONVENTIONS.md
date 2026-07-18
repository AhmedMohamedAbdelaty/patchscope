# Project conventions

- Domain data lives in `lib/`; browser persistence lives in `lib/client/`;
  provider code lives in `lib/server/`.
- Islands coordinate interaction. Components render focused pieces and do not
  fetch or persist directly.
- Third-party diff shapes stop at `lib/diff/parse.ts`.
- Errors crossing a route boundary use a stable code and a human-readable
  message.
- Heuristics expose reasons and use the word “priority”, never “risk detected”
  or “safe”.
- Prefer native controls and URLs over custom keyboard widgets.
- CSS uses semantic data attributes for state and a compact spacing scale. A new
  visual effect needs a functional purpose.
