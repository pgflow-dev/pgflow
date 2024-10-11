from __future__ import annotations

import asyncio
import sys

from feed_processor.utils import get_connection
from pgqueuer.db import AsyncpgDriver
from pgqueuer.queries import Queries


async def main(N: int) -> None:
    connection = await get_connection()
    driver = AsyncpgDriver(connection)
    queries = Queries(driver)
    await queries.enqueue(
        ["infer_type"] * N,
        [f"this is from me: {n}".encode() for n in range(1, N+1)],
        [0] * N,
    )


if __name__ == "__main__":
    print(sys.argv)
    N = 1_000 if len(sys.argv) == 1 else int(sys.argv[1])
    asyncio.run(main(N))
