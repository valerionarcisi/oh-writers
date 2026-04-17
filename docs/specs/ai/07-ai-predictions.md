# Spec 07 — AI Predictions

## User Stories

- As a producer I want to estimate the production cost of each scene
- As a director I want to understand the weather risk for exterior scenes
- As a writer I want to see a cost overview for the entire screenplay
- As a team I want to export a production report with estimates and risks

## Prediction Types

### 1. Production Cost per Scene

Input: scene heading, characters, vehicles, SFX, page count, genre
Output: low/mid/high in EUR, breakdown (crew, cast, location, sfx, vehicles, extras), confidence, notes

### 2. Weather Risk for Exterior Scenes

Input: scene type (EXT), location, time of day, planned month, geographic region
Output: risk (green/yellow/red), score 0–100, factors, recommendation, bestMonths

## Routes

```
/projects/:id/screenplay/predictions
/projects/:id/screenplay/predictions/:sceneId
```

## tRPC Procedures

```ts
// predictions.generateForScene(sceneId, type) → AiPrediction
// predictions.generateForAll(screenplayId) → AiPrediction[]
// predictions.get(sceneId, type) → AiPrediction | null
// predictions.getForScreenplay(screenplayId) → ScenePredictions[]
// predictions.exportReport(screenplayId) → Buffer
```

## AI Prompt Strategy

- `claude-haiku-4-5` for speed and cost efficiency
- System prompt: "you are an expert Italian line producer with 20 years of experience"
- Output forced to JSON via structured outputs
- Prediction caching: do not regenerate if the scene has not changed (content hash check)

## Business Rules

- Predictions are generated on-demand, not automatically
- Max 1 active prediction per type per scene (new ones overwrite old ones)
- A prediction is invalidated if the scene is modified (hash check against scene content)
- Predictions do not block writing
- Rate limit: max 20 predictions per user per hour to control API costs

## Test Coverage

- INT scene → cost only, no weather risk
- EXT scene → cost + weather risk
- Cache: unmodified scene → existing prediction returned
- Modified scene → prediction invalidated → regenerate
- Batch "Generate All" → correct progress, no duplicates
