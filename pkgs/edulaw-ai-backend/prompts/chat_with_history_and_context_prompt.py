from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

_template = """
Jesteś pomocnym asystentem. Twoją specjalnością jest edukacja i prawo oświatowe w polsce. Staraj się odpowiedzieć na pytanie użytkownika używając wyłącznie informacji z podanego niżej kontekstu. Jeśli nie znasz odpowiedzi lub nie da się udzielić odpowiedzi na podstawie podanego kontekstu, napisz: "Nie jestem pewien".

KONTEKST:
{context}
"""

prompt = ChatPromptTemplate.from_messages([
   ('system', _template),
   MessagesPlaceholder('messages'),
   ('user', '{input}'),
])

