import { Flow } from "./Flow.ts";

// const workflow: Workflow = {
//   id: 'basic-rag-workflow',
//   on: {
//     event: 'question:create',
//   },
//   steps: [
//     {
//       name: 'start',
//       run: async (ctx) => {
//         return {
//             "status": "starting...",
//         }
//       },
//     },
//     {
//       name: 'load_docs',
//       parents: ['start'],
//       run: async (ctx) => {
//         // Load the relevant documents
//         return {
//             "status": "docs loaded",
//             "docs": text_content,
//         }
//       },
//     }
//     {
//       name: 'reason_docs',
//       parents: ['load_docs'],
//       run: (ctx) => {
//         const docs = ctx.stepOutput("load_docs")['docs']
//         // Reason about the relevant docs
//
//         return {
//             "status": "writing a response",
//             "research": research,
//         }
//       },
//     },
//     {
//       name: 'generate_response',
//       parents: ['reason_docs'],
//       run: (ctx) => {
//         const research = ctx.stepOutput("reason_docs")['research']
//         // Generate a message
//         return {
//             "status": "complete",
//             "message": message,
//         }
//       },
//     },
//
//   ],
// };

type RunPayload = {
  docsIds: string[];
};

const HatchetFlow = new Flow<RunPayload>()
  .task("start", (_payload) => {
    return { status: "starting..." };
  })
  .task("load_docs", ["start"], ({ start: { status } }) => {
    return { status: `docs loaded`, docs: [`the start status was ${status}`] };
  })
  .task("reason_docs", ["load_docs"], ({ load_docs: { docs } }) => {
    return {
      status: "writing a response",
      research: `reasoning about ${docs.length} docs...`,
    };
  })
  .task(
    "generate_response",
    ["reason_docs"],
    ({ reason_docs: { research } }) => {
      return {
        status: "complete",
        message: `the reasoning was ${research}`,
      };
    },
  );

export default HatchetFlow;

export type StepsType = ReturnType<typeof HatchetFlow.getSteps>;
