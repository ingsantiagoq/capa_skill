# CAPA state exit criteria

CAPA must not allow theatrical progress. Completing a state with `--status ok` can require state-specific proof.

Current enforced criteria:

- `SCOPE`: at least one approved scope path must exist.
- `IMPLEMENT`: implementation evidence must be registered while the PBI is in `IMPLEMENT`.
- `TEST`: at least one test with status `ok` must exist.
- `CODE_REVIEW`: at least one code review with status `ok` must exist.

Non-`ok` completions are allowed so an agent can record blocked, failed or partial progress without satisfying success gates.

The intent is not to add ceremony. The intent is to prevent fake advancement such as:

```bash
capa completar --status ok --summary "done"
```

when CAPA has no proof that the state actually met its exit contract.
