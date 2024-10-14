import os

import asyncpg


async def get_connection() -> asyncpg.Connection:
    database_url = os.environ.get("DATABASE_URL")

    print('-----------------------------------------------------')
    print('----------- DATABASE_URL ----------------------------')
    print(database_url)
    print('-----------------------------------------------------')

    return await asyncpg.connect(database_url)

