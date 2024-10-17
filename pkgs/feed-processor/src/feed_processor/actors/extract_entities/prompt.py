from langchain_core.prompts import ChatPromptTemplate

PROMPT_TEMPLATE = """
You are an AI assistant tasked with extracting specific entities from free-form text. The text may come from personal notes or shared content. Your goal is to identify and extract entities of predefined types, formatting them in a structured way for future reference and browsing.

Here is the raw text input:
<raw_text>
{input}
</raw_text>

You need to extract entities of the following types:

1. Bookmark
   - reason: string
   - url: string
   - title: string
   - short_summary: string
   - tags: List[string]

2. CodeSnippet
   - reason: string
   - source: string
   - language_code: string (e.g., typescript, python, ruby, html)
   - description: string
   - short_summary: string
   - tags: List[string]

3. Event
   - reason: string
   - time: datetime (ISO 8601 formatted string)
   - place: string
   - title: string
   - description: string
   - short_summary: string
   - tags: List[string]

4. Todo
   - reason: string
   - title: string
   - due_date: datetime (ISO 8601 formatted string)
   - short_summary: string
   - tags: List[string]

5. Note
   - reason: string
   - text: string
   - short_summary: string
   - tags: List[string]

Extraction rules and constraints:
- Extract only the entity types listed above.
- For each entity, start with 'reason' where you explain why you think this is this type
- You can extract between 0 and 10 entities in total.
- It's possible that the entire content fits a single entity type.
- If you can't extract any entities, return an empty array.
- Never extract entities that don't match the specified types.
- In short_summary write a very short (few words, max 1 sentence) summary of the content
- In tags, write list of few tags that describe the content
- If content includes #tags or #[[tags with spaces]], extract those as tags

Handle edge cases as follows:
- If a place or description field is missing or cannot be determined for Event, omit it from the output.
- If you're unsure about the programming language for a CodeSnippet, use "plaintext" as the language_code.
- For Bookmarks, if the title is missing, use the URL as the title.
- Notes are all the personal notes, thoughts or things looking like journal entries
- Do not split related content into separate notes, try to understand what should go together
- Once again - if the topic of notes is same, consolidate multiple notes to single one containing all

Remember to analyze the raw text carefully and extract all relevant entities. If you can't find any entities or if you're unsure about certain attributes, it's better to omit them than to include incorrect information.

Now, please process the raw text and provide the extracted entities in the specified JSON format.
"""

prompt = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)

