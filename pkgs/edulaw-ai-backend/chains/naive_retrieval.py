from app.utils import init_supabase_vectorstore

chain = init_supabase_vectorstore().as_retriever()

if __name__ == "__main__":
    from rich.pretty import pprint

    print()
    results = chain.invoke("czy nauczyciel ma obowiązek udostępnić informację o zrealizowanym programie nauczania?")

    pprint(results)
