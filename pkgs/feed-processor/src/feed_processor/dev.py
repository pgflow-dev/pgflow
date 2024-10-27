from feed_processor import main


async def run_dev():
    qm_coroutine = await main()

    print(' -> QueueManager starting in DEV mode')

    return await qm_coroutine.run(batch_size=1)

if __name__ == '__main__':
    import asyncio
    asyncio.run(run_dev())
