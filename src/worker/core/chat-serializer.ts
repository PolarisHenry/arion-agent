// ============================================================
// Per-chat FIFO serializer. AgentRuntime routes both /clear and normal
// turns through one ChatSerializer keyed by chatId so that:
//  - two rapid messages in the same chat never interleave their
//    load→LLM→save cycles (which used to let one turn clobber another);
//  - a /clear arriving mid-turn orders AFTER the in-flight save, so the
//    wipe actually takes (instead of being re-persisted by the prior turn).
// Different chatIds are independent and run concurrently.
// ============================================================

export class ChatSerializer {
  private chains = new Map<string, Promise<void>>();

  /** Run `fn` after any prior task for the same chatId settles. The returned
   *  promise mirrors fn's own outcome; the stored chain swallows errors so
   *  one failed turn can never wedge the chat. */
  serialize(chatId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(chatId) ?? Promise.resolve();
    // Run fn whether prev resolved or rejected (don't let a failure stall the queue).
    const next = prev.then(fn, fn);
    // Store a never-rejecting view so the next task's `prev` always settles.
    this.chains.set(
      chatId,
      next.then(
        () => undefined,
        () => undefined
      )
    );
    return next;
  }
}
