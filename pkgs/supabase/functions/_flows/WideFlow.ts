import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const WideFlow = new Flow<string>()
  .step("start", async ({ run }) => {
    return `[${run}]start`;
  })
  .step("download_stream", ["start"], async ({ start }) => {
    await randomSleep();
    return `${start}/download_stream`;
  })
  .step("extract_frames", ["download_stream"], async ({ download_stream }) => {
    await randomSleep();
    return `${download_stream}/extract_frames`;
  })
  .step("extract_audio", ["download_stream"], async ({ download_stream }) => {
    await randomSleep();
    return `${download_stream}/extract_audio`;
  })
  .step(
    "collect_chat_data",
    ["download_stream"],
    async ({ download_stream }) => {
      await randomSleep();
      return `${download_stream}/collect_chat_data`;
    },
  )
  .step("detect_scenes", ["extract_frames"], async ({ extract_frames }) => {
    await randomSleep();
    return `${extract_frames}/detect_scenes`;
  })
  .step("detect_players", ["extract_frames"], async ({ extract_frames }) => {
    await randomSleep();
    return `${extract_frames}/detect_players`;
  })
  .step(
    "scene_classification",
    ["detect_scenes"],
    async ({ detect_scenes }) => {
      await randomSleep();
      return `${detect_scenes}/scene_classification`;
    },
  )
  .step("scene_segmentation", ["detect_scenes"], async ({ detect_scenes }) => {
    await randomSleep();
    return `${detect_scenes}/scene_segmentation`;
  })
  .step("face_recognition", ["detect_players"], async ({ detect_players }) => {
    await randomSleep();
    return `${detect_players}/face_recognition`;
  })
  .step(
    "jersey_recognition",
    ["detect_players"],
    async ({ detect_players }) => {
      await randomSleep();
      return `${detect_players}/jersey_recognition`;
    },
  )
  .step(
    "identify_players",
    ["face_recognition", "jersey_recognition"],
    async ({ face_recognition, jersey_recognition }) => {
      await randomSleep();
      return `${face_recognition} & ${jersey_recognition}/identify_players`;
    },
  )
  .step("transcribe_audio", ["extract_audio"], async ({ extract_audio }) => {
    await randomSleep();
    return `${extract_audio}/transcribe_audio`;
  })
  .step(
    "analyze_audio_sentiment",
    ["transcribe_audio"],
    async ({ transcribe_audio }) => {
      await randomSleep();
      return `${transcribe_audio}/analyze_audio_sentiment`;
    },
  )
  .step(
    "keyword_extraction",
    ["transcribe_audio"],
    async ({ transcribe_audio }) => {
      await randomSleep();
      return `${transcribe_audio}/keyword_extraction`;
    },
  )
  .step("filter_spam", ["collect_chat_data"], async ({ collect_chat_data }) => {
    await randomSleep();
    return `${collect_chat_data}/filter_spam`;
  })
  .step("analyze_chat_sentiment", ["filter_spam"], async ({ filter_spam }) => {
    await randomSleep();
    return `${filter_spam}/analyze_chat_sentiment`;
  })
  .step(
    "sentiment_summary",
    ["analyze_audio_sentiment", "analyze_chat_sentiment"],
    async ({ analyze_audio_sentiment, analyze_chat_sentiment }) => {
      await randomSleep();
      return `${analyze_audio_sentiment} & ${analyze_chat_sentiment}/sentiment_summary`;
    },
  )
  .step(
    "generate_statistics",
    ["sentiment_summary", "identify_players"],
    async ({ sentiment_summary, identify_players }) => {
      await randomSleep();
      return `${sentiment_summary} & ${identify_players}/generate_statistics`;
    },
  )
  .step(
    "generate_highlights",
    [
      "scene_classification",
      "scene_segmentation",
      "keyword_extraction",
      "identify_players",
    ],
    async ({
      scene_classification,
      scene_segmentation,
      keyword_extraction,
      identify_players,
    }) => {
      await randomSleep();
      return `${scene_classification}, ${scene_segmentation}, ${keyword_extraction}, ${identify_players}/generate_highlights`;
    },
  )
  .step(
    "update_dashboard",
    ["generate_statistics", "generate_highlights"],
    async ({ generate_statistics, generate_highlights }) => {
      await randomSleep();
      return `${generate_statistics} & ${generate_highlights}/update_dashboard`;
    },
  )
  .step(
    "send_notifications",
    ["update_dashboard"],
    async ({ update_dashboard }) => {
      await randomSleep();
      return `${update_dashboard}/send_notifications`;
    },
  )
  .step("finish", ["send_notifications"], async ({ send_notifications }) => {
    await randomSleep();
    return `${send_notifications}/finish`;
  });

export default WideFlow;

export type StepsType = ReturnType<typeof WideFlow.getSteps>;
