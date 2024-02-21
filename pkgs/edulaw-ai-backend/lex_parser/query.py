import os

from dotenv import load_dotenv

load_dotenv()

from app.utils import init_supabase_vectorstore

if __name__ == '__main__':
    from app.prefixed_embeddings import PrefixedEmbeddings
    from rich.pretty import pprint

    store = init_supabase_vectorstore()

    def kind(kind: str):
        return dict(
            search_kwargs=dict(
                filter=dict(kind=kind),
                score_threshold=0.75
            ),
            search_type='similarity_score_threshold'
        )

    pprint(kind('Chapter'))

    chapters = store.as_retriever(**kind('Chapter'))
    articles = store.as_retriever(**kind('Article'))
    paragraphs = store.as_retriever(**kind('Paragraph'))
    points = store.as_retriever(**kind('Point'))
    subpoints = store.as_retriever(**kind('Subpoint'))

    question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"

    def pp_content(docs):
        pprint([d.page_content for d in docs])

    while True:
        if question == "exit":
            break

        print("CHAPTERS:")
        pp_content(chapters.invoke(question))

        print("ARTICLES:")
        pp_content(articles.invoke(question))

        print("PARAGRAPHS:")
        pp_content(paragraphs.invoke(question))

        print("POINTS:")
        pp_content(points.invoke(question))

        print("SUBPOINTS:")
        pp_content(subpoints.invoke(question))

        print()
        print()
        print()
        print()
        print()
        print()

        question = input("Question: ")
