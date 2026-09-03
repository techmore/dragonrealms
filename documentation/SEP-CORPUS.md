# SEP corpus

The corpus stores evidence-backed engineering examples, not raw chat transcripts. Each JSONL record should contain a task, the relevant repository evidence, the proposed change, and the measured result.

Required fields:

```json
{"kind":"sim-review","runId":"...","variant":"...","task":"...","evidence":{"finalGap":"...","progress":"...","watchdogs":[]},"diagnosis":"...","change":"...","outcome":"...","quality":"review"}
```

Rules:

- Keep completed runs only; never train on an unfinished cohort.
- Preserve run dimensions: guild, race, target, boost, cap, concurrency, and stat policy.
- Keep at least 20% of records out of the training split for held-out evaluation.
- Do not include credentials, tokens, account names, or private session data.
- A record is not a success label unless the final gate and matched comparison support it.

Generate a starter evidence export with:

```bash
node scripts/sep-corpus.mjs public/live /tmp/sep-corpus.jsonl
```

For Pi, copy `.pi/models.example.json` to the user Pi model catalog and change
`baseUrl` to the local llama.cpp/Ollama/vLLM endpoint. Keep the model name and
endpoint local; never commit credentials. Start Pi in the project directory and
select `qwen-local/Qwen3.8-27B-GGUF`, then use the `sep-script-engineer` or
`sep-map-engineer` agent.

Check local prerequisites without starting a server:

```bash
npm run sep-model-check -- /path/to/model.gguf
```

Create conservative evidence-derived labels before training:

```bash
npm run sep-curate -- /tmp/sep-corpus-check.jsonl documentation/sep-data
npm run sep-split -- documentation/sep-data/curated.jsonl documentation/sep-data
```

Curated records remain marked `human-review-required`; auto-labels are a
starter set, not a promotion decision.
