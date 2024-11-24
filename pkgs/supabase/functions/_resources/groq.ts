import Groq from "groq-sdk";
import createMemoizedContext from "./createMemoizedContext";
import OpenAI from "openai";

type Env = {
  GROQ_API_KEY: string;
};

const RunContext = createMemoizedContext({
  groq: ({ GROQ_API_KEY }: Env) => new Groq({ apiKey: GROQ_API_KEY }),
});
