import asyncpg


async def get_connection() -> asyncpg.Connection:
    import os

    from dotenv import load_dotenv
    load_dotenv()

    DATABASE_URL = os.environ.get("DATABASE_URL")

    print('-----------------------------------------------------')
    print('----------- DATABASE_URL ----------------------------')
    print(DATABASE_URL)
    print('-----------------------------------------------------')

    return await asyncpg.connect(DATABASE_URL)

