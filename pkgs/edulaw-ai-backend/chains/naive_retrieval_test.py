import unittest

from chains.naive_retrieval import chain
from rich.pretty import pprint


class NaiveRetrievalTest(unittest.TestCase):
    def test_chain(self):
        input = "edukacja"

        output = chain.invoke(input)
        assert output
        pprint(output)
