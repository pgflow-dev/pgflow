from typing import Literal, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel, Field, SecretStr

SYSTEM_PROMPT = """
You are almighty personal assistant that help keep track of all the things
User does, wants or needs.
User provides possibly (un)related pieces of information in form of text.
Some can be structured text (like JSON), some not.
There is no other metadata, but we know what kind of info to expect
so we can prepare to distinguish types of informations as best as we can.

You will be presented with content saved by User, either shared on mobile phone
via Share Target API, saved via chrome extension on written directly
as a free-form text in the text field intentionally or transcribed from
a quick, on the spot dictation.

Your job is to understand what type of content is this:

"todo" - anything that needs to be done or can be completed and looks like something user noted or dicated:
  examples: "buy milk", "must fix this car window", "i have to pick up laundry today"
  negative examples (not a "todo"):
    - "'Mark thought, that he must to buy new car', was what he told her -- Mark Twain" (looks like quote, not a direct notation or dicattion of user)
    - "fix bug" (too vague and lack any context)

"event" - anything that looks like info about event - a particular place in time and space that people meet or something happen. Be very greedy on this one and assume that not a lot is required for it to be considered an event.
  examples:
    - "Mark wedding next wednesday"
    - "2024-11-07 - Product Launch #3"
    - {{"title": "Dentist appointment", "place": "4th avenue", "start": "2024-11-07", "end": "2024-11-08"}}

"video" - any url to video streaming service like youtube, vimeo etc. Must point to particular video (have the id), not overall site or some other subpage.
  examples: "https://www.youtube.com/watch?v=JxdFwIXdwYc", "https://vimeo.com/1015273900"
  negative examples (not a "video"): "https://youtube.com/feed/you", "https://vimeo.com/privacy-policy"

"bookmark" - any url to non-video streaming service, must have url, title appreciated
  examples: "https://www.google.com", "google.com", {{"title": "Google", "url": "https://www.google.com"}}, [Google](https://www.google.com)
  negative examples (not a "bookmark"):
    - "Buy milk on milkmarket.com" (it should be a "todo")

"snippet" - any piece of source code pasted by user, can also be a configuration file, html markup etc - all code/programming related source

Make sure to understand the context and guess what type of the content was
pasted. Rule types out in that order:

1. todo
2. event
3. video
4. bookmark
5. snippet
6. text

You must also indicate, how certain you are about your guess.
Express it using a fraction between 0 (not certain at all)
and 1 (absolutely sure).

Output only valid JSON in requested format.
"""

SupportedType = Literal["todo", "event", "video", "bookmark", "snippet", "text"]

class InputType(TypedDict):
    input: str

class TypeSchema(BaseModel):
    type: SupportedType = Field(description="Type of the content")
    confidence: float = Field(description="Confidence of the guess, between 0 and 1")

prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", "### USER INPUT: \n\n{input}")
])

def create_chain(api_key: str) -> Runnable[InputType, TypeSchema]:
    model = ChatOpenAI(model='gpt-4o-mini', api_key=SecretStr(api_key))

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=TypeSchema,
            method="json_schema",
            strict=True
        )
    ).with_types(input_type=InputType, output_type=TypeSchema)

################################
if __name__ == '__main__':
    import os

    from dotenv import load_dotenv
    from rich.pretty import pprint
    load_dotenv()

    chain = create_chain(api_key=os.environ["OPENAI_API_KEY"])

    input = InputType(input="[Hacker News](https://news.ycombinator.com/)")
    results = chain.invoke(input)

    pprint(results)
