from app.utils import init_supabase_vectorstore

chain = init_supabase_vectorstore().as_retriever()

if __name__ == "__main__":
    from rich.pretty import pprint

    print()
    for doc in chain.invoke("edukacja"):
        print(f"{doc.metadata['kind']}: {doc.page_content}")

