import re
from typing import List


def LinesParser():
    def parse_lines(input: str) -> List[str]:
        return [re.sub(r"^\W+", "", line) for line in input.split("\n")]

    return parse_lines

