import { Flow } from './dsl.ts';

// Define the input type for our flow
type Input = {
  query: string;
  preferredLanguage?: string;
};

const AnswerTranslatedFlow = (subflow) =>
  subflow
    .step(
      { slug: 'translate' },
      async (input) =>
        await translateText(
          input.run.query,
          input.run.preferredLanguage || 'english'
        )
    )
    .step(
      { slug: 'answerTranslated' },
      async (input) =>
        await generateAnswer(
          input.translate.translatedText,
          input.run.preferredLanguage || 'english'
        )
    );

const AnswerTranslatedFlow = new Flow<string>({})
  .step(
    { slug: 'translate' },
    async (input) =>
      await translateText(
        input.run.query,
        input.run.preferredLanguage || 'english'
      )
  )
  .step(
    { slug: 'answerTranslated' },
    async (input) =>
      await generateAnswer(
        input.translate.translatedText,
        input.run.preferredLanguage || 'english'
      )
  );

// Using the new subflow DSL method
export const QueryAnswerFlow = new Flow<Input>({
  slug: 'query_answer',
  maxAttempts: 3,
  baseDelay: 5,
  timeout: 60,
})
  .step(
    { slug: 'detectLanguage' },
    async (input) => await detectLanguage(input.run.query)
  )
  .subflow(
    {
      slug: 'translation',
      runIf: {
        detectLanguage: (result) =>
          result.language !== input.run.preferredLanguage &&
          input.run.preferredLanguage,
      },
    },
    AnswerTranslatedFlow
  )
  .subflow(
    {
      slug: 'directAnswer',
      runIf: {
        detectLanguage: (result) =>
          result.language === input.run.preferredLanguage ||
          !input.run.preferredLanguage,
      },
    },
    (subflow) =>
      subflow.step(
        { slug: 'answerDirect' },
        async (input) =>
          await generateAnswer(input.run.query, input.detectLanguage.language)
      )
  )
  .subflow(
    {
      slug: 'analysis',
      runIf: {
        detectLanguage: (result) =>
          result.language === input.run.preferredLanguage ||
          !input.run.preferredLanguage,
      },
    },
    new Flow<string>({ slug: 'yolo ' })
      .step(
        { slug: 'answerDirect' },
        async (input) =>
          await generateAnswer(input.run.query, input.detectLanguage.language)
      )
      .step(
        { slug: 'answerDirect' },
        async (input) =>
          await generateAnswer(input.run.query, input.detectLanguage.language)
      )
  )
  .step(
    {
      slug: 'formatOutput',
      dependsOn: ['translation.answerTranslated', 'directAnswer.answerDirect'],
      optional: ['translation.answerTranslated', 'directAnswer.answerDirect'],
    },
    async (input) => {
      const answerData =
        input.translation?.answerTranslated || input.directAnswer?.answerDirect;
      return await formatResponse(answerData.answer, answerData.sources);
    }
  )
  .step(
    { slug: 'logResponse', dependsOn: ['formatOutput'] },
    async (input) =>
      await logResult({
        query: input.run.query,
        response: input.formatOutput.formattedResponse,
      })
  );
