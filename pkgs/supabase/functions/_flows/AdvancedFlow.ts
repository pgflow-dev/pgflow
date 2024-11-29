import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const AdvancedFlow = new Flow<string>()
  .task("start", async ({ run }) => {
    await randomSleep();
    return `[${run}]start`;
  })
  .task("load_doc", ["start"], async ({ start }) => {
    await randomSleep();
    return `${start}/load_doc`;
  })
  .task("check_format", ["load_doc"], async ({ load_doc }) => {
    await randomSleep();
    return `${load_doc}/check_format`;
  })
  .task("convert_to_text", ["check_format"], async ({ check_format }) => {
    await randomSleep();
    return `${check_format}/convert_to_text`;
  })
  .task("extract_text", ["convert_to_text"], async ({ convert_to_text }) => {
    await randomSleep();
    return `${convert_to_text}/extract_text`;
  })
  .task(
    "extract_metadata",
    ["convert_to_text"],
    async ({ convert_to_text }) => {
      await randomSleep();
      return `${convert_to_text}/extract_metadata`;
    },
  )
  .task("detect_language", ["extract_text"], async ({ extract_text }) => {
    await randomSleep();
    return `${extract_text}/detect_language`;
  })
  .task("translate_text", ["detect_language"], async ({ detect_language }) => {
    await randomSleep();
    return `${detect_language}/translate_text`;
  })
  .task("perform_ner", ["translate_text"], async ({ translate_text }) => {
    await randomSleep();
    return `${translate_text}/perform_ner`;
  })
  .task(
    "sentiment_analysis",
    ["translate_text"],
    async ({ translate_text }) => {
      await randomSleep();
      return `${translate_text}/sentiment_analysis`;
    },
  )
  .task(
    "generate_summary",
    ["perform_ner", "sentiment_analysis"],
    async ({ perform_ner, sentiment_analysis }) => {
      await randomSleep();
      return `<${perform_ner}> and <${sentiment_analysis}>/generate_summary`;
    },
  )
  .task(
    "generate_keywords",
    ["generate_summary", "extract_metadata"],
    async ({ generate_summary, extract_metadata }) => {
      await randomSleep();
      return `<${generate_summary}> and <${extract_metadata}>/generate_keywords`;
    },
  )
  .task("embed_text", ["generate_keywords"], async ({ generate_keywords }) => {
    await randomSleep();
    return `${generate_keywords}/embed_text`;
  })
  .task("index_vector_store", ["embed_text"], async ({ embed_text }) => {
    await randomSleep();
    return `${embed_text}/index_vector_store`;
  })
  .task(
    "update_search_index",
    ["index_vector_store"],
    async ({ index_vector_store }) => {
      await randomSleep();
      return `${index_vector_store}/update_search_index`;
    },
  )
  .task("finish", ["update_search_index"], async ({ update_search_index }) => {
    await randomSleep();
    return `${update_search_index}/finish`;
  });

export default AdvancedFlow;

export type StepsType = ReturnType<typeof AdvancedFlow.getSteps>;
