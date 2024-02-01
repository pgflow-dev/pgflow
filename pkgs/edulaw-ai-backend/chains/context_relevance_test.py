from dotenv import load_dotenv
load_dotenv()

from langchain_openai.chat_models import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template("""
Twoim zadaniem jest ocenić, czy podany fragment tesktu ustawy oświatowej odnosi się do pytania.
Odpowiedz "T" jeśli jest bezpośrednio związany z tematem pytania.
Odpowiedz "N" jeśli nie jest bezpośrednio związany.

Fragment ustawy:
{context}

Pytanie:
{question}
""")

letters_to_token_ids = {
    "T": 51,
    "N": 45
}

model_name = "gpt-3.5-turbo-1106"
model = ChatOpenAI(model=model_name).bind(
    logit_bias={
        letters_to_token_ids["T"]: 100,
        letters_to_token_ids["N"]: 100
    },
    max_tokens=1
)

def cast_to_bool(input):
    if input == "T":
        return True
    elif input == "N":
        return False
    else:
        raise ValueError(f"Unknown output: {input}. Expecting 'T' or 'N'")

chain = prompt | model | StrOutputParser() | cast_to_bool

def pp_results(results, pass_value, label):
    count = len(results)
    passes = sum(1 for result in results if result == pass_value)
    ratio = passes / count

    print(f"{label}: {ratio:.2%} passed ({passes} / {count})")

if __name__ == '__main__':
    batches = 10

    good_context = "- art 18 pkt 7: indywidualny tok nauczania dla ucznia o specjalnych potrzebach edukacyjnych jest ustalany razem z rodzicem"
    bad_context = "- art 17 pkt 8: szkolna stołówka może być finansowana z budżetu szkoły",
    question = "Jakie dodatkowe wsparcie może udzielić szkoła uczniowi z zespołem aspergera?"

    good_input = dict(question=question, context=good_context)
    bad_input = dict(question=question, context=bad_context)

    good_inputs_batch = [good_input] * batches
    positive_results = chain.batch(good_inputs_batch)
    pp_results(results=positive_results, pass_value=True, label="Detecting GOOD content")

    bad_inputs_batch = [bad_input] * batches
    negative_results = chain.batch(bad_inputs_batch)
    pp_results(results=negative_results, pass_value=False, label="Detecting BAD content")
