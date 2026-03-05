/**
 * Test per il review gate
 * Issue #41
 */

import { describe, test, expect } from 'vitest';

describe('Review gate — Store', () => {
  test('requestReview mette snapshot in pending_review', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    expect(snapshot.status).toBe('preview');

    const reviewed = store.requestReview(snapshot.changeId);
    expect(reviewed).not.toBeNull();
    expect(reviewed!.status).toBe('pending_review');
  });

  test('requestReview fallisce se non in stato preview', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review2.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    // Porta a applied
    store.applySnapshot(`${process.cwd()}/test-review2.ts`, 'new', 'diff');
    const result = store.requestReview(snapshot.changeId);
    expect(result).toBeNull();
  });

  test('setReviewDecision registra approved', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review3.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    store.requestReview(snapshot.changeId);
    const decided = store.setReviewDecision(snapshot.changeId, 'approved');

    expect(decided).not.toBeNull();
    expect(decided!.reviewDecision).toBe('approved');
    // Status rimane pending_review dopo approved (sarà applied dal PostToolUse)
    expect(decided!.status).toBe('pending_review');
  });

  test('setReviewDecision registra rejected e cambia status', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review4.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    store.requestReview(snapshot.changeId);
    const decided = store.setReviewDecision(snapshot.changeId, 'rejected');

    expect(decided).not.toBeNull();
    expect(decided!.reviewDecision).toBe('rejected');
    expect(decided!.status).toBe('rejected');
  });

  test('getReviewDecision ritorna null se non deciso', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review5.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    store.requestReview(snapshot.changeId);
    const decision = store.getReviewDecision(snapshot.changeId);
    expect(decision).toBeNull();
  });

  test('getReviewDecision ritorna decisione dopo setReviewDecision', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const snapshot = store.addSnapshot({
      filePath: `${process.cwd()}/test-review6.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    store.requestReview(snapshot.changeId);
    store.setReviewDecision(snapshot.changeId, 'approved');
    const decision = store.getReviewDecision(snapshot.changeId);
    expect(decision).toBe('approved');
  });
});

describe('Review gate — Utils', () => {
  test('isReviewMode controlla env var', async () => {
    const original = process.env.DIFFWATCH_REVIEW;

    process.env.DIFFWATCH_REVIEW = '1';
    // Reimporta per applicare l'env var
    const { isReviewMode } = await import('../src/hooks/utils.js');
    expect(isReviewMode()).toBe(true);

    process.env.DIFFWATCH_REVIEW = '0';
    expect(isReviewMode()).toBe(false);

    process.env.DIFFWATCH_REVIEW = 'true';
    expect(isReviewMode()).toBe(true);

    delete process.env.DIFFWATCH_REVIEW;
    expect(isReviewMode()).toBe(false);

    // Ripristina
    if (original !== undefined) {
      process.env.DIFFWATCH_REVIEW = original;
    }
  });
});
