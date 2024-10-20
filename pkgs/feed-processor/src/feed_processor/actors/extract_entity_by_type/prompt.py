from langchain_core.prompts import ChatPromptTemplate

PROMPT = """
You are an expert extraction bot tasked with extracting any number of instances of '{type}' type from free-form text.
The text may come from personal notes or shared content.
Your goal is to identify and extract entities of predefined types, formatting them in a structured way for future reference and browsing.

Here is the raw text input:
<raw_text>
{input}
</raw_text>

Here is the detailed overview of the type:
{output_type}

Extraction rules and constraints:
{extraction_rules}

Current date and time: {time}
"""

prompt = ChatPromptTemplate.from_template(PROMPT)
