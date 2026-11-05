# Contributing

1. Branch from `main` (`feature/<FEATURE-ID>` when the Vrixel SDLC opens it for you).
2. Extend an existing test before adding one: the plan says, per criterion, `extend`, `replace` or
   `add`, and `npm run review` lists tests another test already covers.
3. Declare every test with `spec()`: the criteria it proves, its capability and its covers. Keep
   earlier features' criteria on a test you extend.
4. Test through the components' APIs, events and pages, never their databases. Synthetic data only,
   made unique with `runId`.
5. Run `npm run catalog` and commit `catalog.json` with your tests; CI fails if it is out of date.
6. A pull request merges when its required checks pass and, on repos the Vrixel SDLC delivers to,
   once the pipeline's gates have approved it (status `vrixel/gates`). The default branch accepts
   pull requests only.
