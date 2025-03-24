new Flow<string>({ slug: 'analyzeWebsite' })
  .step({ slug: 'website' }, async ({ run }) => await fetchData(run.url))
  .branch(
    {
      slug: 'ifSuccess',
      dependsOn: ['fetchData'],
      runIf: { website: { status: 200 } },
    },
    (flow) =>
      flow
        .step({ slug: 'sentiment' }, async ({ run, fetchData }) =>
          saveData(run.url, fetchData.body)
        )
        .step({ slug: 'summary' }, async ({ run, fetchData }) =>
          saveData(run.url, fetchData.body)
        )
        .step(
          { slug: 'saveToDb', dependsOn: ['summary', 'sentiment'] },
          async (payload) =>
            await slackHandler({
              url: payload.run.url,
              summary: payload.summary,
              sentiment: payload.sentiment,
            })
        )
        .step(
          { slug: 'sendSlackMessage', dependsOn: ['summary'] },
          async ({ saveToDb }) => await slackHandler({ message: '' })
        )
  )
  .branch(
    {
      slug: 'ifFailure',
      dependsOn: ['fetch'],
      runUnless: { website: { status: 200 } },
    },
    (flow) => flow.step({ slug: 'notifySentry' })
  );
