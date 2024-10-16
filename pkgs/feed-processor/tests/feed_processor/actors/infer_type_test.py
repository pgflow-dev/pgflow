import os

import pytest
from dotenv import load_dotenv
from feed_processor.actors.infer_type.chain import create_chain

bookmarks_input = [
    ("[Hacker News](https://news.ycombinator.com)", "bookmark"),
    ("[Example.com](https://example.com)", "bookmark"),
    ("www.google.com", "bookmark"),
    ("reddit.com/r/mildlyinteresting", "bookmark")
]

non_bookmark_input = [
    "Then i watched the video at https://youtube.com?v=JxdFwIXdwYc",
    "go to google.com in order to search for something",
    "visit my website mywebsite.com in order to learn more about me",
]

@pytest.fixture(scope="module")
def chain():
    load_dotenv()
    return create_chain(os.environ["OPENAI_API_KEY"])

@pytest.mark.parametrize("input_text, expected_type", bookmarks_input)
def test_bookmark(chain, input_text, expected_type):
    results = chain.invoke({"input": input_text})
    assert results.type == expected_type

# @pytest.mark.parametrize("input_text", non_bookmark_input)
# def test_non_bookmark(chain, input_text):
#     results = chain.invoke({"input": input_text})
#     assert results.type != "bookmark"
