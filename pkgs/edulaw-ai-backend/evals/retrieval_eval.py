from chains.context_relevance_test import chain as context_relevance_test, pp_results
from chains.hierarchical_retriever import kind_retriever
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
import os

if __name__ == "__main__":
    question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"

    eval_chain = (
        {"question": RunnablePassthrough(),
         "context": kind_retriever(kind='Paragraph', threshold=0.8)
                    | (lambda items: items[0])}
        | context_relevance_test
    )

    batch_chain = (
        RunnableLambda(lambda input: [input['question']] * input['batches'])
        | RunnableLambda(eval_chain.batch)
        | RunnableLambda(lambda results: pp_results(results=results, pass_value=True, label="Detecting GOOD content"))
    )

    batches = int(os.environ.get('BATCHES', 1))

    print("Starting evaluation...")
    results = batch_chain.invoke(dict(question=question, batches=batches))
    print("DONE!")

    from rich.pretty import pprint
    pprint(results)
