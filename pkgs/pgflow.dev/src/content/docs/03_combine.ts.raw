// @ts-nocheck
/////////////////////////////////////
.addStep(
  "newTicket",
  ["title", "sentiment", "summary"],
  async ({ title, sentiment, summary, __run__: { userId } } ) => await upsertTicket({
    title,
    severity: sentiment > 3 ? "high" : "low",
    description: summary,
    owner: userId
  })
)
