
import unittest

from chains.hypothetical_answers import chain
from rich.pretty import pprint


class HypotheticalAnswersTest(unittest.TestCase):
    def test_chain(self):
        input = dict(
            question="jaka jest rola szkoły?",
            num_questions=3
        )
        output = chain.invoke(input)
        assert output
        pprint(output)
