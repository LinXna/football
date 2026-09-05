import test from "node:test";
import assert from "node:assert";
import { assembleMatchesForMode } from "../server/routes/canonicalRoutes";
import { calculateQuantitativeFeatures } from "../refactor/03_quant_engine";

test("Server-Side Quant Precomputation: assembleMatchesForMode automatically computes Layer 03 features", () => {
  const result = assembleMatchesForMode("live");
  
  assert.ok(result.canonicalMatches.length > 0, "Should have canonical matches");
  assert.ok(result.quantitativeFeatures, "Should have quantitativeFeatures dictionary");

  const matchCount = result.canonicalMatches.length;
  const quantCount = Object.keys(result.quantitativeFeatures).length;
  assert.strictEqual(quantCount, matchCount, "Every canonical match must have precomputed quant features");

  // 验证零偏差（Zero Prediction Impact）：
  // 服务端预计算的特征与直接调用 calculateQuantitativeFeatures 必须 100% 严格一致
  for (const match of result.canonicalMatches) {
    const precomputed = result.quantitativeFeatures[match.canonical_id];
    assert.ok(precomputed, `Match ${match.canonical_id} must have precomputed quant`);

    const freshCalculated = calculateQuantitativeFeatures(match);
    assert.strictEqual(
      precomputed.bdi.battlefield_dominance_index,
      freshCalculated.bdi.battlefield_dominance_index,
      `BDI must match for ${match.canonical_id}`
    );
    assert.strictEqual(
      precomputed.confidence_score,
      freshCalculated.confidence_score,
      `Confidence score must match for ${match.canonical_id}`
    );
    assert.strictEqual(
      precomputed.poisson.lambda_remaining_home,
      freshCalculated.poisson.lambda_remaining_home,
      `Poisson lambda home must match for ${match.canonical_id}`
    );
    assert.strictEqual(
      precomputed.poisson.lambda_remaining_away,
      freshCalculated.poisson.lambda_remaining_away,
      `Poisson lambda away must match for ${match.canonical_id}`
    );
  }
});
