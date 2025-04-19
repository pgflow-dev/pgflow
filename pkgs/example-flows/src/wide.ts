import { Flow } from '@pgflow/dsl';

// eslint-disable-next-line @typescript-eslint/no-empty-function
async function simulateWorkThenError() {}

const WideFlow = new Flow<string>({
  slug: 'wide_flow',
  maxAttempts: 3,
})
  .step({ slug: 'start' }, async (input) => {
    await simulateWorkThenError();
    return `[${input.run}]start`;
  })
  .step({ slug: 'download_stream', dependsOn: ['start'] }, async (input) => {
    await simulateWorkThenError();
    return `${input.start}/download_stream`;
  })
  .step(
    { slug: 'extract_frames', dependsOn: ['download_stream'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.download_stream}/extract_frames`;
    }
  )
  .step(
    { slug: 'extract_audio', dependsOn: ['download_stream'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.download_stream}/extract_audio`;
    }
  )
  .step(
    { slug: 'collect_chat_data', dependsOn: ['download_stream'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.download_stream}/collect_chat_data`;
    }
  )
  .step(
    { slug: 'detect_scenes', dependsOn: ['extract_frames'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.extract_frames}/detect_scenes`;
    }
  )
  .step(
    { slug: 'detect_players', dependsOn: ['extract_frames'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.extract_frames}/detect_players`;
    }
  )
  .step(
    { slug: 'scene_classification', dependsOn: ['detect_scenes'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.detect_scenes}/scene_classification`;
    }
  )
  .step(
    { slug: 'scene_segmentation', dependsOn: ['detect_scenes'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.detect_scenes}/scene_segmentation`;
    }
  )
  .step(
    { slug: 'face_recognition', dependsOn: ['detect_players'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.detect_players}/face_recognition`;
    }
  )
  .step(
    { slug: 'jersey_recognition', dependsOn: ['detect_players'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.detect_players}/jersey_recognition`;
    }
  )
  .step(
    {
      slug: 'identify_players',
      dependsOn: ['face_recognition', 'jersey_recognition'],
    },
    async (input) => {
      await simulateWorkThenError();
      return `${input.face_recognition} & ${input.jersey_recognition}/identify_players`;
    }
  )
  .step(
    { slug: 'transcribe_audio', dependsOn: ['extract_audio'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.extract_audio}/transcribe_audio`;
    }
  )
  .step(
    { slug: 'analyze_audio_sentiment', dependsOn: ['transcribe_audio'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.transcribe_audio}/analyze_audio_sentiment`;
    }
  )
  .step(
    { slug: 'keyword_extraction', dependsOn: ['transcribe_audio'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.transcribe_audio}/keyword_extraction`;
    }
  )
  .step(
    { slug: 'filter_spam', dependsOn: ['collect_chat_data'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.collect_chat_data}/filter_spam`;
    }
  )
  .step(
    { slug: 'analyze_chat_sentiment', dependsOn: ['filter_spam'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.filter_spam}/analyze_chat_sentiment`;
    }
  )
  .step(
    {
      slug: 'sentiment_summary',
      dependsOn: ['analyze_audio_sentiment', 'analyze_chat_sentiment'],
    },
    async (input) => {
      await simulateWorkThenError();
      return `${input.analyze_audio_sentiment} & ${input.analyze_chat_sentiment}/sentiment_summary`;
    }
  )
  .step(
    {
      slug: 'generate_statistics',
      dependsOn: ['sentiment_summary', 'identify_players'],
    },
    async (input) => {
      await simulateWorkThenError();
      return `${input.sentiment_summary} & ${input.identify_players}/generate_statistics`;
    }
  )
  .step(
    {
      slug: 'generate_highlights',
      dependsOn: [
        'scene_classification',
        'scene_segmentation',
        'keyword_extraction',
        'identify_players',
      ],
    },
    async (input) => {
      await simulateWorkThenError();
      return `${input.scene_classification}, ${input.scene_segmentation}, ${input.keyword_extraction}, ${input.identify_players}/generate_highlights`;
    }
  )
  .step(
    {
      slug: 'update_dashboard',
      dependsOn: ['generate_statistics', 'generate_highlights'],
    },
    async (input) => {
      await simulateWorkThenError();
      return `${input.generate_statistics} & ${input.generate_highlights}/update_dashboard`;
    }
  )
  .step(
    { slug: 'send_notifications', dependsOn: ['update_dashboard'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.update_dashboard}/send_notifications`;
    }
  )
  .step(
    { slug: 'finish', dependsOn: ['send_notifications'] },
    async (input) => {
      await simulateWorkThenError();
      return `${input.send_notifications}/finish`;
    }
  );

export default WideFlow;
