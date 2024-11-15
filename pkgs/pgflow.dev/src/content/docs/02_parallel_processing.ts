// everything below will get included, content above will be ignored in the docs
/////////////////////////////////////////////////////////////////////////////////////
.addStep("title", ["transcription"]
  async ({ transcription }) => await createTitleWithClaude(transription)
)
.addStep("sentiment", ["transcription"],
	async ({ transcription }) => await classifySentiment(transcription)
})
.addStep("summary", ["transcription"],
  async ({ transcription }) => await summarizeWithOpenAI(transription)
)
