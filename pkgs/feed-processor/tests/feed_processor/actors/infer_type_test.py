import os
import unittest

from dotenv import load_dotenv
from feed_processor.actors.infer_type.chain import create_chain


class TestInferType(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load_dotenv()
        cls.chain = create_chain(os.environ["OPENAI_API_KEY"])

    def test_snippet(self):
        results = self.chain.invoke({"input": "[Hacker News](https://news.ycombinator.com)"})

        self.assertEqual(results.type, "bookmark")

if __name__ == '__main__':
    unittest.main()
